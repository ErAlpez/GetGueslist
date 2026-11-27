import "server-only";

import { randomUUID } from "node:crypto";
import { AttendeeCategory, BackgroundJobStatus, BackgroundJobType, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { sendAuthEmail } from "@/lib/email";
import { exclusiveDateEnd, parseDateParam } from "@/lib/date-range";
import { attendeeCategories } from "@/lib/attendee-categories";
import { createTicketToken, hashTicketToken } from "@/lib/tickets";
import { getPrisma } from "@/lib/prisma";
import { getBackgroundJobBatchEnd } from "@/lib/background-job-batches";
import { uploadSupabaseObject, deleteSupabaseObject, downloadSupabaseObject } from "@/lib/supabase-storage";

const guestRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string(),
  company: z.string(),
  position: z.string(),
  category: z.enum(attendeeCategories),
  error: z.string().nullable(),
});

const importPayloadSchema = z.object({
  eventId: z.string().min(1),
  rows: z.array(guestRowSchema).min(1).max(1_000),
});

const invitationPayloadSchema = z.object({
  eventId: z.string().min(1),
  recipients: z.array(z.email()).min(1).max(200),
  subject: z.string().min(1).max(200),
  message: z.string().max(3_000),
});

const exportPayloadSchema = z.object({
  eventId: z.string().min(1).optional(),
  query: z.string().max(200),
  category: z.enum(Object.values(AttendeeCategory) as [AttendeeCategory, ...AttendeeCategory[]]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  canViewTicketStatus: z.boolean(),
});

const jobStatusSchema = z.enum(["PENDING", "PROCESSING", "COMPLETED", "FAILED"]);
const staleJobMs = 5 * 60 * 1_000;
const jobRetentionMs = 24 * 60 * 60 * 1_000;
const workerTimeBudgetMs = 40_000;
const invitationBatchSize = 10;

export type BackgroundJobView = {
  id: string;
  status: z.infer<typeof jobStatusSchema>;
  progress: number;
  result: unknown;
  error: string | null;
};

export type GuestCsvImportResult = {
  importedCount: number;
  skippedRows: Array<{ rowNumber: number; message: string }>;
};

export type ExportFilters = {
  eventId?: string;
  query: string;
  category?: AttendeeCategory;
  from?: string;
  to?: string;
  canViewTicketStatus: boolean;
};

export async function enqueueGuestCsvImport(
  workspaceId: string,
  createdById: string,
  eventId: string,
  rows: z.infer<typeof guestRowSchema>[],
) {
  const worker = getBackgroundWorkerConfig();
  const parsed = importPayloadSchema.safeParse({ eventId, rows });
  if (!parsed.success) throw new Error("The CSV import data is invalid.");

  const job = await getPrisma().backgroundJob.create({
    data: {
      workspaceId,
      createdById,
      type: BackgroundJobType.GUEST_CSV_IMPORT,
      payload: parsed.data,
    },
    select: { id: true },
  });
  scheduleBackgroundJobWorker(worker);
  return job;
}

export async function enqueueEventInvitations(
  workspaceId: string,
  createdById: string,
  payload: z.infer<typeof invitationPayloadSchema>,
) {
  const worker = getBackgroundWorkerConfig();
  const parsed = invitationPayloadSchema.safeParse(payload);
  if (!parsed.success) throw new Error("The invitation details are invalid.");

  const job = await getPrisma().backgroundJob.create({
    data: {
      workspaceId,
      createdById,
      type: BackgroundJobType.EVENT_INVITATIONS,
      payload: parsed.data,
    },
    select: { id: true },
  });
  scheduleBackgroundJobWorker(worker);
  return job;
}

export async function enqueueAttendeeExport(
  workspaceId: string,
  createdById: string,
  filters: ExportFilters,
) {
  const worker = getBackgroundWorkerConfig();
  const parsed = exportPayloadSchema.safeParse(filters);
  if (!parsed.success) throw new Error("The export filters are invalid.");

  const job = await getPrisma().backgroundJob.create({
    data: {
      workspaceId,
      createdById,
      type: BackgroundJobType.ATTENDEE_EXPORT,
      payload: parsed.data,
      expiresAt: new Date(Date.now() + jobRetentionMs),
    },
    select: { id: true },
  });
  scheduleBackgroundJobWorker(worker);
  return job;
}

export async function getBackgroundJobView(id: string, workspaceId: string, createdById: string) {
  const job = await getPrisma().backgroundJob.findFirst({
    where: { id, workspaceId, createdById },
    select: { id: true, status: true, progress: true, result: true, error: true },
  });
  if (!job) return null;

  return {
    ...job,
    status: jobStatusSchema.parse(job.status),
    result: job.result,
  } satisfies BackgroundJobView;
}

export async function getAttendeeExportDownload(jobId: string, workspaceId: string, createdById: string) {
  const job = await getPrisma().backgroundJob.findFirst({
    where: { id: jobId, workspaceId, createdById, type: BackgroundJobType.ATTENDEE_EXPORT },
    select: { status: true, result: true, expiresAt: true },
  });
  if (!job || job.status !== BackgroundJobStatus.COMPLETED || !job.expiresAt || job.expiresAt <= new Date()) {
    return null;
  }

  const result = z.object({ downloadPath: z.string(), eventId: z.string().nullable() }).safeParse(job.result);
  const expectedPrefix = `exports/${workspaceId}/${jobId}.csv`;
  if (!result.success || result.data.downloadPath !== expectedPrefix) return null;
  return {
    bytes: await downloadSupabaseObject(result.data.downloadPath),
    eventId: result.data.eventId,
  };
}

export async function runBackgroundJobWorker() {
  const prisma = getPrisma();
  const startedAt = Date.now();
  let processed = 0;

  await failRepeatedlyStaleJobs(prisma);
  await removeExpiredExports(prisma);

  while (Date.now() - startedAt < workerTimeBudgetMs) {
    const job = await claimNextJob(prisma);
    if (!job) break;

    try {
      switch (job.type) {
        case BackgroundJobType.GUEST_CSV_IMPORT:
          await processGuestCsvImport(job);
          break;
        case BackgroundJobType.EVENT_INVITATIONS:
          await processEventInvitations(job);
          break;
        case BackgroundJobType.ATTENDEE_EXPORT:
          await processAttendeeExport(job);
          break;
        default:
          throw new Error("This background job type is not supported.");
      }
    } catch (error) {
      const message = getSafeJobError(job.type, error);
      const currentJob = await prisma.backgroundJob.findUnique({
        where: { id: job.id },
        select: { status: true },
      });
      if (currentJob?.status === BackgroundJobStatus.COMPLETED || currentJob?.status === BackgroundJobStatus.FAILED) {
        console.error(`Background job ${job.id} encountered an error after reaching a terminal status; preserving it.`, error);
      } else {
        console.error(`Background job ${job.id} failed.`, error);
        await prisma.backgroundJob.update({
          where: { id: job.id },
          data: {
            status: BackgroundJobStatus.FAILED,
            payload: Prisma.JsonNull,
            error: message,
            lockedAt: null,
            completedAt: new Date(),
          },
        });
      }
    }

    processed += 1;
  }

  const hasPending = await prisma.backgroundJob.count({
    where: {
      OR: [
        { status: BackgroundJobStatus.PENDING },
        { status: BackgroundJobStatus.PROCESSING, lockedAt: { lt: new Date(Date.now() - staleJobMs) } },
      ],
    },
  });
  return { processed, hasPending: hasPending > 0 };
}

export function scheduleBackgroundJobWorkerContinuation() {
  scheduleBackgroundJobWorker(getBackgroundWorkerConfig());
}

export function getBackgroundWorkerSecret() {
  const secret = process.env.CRON_SECRET
    ?? (process.env.NODE_ENV === "development" ? process.env.BETTER_AUTH_SECRET : undefined);
  return secret && secret.length >= 32 ? secret : null;
}

async function claimNextJob(prisma: ReturnType<typeof getPrisma>) {
  const staleBefore = new Date(Date.now() - staleJobMs);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = await prisma.backgroundJob.findFirst({
      where: {
        OR: [
          { status: BackgroundJobStatus.PENDING },
          { status: BackgroundJobStatus.PROCESSING, lockedAt: { lt: staleBefore } },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    if (!candidate) return null;

    const claim = await prisma.backgroundJob.updateMany({
      where: {
        id: candidate.id,
        status: candidate.status,
        ...(candidate.status === BackgroundJobStatus.PROCESSING ? { lockedAt: candidate.lockedAt } : {}),
      },
      data: {
        status: BackgroundJobStatus.PROCESSING,
        lockedAt: new Date(),
        attempts: { increment: 1 },
      },
    });
    if (claim.count === 1) return candidate;
  }

  return null;
}

async function failRepeatedlyStaleJobs(prisma: ReturnType<typeof getPrisma>) {
  const staleBefore = new Date(Date.now() - staleJobMs);
  await prisma.backgroundJob.updateMany({
    where: {
      status: BackgroundJobStatus.PROCESSING,
      lockedAt: { lt: staleBefore },
      attempts: { gte: 3 },
    },
    data: {
      status: BackgroundJobStatus.FAILED,
      payload: Prisma.JsonNull,
      error: "The background worker was interrupted repeatedly. Please try again.",
      lockedAt: null,
      completedAt: new Date(),
    },
  });
}

async function processGuestCsvImport(job: NonNullable<Awaited<ReturnType<typeof claimNextJob>>>) {
  const payload = importPayloadSchema.parse(job.payload);
  const prisma = getPrisma();
  const skippedSourceRows = payload.rows.flatMap((row) => row.error
    ? [{ rowNumber: row.rowNumber, message: row.error }]
    : []);

  const result = await prisma.$transaction(async (transaction) => {
    const event = await transaction.event.findFirst({
      where: { id: payload.eventId, workspaceId: job.workspaceId, archivedAt: null },
      select: { id: true, capacity: true },
    });
    if (!event) throw new BackgroundJobError("This event is no longer available in your workspace.");

    const subscription = await transaction.subscription.findUnique({
      where: { workspaceId: job.workspaceId },
      include: { plan: { select: { attendeePerEventLimit: true } } },
    });
    if (!subscription) throw new BackgroundJobError("This workspace does not have a subscription plan.");

    const currentCount = await transaction.eventRegistration.count({ where: { eventId: event.id } });
    let availableSlots = Math.min(
      event.capacity === null ? Number.POSITIVE_INFINITY : Math.max(0, event.capacity - currentCount),
      subscription.plan.attendeePerEventLimit === null
        ? Number.POSITIVE_INFINITY
        : Math.max(0, subscription.plan.attendeePerEventLimit - currentCount),
    );
    const validRows = payload.rows.filter((row) => row.error === null);
    const emails = validRows.map((row) => row.email);
    const existingAttendees = emails.length
      ? await transaction.attendee.findMany({
          where: { workspaceId: job.workspaceId, email: { in: emails, mode: "insensitive" } },
          select: { id: true, email: true },
        })
      : [];
    const attendeesByEmail = new Map(existingAttendees.flatMap((attendee) => attendee.email
      ? [[attendee.email.toLowerCase(), attendee.id] as const]
      : []));
    const alreadyRegistered = emails.length
      ? await transaction.eventRegistration.findMany({
          where: { eventId: event.id, attendee: { email: { in: emails, mode: "insensitive" } } },
          select: { attendee: { select: { email: true } } },
        })
      : [];
    const registeredEmails = new Set(alreadyRegistered.map((registration) => registration.attendee.email?.toLowerCase()));
    const importableRows: z.infer<typeof guestRowSchema>[] = [];
    const skippedRows = [...skippedSourceRows];

    for (const row of validRows) {
      if (registeredEmails.has(row.email)) {
        skippedRows.push({ rowNumber: row.rowNumber, message: "This guest is already registered for the event." });
      } else if (availableSlots <= 0) {
        skippedRows.push({ rowNumber: row.rowNumber, message: "The event or plan attendee limit has been reached." });
      } else {
        availableSlots -= 1;
        importableRows.push(row);
      }
    }

    if (importableRows.length === 0) {
      const completed = { importedCount: 0, skippedRows };
      await completeJob(transaction, job.id, completed);
      return completed;
    }

    let ticketType = await transaction.ticketType.findFirst({
      where: { eventId: event.id, name: "General admission" },
      select: { id: true },
    });
    if (!ticketType) {
      ticketType = await transaction.ticketType.create({
        data: { eventId: event.id, name: "General admission" },
        select: { id: true },
      });
    }

    const newAttendees = importableRows
      .filter((row) => !attendeesByEmail.has(row.email))
      .map((row) => ({
        id: randomUUID(),
        workspaceId: job.workspaceId,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
        phone: row.phone || null,
        company: row.company || null,
        position: row.position || null,
      }));
    if (newAttendees.length) {
      await transaction.attendee.createMany({ data: newAttendees });
      for (const attendee of newAttendees) attendeesByEmail.set(attendee.email, attendee.id);
    }

    const registrationRows = importableRows.map((row) => {
      const attendeeId = attendeesByEmail.get(row.email);
      if (!attendeeId) throw new BackgroundJobError("Could not resolve an imported guest record.");
      return { row, attendeeId, registrationId: randomUUID(), ticketId: randomUUID() };
    });
    const registrationsCreated = await transaction.eventRegistration.createMany({
      data: registrationRows.map(({ row, attendeeId, registrationId }) => ({
        id: registrationId,
        eventId: event.id,
        attendeeId,
        ticketTypeId: ticketType.id,
        category: row.category,
        rsvpStatus: "ACCEPTED",
        registrationSource: "csv_import",
      })),
    });
    if (registrationsCreated.count !== registrationRows.length) {
      throw new BackgroundJobError("Could not create all guest registrations.");
    }

    const ticketsCreated = await transaction.ticket.createMany({
      data: registrationRows.map(({ registrationId, ticketId }) => ({
        id: ticketId,
        registrationId,
        tokenHash: hashTicketToken(createTicketToken(ticketId)),
      })),
    });
    if (ticketsCreated.count !== registrationRows.length) {
      throw new BackgroundJobError("Could not create all guest tickets.");
    }

    await transaction.activityLog.createMany({
      data: registrationRows.map(({ row, registrationId }) => ({
        id: randomUUID(),
        workspaceId: job.workspaceId,
        actorId: job.createdById,
        action: "attendee.registered",
        entityType: "registration",
        entityId: registrationId,
        metadata: { eventId: event.id, category: row.category, source: "csv_import" },
      })),
    });

    const completed = { importedCount: importableRows.length, skippedRows };
    await completeJob(transaction, job.id, completed);
    return completed;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  for (const path of [
    "/dashboard/attendees",
    "/dashboard/tickets",
    "/dashboard/check-in",
    "/dashboard/reports",
    `/dashboard/events/${payload.eventId}`,
  ]) {
    revalidatePath(path);
  }

  return result;
}

async function completeJob(transaction: Prisma.TransactionClient, id: string, result: GuestCsvImportResult) {
  await transaction.backgroundJob.update({
    where: { id },
    data: {
      status: BackgroundJobStatus.COMPLETED,
      payload: Prisma.JsonNull,
      result,
      error: null,
      progress: 100,
      lockedAt: null,
      completedAt: new Date(),
    },
  });
}

async function processEventInvitations(job: NonNullable<Awaited<ReturnType<typeof claimNextJob>>>) {
  const payload = invitationPayloadSchema.parse(job.payload);
  const prisma = getPrisma();
  const event = await prisma.event.findFirst({
    where: { id: payload.eventId, workspaceId: job.workspaceId, archivedAt: null },
    select: { id: true, name: true },
  });
  if (!event) throw new BackgroundJobError("This event is no longer available in your workspace.");

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  const registrationUrl = `${baseUrl.replace(/\/$/, "")}/register/${event.id}`;
  const end = getBackgroundJobBatchEnd(job.processedItems, payload.recipients.length, invitationBatchSize);
  let sentCount = 0;
  for (let offset = job.processedItems; offset < end; offset += 5) {
    const batch = payload.recipients.slice(offset, Math.min(offset + 5, end));
    const results = await Promise.all(batch.map(async (recipient) => {
      try {
        await sendAuthEmail({
          to: recipient,
          subject: `${payload.subject} — ${event.name}`,
          url: registrationUrl,
          message: payload.message,
        });
        return true;
      } catch {
        return false;
      }
    }));
    sentCount += results.filter(Boolean).length;
  }

  const previousResult = z.object({
    sentCount: z.number().int().nonnegative().default(0),
    failedCount: z.number().int().nonnegative().default(0),
  }).parse(job.result ?? {});
  const processedItems = end;
  const failedCount = previousResult.failedCount + (end - job.processedItems - sentCount);
  const totalSent = previousResult.sentCount + sentCount;
  const complete = processedItems >= payload.recipients.length;

  if (complete && totalSent > 0) {
    await prisma.eventModule.upsert({
      where: { eventId_key: { eventId: event.id, key: "invitations" } },
      create: {
        eventId: event.id,
        key: "invitations",
        enabled: true,
        settings: {
          recipients: payload.recipients,
          subject: payload.subject,
          message: payload.message,
          sentAt: new Date().toISOString(),
          sent: totalSent,
        },
      },
      update: {
        enabled: true,
        settings: {
          recipients: payload.recipients,
          subject: payload.subject,
          message: payload.message,
          sentAt: new Date().toISOString(),
          sent: totalSent,
        },
      },
    });
  }

  await prisma.backgroundJob.update({
    where: { id: job.id },
    data: {
      status: complete
        ? totalSent > 0 ? BackgroundJobStatus.COMPLETED : BackgroundJobStatus.FAILED
        : BackgroundJobStatus.PENDING,
      payload: complete ? Prisma.JsonNull : payload,
      result: { sentCount: totalSent, failedCount },
      error: complete && totalSent === 0 ? "No invitations could be sent. Check email configuration." : null,
      progress: Math.round((processedItems / payload.recipients.length) * 100),
      processedItems,
      lockedAt: null,
      completedAt: complete ? new Date() : null,
    },
  });

  if (complete && totalSent > 0) revalidatePath(`/dashboard/events/${event.id}`);
}

async function processAttendeeExport(job: NonNullable<Awaited<ReturnType<typeof claimNextJob>>>) {
  const filters = exportPayloadSchema.parse(job.payload);
  const csv = await buildAttendeeCsv(job.workspaceId, filters);
  const path = `exports/${job.workspaceId}/${job.id}.csv`;
  await uploadSupabaseObject(path, new TextEncoder().encode(`\uFEFF${csv}`), "text/csv; charset=utf-8");
  await getPrisma().backgroundJob.update({
    where: { id: job.id },
    data: {
      status: BackgroundJobStatus.COMPLETED,
      payload: Prisma.JsonNull,
      result: { downloadPath: path, eventId: filters.eventId ?? null },
      error: null,
      progress: 100,
      lockedAt: null,
      completedAt: new Date(),
    },
  });
}

async function buildAttendeeCsv(workspaceId: string, filters: z.infer<typeof exportPayloadSchema>) {
  const from = filters.from ? parseDateParam(filters.from) : undefined;
  const to = filters.to ? parseDateParam(filters.to) : undefined;
  if (from === null || to === null || (from && to && from > to)) {
    throw new BackgroundJobError("The export date filters are invalid. Please adjust them and try again.");
  }

  const registrations = await getPrisma().eventRegistration.findMany({
    where: {
      event: { workspaceId, ...(filters.eventId ? { id: filters.eventId } : {}) },
      ...(filters.category ? { category: filters.category } : {}),
      ...((from || to) ? {
        registeredAt: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lt: exclusiveDateEnd(to) } : {}),
        },
      } : {}),
      ...(filters.query ? {
        attendee: {
          OR: [
            { firstName: { contains: filters.query, mode: "insensitive" } },
            { lastName: { contains: filters.query, mode: "insensitive" } },
            { email: { contains: filters.query, mode: "insensitive" } },
          ],
        },
      } : {}),
    },
    include: {
      attendee: true,
      event: { select: { name: true } },
      ticket: {
        select: {
          displayId: true,
          status: true,
          attendanceLogs: {
            where: { action: "CHECK_IN" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      },
    },
    orderBy: { registeredAt: "asc" },
  });

  const csvCell = (value: unknown) => {
    const text = String(value ?? "");
    const protectedText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
    return `"${protectedText.replaceAll('"', '""')}"`;
  };
  const rows = [
    [
      "First name", "Last name", "Email", "Phone", "Company", "Position", "Event", "Category",
      "RSVP", "Meal", "Sessions", "Ticket ID",
      ...(filters.canViewTicketStatus ? ["Ticket status"] : []),
      "Registration date", "Check-in time", "Age", "Gender",
    ],
    ...registrations.map((registration) => [
      registration.attendee.firstName,
      registration.attendee.lastName,
      registration.attendee.email,
      registration.attendee.phone,
      registration.attendee.company,
      registration.attendee.position,
      registration.event.name,
      registration.category,
      registration.rsvpStatus,
      registration.mealChoice,
      (registration.sessionIds ?? []).join("; "),
      registration.ticket?.displayId ?? "",
      ...(filters.canViewTicketStatus ? [registration.ticket?.status ?? ""] : []),
      registration.registeredAt.toISOString(),
      registration.ticket?.attendanceLogs[0]?.createdAt.toISOString() ?? "",
      registration.age,
      registration.gender,
    ]),
  ];

  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

async function removeExpiredExports(prisma: ReturnType<typeof getPrisma>) {
  const expiredJobs = await prisma.backgroundJob.findMany({
    where: {
      type: BackgroundJobType.ATTENDEE_EXPORT,
      expiresAt: { lte: new Date() },
    },
    select: { id: true, workspaceId: true, result: true },
    take: 1,
  });

  for (const job of expiredJobs) {
    const result = z.object({ downloadPath: z.string(), eventId: z.string().nullable() }).safeParse(job.result);
    if (result.success && result.data.downloadPath === `exports/${job.workspaceId}/${job.id}.csv`) {
      try {
        await deleteSupabaseObject(result.data.downloadPath);
      } catch (error) {
        console.error(`Could not remove expired export for job ${job.id}.`, error);
        continue;
      }
    }
    await prisma.backgroundJob.delete({ where: { id: job.id } });
  }
}

function getSafeJobError(type: BackgroundJobType, error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
    return type === BackgroundJobType.GUEST_CSV_IMPORT
      ? "The attendee list changed during import. Preview the CSV again and retry."
      : "The data changed while this job was running. Please retry.";
  }
  if (
    type === BackgroundJobType.GUEST_CSV_IMPORT
    && error instanceof Prisma.PrismaClientKnownRequestError
    && error.code === "P2002"
  ) {
    return "A guest was added at the same time. Preview the CSV again to check for duplicates.";
  }
  if (error instanceof BackgroundJobError) return error.message;
  if (type === BackgroundJobType.ATTENDEE_EXPORT) return "The CSV export could not be prepared. Please try again.";
  return "The job could not be completed. Please try again.";
}

class BackgroundJobError extends Error {}

function getBackgroundWorkerConfig() {
  const secret = getBackgroundWorkerSecret();
  const configuredOrigin = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL
      ?? process.env.BETTER_AUTH_URL
      ?? (process.env.NODE_ENV === "development" ? "http://localhost:3000" : undefined);
  if (!secret || !configuredOrigin) {
    throw new BackgroundJobError("Background job processing is not configured. Contact your administrator.");
  }

  const origin = new URL(configuredOrigin);
  if (
    (origin.protocol !== "https:" && !(process.env.NODE_ENV === "development" && origin.protocol === "http:"))
    || origin.username
    || origin.password
  ) {
    throw new BackgroundJobError("Background job processing has an invalid application URL.");
  }

  return {
    secret,
    url: new URL("/api/cron/background-jobs", origin),
  };
}

function scheduleBackgroundJobWorker(config: ReturnType<typeof getBackgroundWorkerConfig>) {
  after(async () => {
    try {
      const response = await fetch(config.url, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${config.secret}` },
        signal: AbortSignal.timeout(55_000),
      });
      if (!response.ok) {
        console.error(`Background job worker kickoff failed with HTTP ${response.status}.`);
      }
      await response.text();
    } catch (error) {
      console.error("Background job worker kickoff failed.", error);
    }
  });
}
