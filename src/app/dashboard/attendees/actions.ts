"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createTicketToken, hashTicketToken } from "@/lib/tickets";
import { getPrisma } from "@/lib/prisma";
import { getWorkspaceContext } from "@/lib/workspace";
import { parseGuestCsv, type ParsedGuestCsvRow } from "@/lib/guest-csv";
import {
  attendeeInput,
  createGuestRegistration,
  rolesAllowedToRegister,
} from "@/lib/guest-registration";

export type AttendeeFormState = {
  error?: string;
};

type GuestCsvImportIssue = {
  rowNumber: number;
  message: string;
};

export type GuestCsvPreviewState = {
  error?: string;
  eventId?: string;
  rows?: ParsedGuestCsvRow[];
};

export type GuestCsvImportState = {
  error?: string;
  importedCount?: number;
  skippedRows?: GuestCsvImportIssue[];
};

async function getGuestCsvImportInput(formData: FormData) {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");
  if (!rolesAllowedToRegister.has(context.membership.role)) {
    return { error: "You don’t have permission to add guests in this workspace." } as const;
  }

  const eventId = formData.get("eventId");
  const file = formData.get("file");
  if (typeof eventId !== "string" || !eventId) {
    return { error: "Choose an event for this import." } as const;
  }
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV file to continue." } as const;
  }
  if (file.size > 900_000) {
    return { error: "CSV files must be 900 KB or smaller." } as const;
  }

  const parsed = parseGuestCsv(await file.text());
  if (!parsed.rows) return { error: parsed.error ?? "Could not read the CSV file." } as const;
  return { context, eventId, rows: parsed.rows } as const;
}

function getAvailableGuestSlots(
  eventCapacity: number | null,
  planAttendeeLimit: number | null,
  currentCount: number,
) {
  const eventSlots = eventCapacity === null ? Number.POSITIVE_INFINITY : Math.max(0, eventCapacity - currentCount);
  const planSlots = planAttendeeLimit === null ? Number.POSITIVE_INFINITY : Math.max(0, planAttendeeLimit - currentCount);
  return Math.min(eventSlots, planSlots);
}

export async function previewGuestCsvImportAction(formData: FormData): Promise<GuestCsvPreviewState> {
  const input = await getGuestCsvImportInput(formData);
  if ("error" in input) return input;

  const prisma = getPrisma();
  const event = await prisma.event.findFirst({
    where: { id: input.eventId, workspaceId: input.context.workspace.id, archivedAt: null },
    select: { id: true, capacity: true },
  });
  if (!event) return { error: "This event isn’t available in your workspace." };

  const subscription = await prisma.subscription.findUnique({
    where: { workspaceId: input.context.workspace.id },
    include: { plan: { select: { attendeePerEventLimit: true } } },
  });
  if (!subscription) throw new Error("This workspace does not have a subscription plan.");

  const currentCount = await prisma.eventRegistration.count({ where: { eventId: event.id } });
  const validEmails = input.rows.filter((row) => row.error === null).map((row) => row.email);
  const alreadyRegistered = validEmails.length
    ? await prisma.eventRegistration.findMany({
        where: {
          eventId: event.id,
          attendee: { email: { in: validEmails, mode: "insensitive" } },
        },
        select: { attendee: { select: { email: true } } },
      })
    : [];
  const registeredEmails = new Set(alreadyRegistered.map((registration) => registration.attendee.email?.toLowerCase()));
  let availableSlots = getAvailableGuestSlots(event.capacity, subscription.plan.attendeePerEventLimit, currentCount);

  const rows = input.rows.map((row) => {
    if (row.error) return row;
    if (registeredEmails.has(row.email)) {
      return { ...row, error: "This guest is already registered for the event." };
    }
    if (availableSlots <= 0) {
      return { ...row, error: "The event or plan attendee limit has been reached." };
    }
    availableSlots -= 1;
    return row;
  });

  return { eventId: event.id, rows };
}

export async function importGuestsFromCsvAction(formData: FormData): Promise<GuestCsvImportState> {
  const input = await getGuestCsvImportInput(formData);
  if ("error" in input) return input;

  const prisma = getPrisma();
  const parsedIssues: GuestCsvImportIssue[] = input.rows.flatMap((row) => row.error
    ? [{ rowNumber: row.rowNumber, message: row.error }]
    : []);

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const event = await transaction.event.findFirst({
        where: { id: input.eventId, workspaceId: input.context.workspace.id, archivedAt: null },
        select: { id: true, capacity: true },
      });
      if (!event) return { error: "This event isn’t available in your workspace." };

      const subscription = await transaction.subscription.findUnique({
        where: { workspaceId: input.context.workspace.id },
        include: { plan: { select: { attendeePerEventLimit: true } } },
      });
      if (!subscription) throw new Error("This workspace does not have a subscription plan.");

      const currentCount = await transaction.eventRegistration.count({ where: { eventId: event.id } });
      let availableSlots = getAvailableGuestSlots(event.capacity, subscription.plan.attendeePerEventLimit, currentCount);
      const validRows = input.rows.filter((row) => row.error === null);
      const emails = validRows.map((row) => row.email);
      const existingAttendees = emails.length
        ? await transaction.attendee.findMany({
            where: {
              workspaceId: input.context.workspace.id,
              email: { in: emails, mode: "insensitive" },
            },
            select: { id: true, email: true },
          })
        : [];
      const attendeesByEmail = new Map(existingAttendees.flatMap((attendee) => attendee.email
        ? [[attendee.email.toLowerCase(), attendee.id] as const]
        : []));
      const alreadyRegistered = emails.length
        ? await transaction.eventRegistration.findMany({
            where: {
              eventId: event.id,
              attendee: { email: { in: emails, mode: "insensitive" } },
            },
            select: { attendee: { select: { email: true } } },
          })
        : [];
      const registeredEmails = new Set(alreadyRegistered.map((registration) => registration.attendee.email?.toLowerCase()));
      const importableRows: ParsedGuestCsvRow[] = [];
      const skippedRows = [...parsedIssues];

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
        return { importedCount: 0, skippedRows };
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
          workspaceId: input.context.workspace.id,
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
        if (!attendeeId) throw new Error("Could not resolve an imported guest record.");
        return {
          row,
          attendeeId,
          registrationId: randomUUID(),
          ticketId: randomUUID(),
        };
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
        throw new Error("Could not create all guest registrations.");
      }

      const ticketsCreated = await transaction.ticket.createMany({
        data: registrationRows.map(({ registrationId, ticketId }) => ({
          id: ticketId,
          registrationId,
          tokenHash: hashTicketToken(createTicketToken(ticketId)),
        })),
      });
      if (ticketsCreated.count !== registrationRows.length) {
        throw new Error("Could not create all guest tickets.");
      }

      await transaction.activityLog.createMany({
        data: registrationRows.map(({ row, registrationId }) => ({
          id: randomUUID(),
          workspaceId: input.context.workspace.id,
          actorId: input.context.user.id,
          action: "attendee.registered",
          entityType: "registration",
          entityId: registrationId,
          metadata: { eventId: event.id, category: row.category, source: "csv_import" },
        })),
      });

      return { importedCount: importableRows.length, skippedRows };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if ("error" in result) return result;

    for (const path of [
      "/dashboard/attendees",
      "/dashboard/tickets",
      "/dashboard/check-in",
      "/dashboard/reports",
      `/dashboard/events/${input.eventId}`,
    ]) {
      revalidatePath(path);
    }
    return result;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { error: "The attendee list changed during import. Preview the CSV again and retry." };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "A guest was added at the same time. Preview the CSV again to check for duplicates." };
    }
    throw error;
  }
}

export async function registerAttendeeAction(
  _previousState: AttendeeFormState,
  formData: FormData,
): Promise<AttendeeFormState> {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");
  if (!rolesAllowedToRegister.has(context.membership.role)) {
    return { error: "You don’t have permission to add guests in this workspace." };
  }

  const parsed = attendeeInput.safeParse({
    eventId: formData.get("eventId"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    age: formData.get("age") ?? "",
    gender: formData.get("gender") ?? "",
    category: formData.get("category"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the guest details and try again." };

  const result = await createGuestRegistration(parsed.data, context.workspace.id, context.user.id);
  if ("error" in result) return { error: result.error };
  redirect(`/dashboard/tickets?event=${parsed.data.eventId}&issued=${result.ticketId}`);
}
