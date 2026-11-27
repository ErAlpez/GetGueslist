"use server";

import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { EventStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { localDateTimeToUtc, utcToLocalDateTime } from "@/lib/datetime";
import { getAutomatedFollowupScheduledAt } from "@/lib/automated-followup-schedule";
import {
  detectEventAttachmentContentType,
  maxEventAttachmentBytes,
  maxEventAttachmentsPerEvent,
  normalizeEventAttachmentOriginalFileName,
  normalizeEventAttachmentFileName,
} from "@/lib/event-attachment";
import {
  deleteSupabaseObject,
  downloadSupabaseObject,
  uploadSupabaseObject,
} from "@/lib/supabase-storage";
import { eventLogoInputPrefix, eventLogoPrefix, maxEventLogoDataLength } from "@/lib/event-logo";
import { convertImageToAvif } from "@/lib/image-optimization";
import { getPrisma } from "@/lib/prisma";
import { readRegistrationQuestionOptions, registrationQuestionTypes } from "@/lib/registration-form";
import { getWorkspaceContext } from "@/lib/workspace";
import { workspaceRoleHasPermission } from "@/lib/workspace-roles";
import { workspaceHasFeature } from "@/lib/plan-features";
import { enqueueEventInvitations } from "@/lib/background-jobs";

export type EventFormState = {
  error?: string;
};

export type RegistrationFormState = {
  error?: string;
  success?: string;
};

export type EventCheckpointState = {
  error?: "invalid" | "duplicate" | "capacity" | "missing";
  success?: boolean;
};

export type EventLogoState = {
  error?: string;
  success?: string;
  logo?: string | null;
};

export type EventAttachmentActionState = {
  error?: string;
  success?: string;
};

export type EventModuleState = {
  error?: string;
  jobId?: string;
  success?: string;
};

const registrationQuestionInput = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(2, "Question labels must have at least 2 characters.").max(160),
  type: z.enum(registrationQuestionTypes),
  required: z.boolean(),
  options: z.array(z.string().max(80)).max(16),
});

const eventInput = z.object({
  name: z.string().trim().min(2, "Enter an event name.").max(120, "Event names must be 120 characters or fewer."),
  description: z.string().trim().max(10000, "Description is too long."),
  category: z.string().trim().min(1, "Choose an event category.").max(80),
  type: z.string().trim().min(1, "Choose an event type.").max(80),
  format: z.enum(["PHYSICAL", "VIRTUAL", "HYBRID"]),
  visibility: z.enum(["PUBLIC", "PRIVATE", "INVITE_ONLY"]),
  startsAt: z.string().min(1, "Choose a start date and time."),
  endsAt: z.string().min(1, "Choose an end date and time."),
  timezone: z.string().min(1, "Choose a timezone."),
  venue: z.string().trim().max(180),
  address: z.string().trim().max(500),
  capacity: z.string(),
  registrationDeadline: z.string(),
  organizerName: z.string().trim().max(120),
  contactEmail: z.union([z.literal(""), z.email()]),
  contactPhone: z.string().trim().max(40),
});

const checkpointInput = z.object({
  name: z.string().trim().min(2, "Checkpoint names must have at least 2 characters.").max(80),
  capacity: z.string().regex(/^\d*$/, "Capacity must be a positive whole number."),
});

const activeStatuses: EventStatus[] = ["PUBLISHED", "REGISTRATION_OPEN", "ONGOING"];
const eventModules = [
  { key: "guest_registration", enabled: true },
  { key: "qr_ticketing", enabled: true },
  { key: "attendance", enabled: true },
  { key: "invitations", enabled: false },
  { key: "rsvp", enabled: false },
  { key: "nfc_check_in", enabled: false },
  { key: "sessions", enabled: false },
  { key: "meals", enabled: false },
];

function readEventDetails(
  formData: FormData,
  existing?: { timezone: string; startsAt: Date; endsAt: Date; registrationDeadline: Date | null },
) {
  const parsed = eventInput.safeParse({
    name: formData.get("name"),
    description: formData.get("description"),
    category: formData.get("category"),
    type: formData.get("type"),
    format: formData.get("format"),
    visibility: formData.get("visibility"),
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    timezone: formData.get("timezone"),
    venue: formData.get("venue"),
    address: formData.get("address"),
    capacity: formData.get("capacity"),
    registrationDeadline: formData.get("registrationDeadline"),
    organizerName: formData.get("organizerName"),
    contactEmail: formData.get("contactEmail"),
    contactPhone: formData.get("contactPhone"),
  });

  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the event details and try again." } as const;

  const input = parsed.data;
  const capacity = input.capacity === "" ? null : Number(input.capacity);
  if (capacity !== null && (!Number.isSafeInteger(capacity) || capacity < 1)) {
    return { error: "Capacity must be a positive whole number." } as const;
  }

  let startsAt: Date;
  let endsAt: Date;
  let registrationDeadline: Date | null = null;
  try {
    const resolveDateTime = (value: string, previous: Date | null | undefined) => {
      const dateTimeValue = /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? `${value}T00:00`
        : value;
      if (previous && existing?.timezone === input.timezone) {
        const previousLocal = utcToLocalDateTime(previous, input.timezone);
        if (/^\d{4}-\d{2}-\d{2}$/.test(value)
          ? previousLocal.slice(0, 10) === value
          : previousLocal === value) {
          return previous;
        }
      }
      return localDateTimeToUtc(dateTimeValue, input.timezone);
    };
    startsAt = resolveDateTime(input.startsAt, existing?.startsAt);
    endsAt = existing?.timezone === input.timezone
      && /^\d{4}-\d{2}-\d{2}$/.test(input.endsAt)
      && existing
      && utcToLocalDateTime(existing.endsAt, input.timezone).slice(0, 10) === input.endsAt
      ? existing.endsAt
      : resolveDateTime(
          /^\d{4}-\d{2}-\d{2}$/.test(input.endsAt) ? `${input.endsAt}T23:59` : input.endsAt,
          existing?.endsAt,
        );
    if (/^\d{4}-\d{2}-\d{2}$/.test(input.endsAt) &&
        !(existing?.timezone === input.timezone &&
          existing &&
          utcToLocalDateTime(existing.endsAt, input.timezone).slice(0, 10) === input.endsAt)) {
      endsAt = new Date(endsAt.getTime() + 59_999);
    }
    registrationDeadline = input.registrationDeadline
      ? existing?.timezone === input.timezone
        && /^\d{4}-\d{2}-\d{2}$/.test(input.registrationDeadline)
        && existing.registrationDeadline
        && utcToLocalDateTime(existing.registrationDeadline, input.timezone).slice(0, 10) === input.registrationDeadline
        ? existing.registrationDeadline
        : resolveDateTime(
            /^\d{4}-\d{2}-\d{2}$/.test(input.registrationDeadline)
              ? `${input.registrationDeadline}T23:59`
              : input.registrationDeadline,
            existing?.registrationDeadline,
          )
      : null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(input.registrationDeadline) && registrationDeadline) {
      const unchangedDeadline = existing?.timezone === input.timezone &&
        existing.registrationDeadline &&
        utcToLocalDateTime(existing.registrationDeadline, input.timezone).slice(0, 10) === input.registrationDeadline;
      if (!unchangedDeadline) registrationDeadline = new Date(registrationDeadline.getTime() + 59_999);
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Enter valid event dates." } as const;
  }

  if (endsAt <= startsAt) return { error: "The end date must be after the start date." } as const;
  if (registrationDeadline) {
    const startDate = utcToLocalDateTime(startsAt, input.timezone).slice(0, 10);
    const deadlineDate = utcToLocalDateTime(registrationDeadline, input.timezone).slice(0, 10);
    if (deadlineDate > startDate) {
      return { error: "The registration deadline must be on or before the start date." } as const;
    }
  }

  return { input, capacity, startsAt, endsAt, registrationDeadline } as const;
}

export async function createEventAction(
  _previousState: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");
  if (!workspaceRoleHasPermission(context.membership.role, "events.manage")) {
    return { error: "You don’t have permission to create events in this workspace." };
  }

  const details = readEventDetails(formData);
  if ("error" in details) return { error: details.error };
  const { input, capacity, startsAt, endsAt, registrationDeadline } = details;
  const prisma = getPrisma();
  const slugBase = input.name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "event";
  const slug = `${slugBase}-${randomUUID().slice(0, 8)}`;

  const event = await prisma.$transaction(async (transaction) => {
    const subscription = await transaction.subscription.findUnique({
      where: { workspaceId: context.workspace.id },
      include: { plan: true },
    });
    if (!subscription) throw new Error("This workspace does not have a subscription plan.");

    if (subscription.plan.activeEventLimit !== null) {
      const activeEventCount = await transaction.event.count({
        where: {
          workspaceId: context.workspace.id,
          status: { in: activeStatuses },
          archivedAt: null,
        },
      });
      if (activeEventCount >= subscription.plan.activeEventLimit) {
        return null;
      }
    }

    const createdEvent = await transaction.event.create({
      data: {
        workspaceId: context.workspace.id,
        name: input.name,
        slug,
        description: input.description,
        category: input.category,
        type: input.type,
        format: input.format,
        visibility: input.visibility,
        status: "DRAFT",
        startsAt,
        endsAt,
        timezone: input.timezone,
        venue: input.venue || null,
        address: input.address || null,
        capacity,
        registrationDeadline,
        organizerName: input.organizerName || null,
        contactEmail: input.contactEmail || null,
        contactPhone: input.contactPhone || null,
        settings: { create: {} },
        modules: { create: eventModules },
        registrationForm: { create: { published: false } },
      },
    });

    await transaction.activityLog.create({
      data: {
        workspaceId: context.workspace.id,
        actorId: context.user.id,
        action: "event.created",
        entityType: "event",
        entityId: createdEvent.id,
      },
    });
    return createdEvent;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (!event) return { error: "Your plan’s active event limit has been reached. Upgrade your plan to publish another event." };
  redirect(`/dashboard/events/${event.id}`);
}

export async function updateEventAction(
  eventId: string,
  expectedUpdatedAt: string,
  _previousState: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");
  if (!workspaceRoleHasPermission(context.membership.role, "events.manage")) {
    return { error: "You don’t have permission to edit events in this workspace." };
  }

  const prisma = getPrisma();
  const event = await prisma.event.findFirst({
    where: { id: eventId, workspaceId: context.workspace.id, archivedAt: null },
  });
  if (!event) notFound();

  const expectedVersion = new Date(expectedUpdatedAt);
  if (Number.isNaN(expectedVersion.getTime()) || event.updatedAt.getTime() !== expectedVersion.getTime()) {
    return { error: "This event has changed. Reload the page before saving your changes." };
  }

  const details = readEventDetails(formData, event);
  if ("error" in details) return { error: details.error };
  const { input, capacity, startsAt, endsAt, registrationDeadline } = details;
  const updated = await prisma.$transaction(async (transaction) => {
    const result = await transaction.event.updateMany({
      where: { id: event.id, workspaceId: context.workspace.id, archivedAt: null, updatedAt: expectedVersion },
      data: {
        name: input.name,
        description: input.description,
        category: input.category,
        type: input.type,
        format: input.format,
        visibility: input.visibility,
        startsAt,
        endsAt,
        timezone: input.timezone,
        venue: input.venue || null,
        address: input.address || null,
        capacity,
        registrationDeadline,
        organizerName: input.organizerName || null,
        contactEmail: input.contactEmail || null,
        contactPhone: input.contactPhone || null,
      },
    });
    if (!result.count) return false;
    await transaction.automatedEmailDelivery.updateMany({
      where: {
        registration: { eventId: event.id },
        kind: "PRE_EVENT_REMINDER",
        status: { in: ["PENDING", "FAILED"] },
      },
      data: {
        scheduledAt: getAutomatedFollowupScheduledAt("PRE_EVENT_REMINDER", startsAt, endsAt),
        status: "PENDING",
        attempts: 0,
        nextAttemptAt: null,
        lockedAt: null,
        lastError: null,
      },
    });
    await transaction.automatedEmailDelivery.updateMany({
      where: {
        registration: { eventId: event.id },
        kind: "POST_EVENT_FOLLOWUP",
        status: { in: ["PENDING", "FAILED"] },
      },
      data: {
        scheduledAt: getAutomatedFollowupScheduledAt("POST_EVENT_FOLLOWUP", startsAt, endsAt),
        status: "PENDING",
        attempts: 0,
        nextAttemptAt: null,
        lockedAt: null,
        lastError: null,
      },
    });
    await transaction.activityLog.create({
      data: {
        workspaceId: context.workspace.id,
        actorId: context.user.id,
        action: "event.updated",
        entityType: "event",
        entityId: event.id,
      },
    });
    return true;
  });

  if (!updated) return { error: "This event has changed. Reload the page before saving your changes." };
  for (const path of ["/dashboard", "/dashboard/events", "/dashboard/attendees", "/dashboard/tickets", "/dashboard/check-in", "/dashboard/reports", `/dashboard/events/${event.id}`, `/register/${event.id}`]) {
    revalidatePath(path);
  }
  redirect(`/dashboard/events/${event.id}?updated=1`);
}

async function getEventActionContext() {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");
  if (!workspaceRoleHasPermission(context.membership.role, "events.manage")) {
    redirect("/dashboard/events?error=permission");
  }
  return context;
}

function getEventId(formData: FormData) {
  const eventId = formData.get("eventId");
  if (typeof eventId !== "string" || !eventId) redirect("/dashboard/events");
  return eventId;
}

async function restoreEventAttachmentObjects(
  attachments: Array<{ path: string; contentType: string; bytes: Uint8Array }>,
) {
  let failed = false;
  for (const attachment of attachments) {
    try {
      await uploadSupabaseObject(attachment.path, attachment.bytes, attachment.contentType);
    } catch (error) {
      failed = true;
      console.error("Event attachment restoration failed.", error);
    }
  }
  if (failed) throw new Error("One or more event attachments could not be restored to Supabase Storage.");
}

export async function publishEventAction(formData: FormData) {
  const context = await getEventActionContext();
  const eventId = getEventId(formData);
  if (!workspaceHasFeature(context.subscription, "event_lifecycle")) {
    redirect(`/dashboard/events/${eventId}?error=plan_feature`);
  }
  const prisma = getPrisma();

  const result = await prisma.$transaction(async (transaction) => {
    const event = await transaction.event.findFirst({
      where: { id: eventId, workspaceId: context.workspace.id, archivedAt: null },
    });
    if (!event) return "NOT_FOUND";
    if (event.status === "REGISTRATION_OPEN" || event.status === "PUBLISHED") return "PUBLISHED";
    if (
      event.status === "COMPLETED" ||
      event.status === "CANCELLED" ||
      event.endsAt <= new Date() ||
      (event.registrationDeadline && event.registrationDeadline <= new Date())
    ) {
      return "REGISTRATION_CLOSED";
    }

    const subscription = await transaction.subscription.findUnique({
      where: { workspaceId: context.workspace.id },
      include: { plan: true },
    });
    if (!subscription) throw new Error("This workspace does not have a subscription plan.");

    if (subscription.plan.activeEventLimit !== null) {
      const activeEventCount = await transaction.event.count({
        where: {
          workspaceId: context.workspace.id,
          status: { in: activeStatuses },
          archivedAt: null,
        },
      });
      if (activeEventCount >= subscription.plan.activeEventLimit) return "LIMIT_REACHED";
    }

    await transaction.event.update({
      where: { id: event.id },
      data: { status: "REGISTRATION_OPEN" },
    });
    await transaction.eventSettings.upsert({
      where: { eventId: event.id },
      create: { eventId: event.id, allowRegistration: true },
      update: { allowRegistration: true },
    });
    await transaction.registrationForm.upsert({
      where: { eventId: event.id },
      create: { eventId: event.id, published: true },
      update: { published: true },
    });
    await transaction.activityLog.create({
      data: {
        workspaceId: context.workspace.id,
        actorId: context.user.id,
        action: "event.published",
        entityType: "event",
        entityId: event.id,
      },
    });
    return "PUBLISHED";
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (result === "NOT_FOUND") notFound();
  if (result === "LIMIT_REACHED") redirect(`/dashboard/events/${eventId}?error=plan_limit`);
  if (result === "REGISTRATION_CLOSED") redirect(`/dashboard/events/${eventId}?error=registration_closed`);
  redirect(`/dashboard/events/${eventId}?published=1`);
}

export async function unpublishEventAction(formData: FormData) {
  const context = await getEventActionContext();
  const eventId = getEventId(formData);
  const prisma = getPrisma();
  const event = await prisma.event.findFirst({
    where: { id: eventId, workspaceId: context.workspace.id, archivedAt: null },
    select: { id: true },
  });
  if (!event) notFound();

  await prisma.$transaction([
    prisma.event.update({
      where: { id: event.id },
      data: { status: "DRAFT" },
    }),
    prisma.eventSettings.updateMany({
      where: { eventId: event.id },
      data: { allowRegistration: false },
    }),
    prisma.registrationForm.updateMany({
      where: { eventId: event.id },
      data: { published: false },
    }),
    prisma.activityLog.create({
      data: {
        workspaceId: context.workspace.id,
        actorId: context.user.id,
        action: "event.unpublished",
        entityType: "event",
        entityId: event.id,
      },
    }),
  ]);
  redirect(`/dashboard/events/${eventId}?unpublished=1`);
}

export async function saveEventLogoAction(
  _previousState: EventLogoState,
  formData: FormData,
): Promise<EventLogoState> {
  const context = await getEventActionContext();
  const eventId = getEventId(formData);
  const remove = formData.get("removeLogo") === "true";
  if (!remove && !workspaceHasFeature(context.subscription, "event_branding")) {
    return { error: "Event branding requires the Starter plan or higher." };
  }
  let logo: string | null = null;
  if (!remove) {
    const raw = formData.get("imageData");
    if (typeof raw !== "string" || raw.length > maxEventLogoDataLength ||
        !raw.startsWith(eventLogoInputPrefix) ||
        !/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
      return { error: "Choose a logo before saving." };
    }
    const encoded = raw.slice(eventLogoInputPrefix.length);
    const bytes = Buffer.from(encoded, "base64");
    if (encoded !== bytes.toString("base64") || bytes.length < 20 ||
        bytes.toString("ascii", 0, 4) !== "RIFF" ||
        bytes.readUInt32LE(4) !== bytes.length - 8 ||
        bytes.toString("ascii", 8, 12) !== "WEBP" ||
        !["VP8 ", "VP8L", "VP8X"].includes(bytes.toString("ascii", 12, 16))) {
      return { error: "That logo could not be saved. Choose another image." };
    }
    try {
      const avif = await convertImageToAvif(bytes, { maxDimension: 512, quality: 65 });
      logo = `${eventLogoPrefix}${avif.toString("base64")}`;
      if (logo.length > maxEventLogoDataLength) {
        return { error: "This image is too large after compression. Choose another image." };
      }
    } catch (error) {
      console.error("Event logo AVIF conversion failed.", error);
      return { error: "That logo could not be processed. Choose another image." };
    }
  }

  const prisma = getPrisma();
  const result = await prisma.$transaction(async (transaction) => {
    const event = await transaction.event.findFirst({
      where: { id: eventId, workspaceId: context.workspace.id, archivedAt: null },
      select: { id: true, settings: { select: { customBranding: true } } },
    });
    if (!event) return "NOT_FOUND";
    const existing = event.settings?.customBranding;
    if (existing !== null && existing !== undefined &&
        (typeof existing !== "object" || Array.isArray(existing))) return "INVALID_BRANDING";
    const branding: Prisma.InputJsonObject = { ...existing, logo };
    await transaction.eventSettings.upsert({
      where: { eventId: event.id },
      create: { eventId: event.id, customBranding: branding },
      update: { customBranding: branding },
    });
    await transaction.activityLog.create({
      data: {
        workspaceId: context.workspace.id,
        actorId: context.user.id,
        action: remove ? "event.logo_removed" : "event.logo_updated",
        entityType: "event",
        entityId: event.id,
      },
    });
    return "SAVED";
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (result === "NOT_FOUND") notFound();
  if (result === "INVALID_BRANDING") return { error: "Event branding could not be updated. Contact support." };

  revalidatePath(`/dashboard/events/${eventId}`);
  revalidatePath(`/register/${eventId}`);
  return { success: remove ? "Event logo removed." : "Event logo saved.", logo };
}

export async function uploadEventAttachmentAction(
  _previousState: EventAttachmentActionState,
  formData: FormData,
): Promise<EventAttachmentActionState> {
  const context = await getEventActionContext();
  const eventId = getEventId(formData);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a PDF or image to upload." };
  }
  if (file.size > maxEventAttachmentBytes) {
    return { error: "Files can’t exceed 2 MB." };
  }

  const data = Buffer.from(await file.arrayBuffer());
  const uploadedContentType = detectEventAttachmentContentType(data);
  if (!uploadedContentType) {
    return { error: "This file type isn’t allowed. Upload a PDF, JPEG, PNG, WebP, or AVIF image." };
  }
  let contentType = uploadedContentType;
  let storedData = data;
  if (uploadedContentType.startsWith("image/")) {
    try {
      storedData = await convertImageToAvif(data, { maxDimension: 2048, quality: 60 });
    } catch (error) {
      console.error("Event attachment AVIF conversion failed.", error);
      return { error: "This image could not be processed. Choose another image." };
    }
    if (storedData.length > maxEventAttachmentBytes) {
      return { error: "This image is too large after compression. Choose another image." };
    }
    contentType = "image/avif";
  }
  const originalFileName = normalizeEventAttachmentOriginalFileName(file.name);
  const fileName = normalizeEventAttachmentFileName(file.name, contentType);
  const prisma = getPrisma();
  const event = await prisma.event.findFirst({
    where: { id: eventId, workspaceId: context.workspace.id, archivedAt: null },
    select: { id: true },
  });
  if (!event) notFound();
  const existing = await prisma.eventAttachment.findFirst({
    where: {
      eventId: event.id,
      originalFileName: { equals: originalFileName, mode: "insensitive" },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fileName: true,
      originalFileName: true,
      contentType: true,
      size: true,
      data: true,
      storagePath: true,
    },
  });
  const attachmentCount = await prisma.eventAttachment.count({ where: { eventId: event.id } });
  if (!existing && attachmentCount >= maxEventAttachmentsPerEvent) {
    return { error: "This event has reached its attachment limit." };
  }

  const attachmentId = existing?.id ?? randomUUID();
  const storagePath = `workspaces/${context.workspace.id}/events/${event.id}/${attachmentId}/${randomUUID()}/${fileName}`;
  let previousBytes: Uint8Array | null = null;
  if (existing?.storagePath) {
    try {
      previousBytes = await downloadSupabaseObject(existing.storagePath);
    } catch (error) {
      console.error("Previous event attachment could not be backed up for replacement.", error);
      return { error: "The previous file could not be replaced safely. Try again later." };
    }
  }
  try {
    await uploadSupabaseObject(storagePath, storedData, contentType);
  } catch (error) {
    console.error("Event attachment upload to Supabase Storage failed.", error);
    return { error: "File storage is unavailable or not configured. Try again after checking Supabase Storage settings." };
  }

  let result: "NOT_FOUND" | "LIMIT_REACHED" | "CONFLICT" | "SAVED";
  try {
    result = await prisma.$transaction(async (transaction) => {
      const currentEvent = await transaction.event.findFirst({
        where: { id: eventId, workspaceId: context.workspace.id, archivedAt: null },
        select: { id: true },
      });
      if (!currentEvent) return "NOT_FOUND";

      if (existing) {
        const currentAttachment = await transaction.eventAttachment.findFirst({
          where: { id: existing.id, eventId: currentEvent.id },
          select: { id: true, storagePath: true },
        });
        if (!currentAttachment || currentAttachment.storagePath !== existing.storagePath) return "CONFLICT";
        await transaction.eventAttachment.update({
          where: { id: existing.id },
          data: {
            fileName,
            originalFileName,
            contentType,
            size: storedData.length,
            data: null,
            storagePath,
            uploadedById: context.user.id,
          },
        });
      } else {
        const sameNameAttachment = await transaction.eventAttachment.findFirst({
          where: {
            eventId: currentEvent.id,
            originalFileName: { equals: originalFileName, mode: "insensitive" },
          },
          select: { id: true },
        });
        if (sameNameAttachment) return "CONFLICT";
        const currentAttachmentCount = await transaction.eventAttachment.count({ where: { eventId: currentEvent.id } });
        if (currentAttachmentCount >= maxEventAttachmentsPerEvent) return "LIMIT_REACHED";

        await transaction.eventAttachment.create({
          data: {
            id: attachmentId,
            eventId: event.id,
            uploadedById: context.user.id,
            fileName,
            originalFileName,
            contentType,
            size: storedData.length,
            storagePath,
          },
        });
      }
      await transaction.activityLog.create({
        data: {
          workspaceId: context.workspace.id,
          actorId: context.user.id,
          action: existing ? "event.attachment_replaced" : "event.attachment_uploaded",
          entityType: "event",
          entityId: event.id,
        },
      });
      return "SAVED";
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    try {
      await deleteSupabaseObject(storagePath);
    } catch (cleanupError) {
      console.error("Orphaned event attachment cleanup failed.", cleanupError);
      throw new Error("The upload could not be saved and its storage cleanup failed.", { cause: error });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { error: "Another file upload happened at the same time. Refresh and try again." };
    }
    throw error;
  }

  if (result !== "SAVED") {
    try {
      await deleteSupabaseObject(storagePath);
    } catch (cleanupError) {
      console.error("Orphaned event attachment cleanup failed.", cleanupError);
      return { error: "The upload could not be saved or cleaned up. Contact support before retrying." };
    }
  }
  if (result === "NOT_FOUND") notFound();
  if (result === "LIMIT_REACHED") {
    return { error: "This event has reached its attachment limit." };
  }
  if (result === "CONFLICT") {
    return { error: "Another file upload happened at the same time. Refresh and try again." };
  }

  if (existing?.storagePath) {
    try {
      await deleteSupabaseObject(existing.storagePath);
    } catch (error) {
      console.error("Previous event attachment cleanup failed.", error);
      try {
        if (!previousBytes) throw new Error("The previous event attachment backup is unavailable.");
        await uploadSupabaseObject(existing.storagePath, previousBytes, existing.contentType);
        const restored = await prisma.eventAttachment.updateMany({
          where: { id: existing.id, eventId: event.id, storagePath },
          data: {
            fileName: existing.fileName,
            originalFileName: existing.originalFileName,
            contentType: existing.contentType,
            size: existing.size,
            data: existing.data,
            storagePath: existing.storagePath,
          },
        });
        if (restored.count !== 1) throw new Error("The event attachment changed before rollback.");
        await deleteSupabaseObject(storagePath);
      } catch (restoreError) {
        console.error("Event attachment replacement rollback failed.", restoreError);
        throw new Error("The previous event attachment could not be safely restored.", { cause: error });
      }
      return { error: "The previous file could not be removed from storage, so the replacement was rolled back." };
    }
  }

  revalidatePath(`/dashboard/events/${eventId}`);
  revalidatePath("/dashboard/files");
  return { success: existing ? "File replaced." : "File uploaded." };
}

export async function deleteEventAttachmentAction(
  _previousState: EventAttachmentActionState,
  formData: FormData,
): Promise<EventAttachmentActionState> {
  const context = await getEventActionContext();
  const eventId = getEventId(formData);
  const attachmentId = formData.get("attachmentId");
  if (typeof attachmentId !== "string" || !attachmentId) {
    return { error: "Choose a file to delete." };
  }

  const prisma = getPrisma();
  const attachment = await prisma.eventAttachment.findFirst({
    where: {
      id: attachmentId,
      eventId,
      event: { workspaceId: context.workspace.id, archivedAt: null },
    },
    select: { id: true, storagePath: true, contentType: true },
  });
  if (!attachment) return { error: "This file no longer exists. Refresh and try again." };

  let backup: Uint8Array | null = null;
  if (attachment.storagePath) {
    try {
      backup = await downloadSupabaseObject(attachment.storagePath);
      await deleteSupabaseObject(attachment.storagePath);
    } catch (error) {
      console.error("Event attachment deletion from Supabase Storage failed.", error);
      return { error: "The file could not be removed from storage. Try again later." };
    }
  }

  let deleted: boolean;
  try {
    deleted = await prisma.$transaction(async (transaction) => {
      const currentAttachment = await transaction.eventAttachment.findFirst({
        where: {
          id: attachment.id,
          eventId,
          event: { workspaceId: context.workspace.id, archivedAt: null },
        },
        select: { id: true },
      });
      if (!currentAttachment) return false;

      await transaction.eventAttachment.delete({ where: { id: currentAttachment.id } });
      await transaction.activityLog.create({
        data: {
          workspaceId: context.workspace.id,
          actorId: context.user.id,
          action: "event.attachment_deleted",
          entityType: "event",
          entityId: eventId,
        },
      });
      return true;
    });
  } catch (error) {
    if (backup && attachment.storagePath) {
      try {
        await uploadSupabaseObject(attachment.storagePath, backup, attachment.contentType);
      } catch (restoreError) {
        console.error("Event attachment restoration after failed deletion did not succeed.", restoreError);
        throw new Error("The database deletion failed and the storage object could not be restored.", { cause: error });
      }
    }
    throw error;
  }
  if (!deleted) {
    if (backup && attachment.storagePath) {
      try {
        await uploadSupabaseObject(attachment.storagePath, backup, attachment.contentType);
      } catch (restoreError) {
        console.error("Event attachment restoration after concurrent deletion did not succeed.", restoreError);
        throw new Error("The attachment disappeared during deletion and could not be restored.", { cause: restoreError });
      }
    }
    return { error: "This file no longer exists. Refresh and try again." };
  }

  revalidatePath(`/dashboard/events/${eventId}`);
  revalidatePath("/dashboard/files");
  return { success: "File deleted." };
}

export async function saveRegistrationFormAction(
  _previousState: RegistrationFormState,
  formData: FormData,
): Promise<RegistrationFormState> {
  const context = await getEventActionContext();
  if (!workspaceHasFeature(context.subscription, "custom_forms")) {
    return { error: "Custom registration forms require the Starter plan or higher." };
  }
  const eventId = getEventId(formData);
  const rawQuestions = formData.get("questions");
  if (typeof rawQuestions !== "string" || rawQuestions.length > 24_000) {
    return { error: "Check the registration questions and try again." };
  }

  let questionsValue: unknown;
  try {
    questionsValue = JSON.parse(rawQuestions);
  } catch {
    return { error: "The registration questions could not be read. Try again." };
  }

  const parsed = z.array(registrationQuestionInput).max(12).safeParse(questionsValue);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the registration questions and try again." };
  }
  const questions = parsed.data.map((question) => ({
    ...question,
    options: question.options.map((option) => option.trim()).filter(Boolean),
  }));
  for (const question of questions) {
    if (question.type === "SELECT") {
      if (question.options.length < 2 || question.options.length > 8) {
        return { error: "Multiple choice questions need 2 to 8 options." };
      }
      if (new Set(question.options.map((option) => option.toLowerCase())).size !== question.options.length) {
        return { error: "Multiple choice options must be unique." };
      }
    } else if (question.options.length) {
      return { error: "Only multiple choice questions can have options." };
    }
  }

  const submittedIds = questions.flatMap((question) => question.id ? [question.id] : []);
  if (new Set(submittedIds).size !== submittedIds.length) {
    return { error: "A question was included more than once." };
  }

  const prisma = getPrisma();
  const result = await prisma.$transaction(async (transaction) => {
    const event = await transaction.event.findFirst({
      where: { id: eventId, workspaceId: context.workspace.id, archivedAt: null },
      select: {
        id: true,
        registrationForm: {
          include: {
            questions: { include: { _count: { select: { answers: true } } } },
          },
        },
      },
    });
    if (!event) return "NOT_FOUND";

    const existingQuestions = event.registrationForm?.questions ?? [];
    const existingById = new Map(existingQuestions.map((question) => [question.id, question]));
    for (const question of questions) {
      if (question.id && !existingById.has(question.id)) return "UNKNOWN_QUESTION";
    }
    for (const existing of existingQuestions) {
      if (existing._count.answers === 0) continue;
      const submitted = questions.find((question) => question.id === existing.id);
      if (
        !submitted ||
        submitted.label !== existing.label ||
        submitted.type !== existing.type ||
        submitted.required !== existing.required ||
        JSON.stringify(submitted.options) !== JSON.stringify(readRegistrationQuestionOptions(existing.options))
      ) {
        return "ANSWERS_LOCKED";
      }
    }

    const form = event.registrationForm ?? await transaction.registrationForm.create({
      data: { eventId: event.id },
    });
    const submittedExistingIds = new Set(submittedIds);
    for (const existing of existingQuestions) {
      if (!submittedExistingIds.has(existing.id)) {
        await transaction.registrationQuestion.delete({ where: { id: existing.id } });
      }
    }
    for (const [position, question] of questions.entries()) {
      const data = {
        label: question.label,
        type: question.type,
        required: question.required,
        position,
        options: question.type === "SELECT" ? question.options : Prisma.JsonNull,
      };
      if (question.id) {
        await transaction.registrationQuestion.update({
          where: { id: question.id },
          data,
        });
      } else {
        await transaction.registrationQuestion.create({
          data: { ...data, formId: form.id },
        });
      }
    }
    await transaction.activityLog.create({
      data: {
        workspaceId: context.workspace.id,
        actorId: context.user.id,
        action: "registration_form.updated",
        entityType: "event",
        entityId: event.id,
      },
    });
    return "SAVED";
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (result === "NOT_FOUND") notFound();
  if (result === "ANSWERS_LOCKED") {
    return { error: "Questions with responses cannot be edited or removed. Add a new question instead." };
  }
  if (result === "UNKNOWN_QUESTION") return { error: "A question does not belong to this event. Refresh and try again." };

  revalidatePath(`/dashboard/events/${eventId}`);
  revalidatePath(`/register/${eventId}`);
  return { success: "Registration form saved." };
}

const editableModuleKeys = new Set([
  "invitations",
  "rsvp",
  "meals",
  "sessions",
  "nfc_check_in",
]);

export async function updateEventModuleAction(
  _previousState: EventModuleState,
  formData: FormData,
): Promise<EventModuleState> {
  const context = await getEventActionContext();
  const eventId = getEventId(formData);
  const key = String(formData.get("moduleKey") ?? "");
  if (!editableModuleKeys.has(key)) return { error: "This event module is not configurable." };

  const enabled = formData.get("enabled") === "true";
  let settings: Prisma.InputJsonObject = {};
  try {
    const rawSettings = formData.get("settings");
    if (typeof rawSettings === "string" && rawSettings.trim()) {
      const parsed = JSON.parse(rawSettings);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { error: "The module settings could not be read." };
      }
      settings = parsed as Prisma.InputJsonObject;
    }
  } catch {
    return { error: "The module settings could not be read." };
  }

  const prisma = getPrisma();
  const event = await prisma.event.findFirst({
    where: { id: eventId, workspaceId: context.workspace.id, archivedAt: null },
    select: { id: true },
  });
  if (!event) notFound();

  await prisma.$transaction([
    prisma.eventModule.upsert({
      where: { eventId_key: { eventId: event.id, key } },
      create: { eventId: event.id, key, enabled, settings },
      update: { enabled, settings },
    }),
    prisma.activityLog.create({
      data: {
        workspaceId: context.workspace.id,
        actorId: context.user.id,
        action: "event.module_updated",
        entityType: "event_module",
        entityId: event.id,
        metadata: { module: key, enabled },
      },
    }),
  ]);
  revalidatePath(`/dashboard/events/${eventId}`);
  return { success: `${key.replaceAll("_", " ")} module updated.` };
}

function getCheckpointInput(formData: FormData) {
  const parsed = checkpointInput.safeParse({
    name: formData.get("name"),
    capacity: formData.get("capacity"),
  });
  if (!parsed.success) return null;

  const capacity = parsed.data.capacity === "" ? null : Number(parsed.data.capacity);
  if (capacity !== null && (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 100000)) return null;
  return { name: parsed.data.name, capacity };
}

function revalidateCheckpointViews(eventId: string, eventSlug: string) {
  revalidatePath(`/dashboard/events/${eventId}`);
  revalidatePath(`/dashboard/events/${eventSlug}`);
  revalidatePath("/dashboard/check-in");
  revalidatePath("/check-in/mobile");
}

export async function createEventCheckpointAction(
  _previousState: EventCheckpointState,
  formData: FormData,
): Promise<EventCheckpointState> {
  const context = await getEventActionContext();
  const eventId = getEventId(formData);
  const input = getCheckpointInput(formData);
  if (!input) return { error: "invalid" };

  const prisma = getPrisma();
  const event = await prisma.event.findFirst({
    where: { id: eventId, workspaceId: context.workspace.id, archivedAt: null },
    select: { id: true, slug: true },
  });
  if (!event) notFound();

  try {
    await prisma.$transaction(async (transaction) => {
      const lastCheckpoint = await transaction.eventCheckpoint.aggregate({
        where: { eventId: event.id },
        _max: { sortOrder: true },
      });
      const checkpoint = await transaction.eventCheckpoint.create({
        data: {
          eventId: event.id,
          name: input.name,
          capacity: input.capacity,
          sortOrder: (lastCheckpoint._max.sortOrder ?? -1) + 1,
        },
      });
      await transaction.activityLog.create({
        data: {
          workspaceId: context.workspace.id,
          actorId: context.user.id,
          action: "event.checkpoint_created",
          entityType: "event_checkpoint",
          entityId: checkpoint.id,
          metadata: { eventId, name: checkpoint.name, capacity: checkpoint.capacity },
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "duplicate" };
    }
    throw error;
  }

  revalidateCheckpointViews(eventId, event.slug);
  return { success: true };
}

export async function updateEventCheckpointAction(
  _previousState: EventCheckpointState,
  formData: FormData,
): Promise<EventCheckpointState> {
  const context = await getEventActionContext();
  const eventId = getEventId(formData);
  const checkpointId = String(formData.get("checkpointId") ?? "");
  const input = getCheckpointInput(formData);
  if (!checkpointId || !input) return { error: "invalid" };

  const prisma = getPrisma();
  const checkpoint = await prisma.eventCheckpoint.findFirst({
    where: {
      id: checkpointId,
      eventId,
      event: { workspaceId: context.workspace.id, archivedAt: null },
    },
    select: { id: true, claimedCount: true, event: { select: { slug: true } } },
  });
  if (!checkpoint) notFound();
  if (input.capacity !== null && input.capacity < checkpoint.claimedCount) {
    return { error: "capacity" };
  }

  try {
    const updated = await prisma.$transaction(async (transaction) => {
      const result = await transaction.eventCheckpoint.updateMany({
        where: {
          id: checkpoint.id,
          eventId,
          ...(input.capacity === null ? {} : { claimedCount: { lte: input.capacity } }),
        },
        data: { name: input.name, capacity: input.capacity },
      });
      if (!result.count) return false;
      await transaction.activityLog.create({
        data: {
          workspaceId: context.workspace.id,
          actorId: context.user.id,
          action: "event.checkpoint_updated",
          entityType: "event_checkpoint",
          entityId: checkpoint.id,
          metadata: { eventId, name: input.name, capacity: input.capacity },
        },
      });
      return true;
    });
    if (!updated) return { error: "capacity" };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "duplicate" };
    }
    throw error;
  }

  revalidateCheckpointViews(eventId, checkpoint.event.slug);
  return { success: true };
}

export async function deleteEventCheckpointAction(
  _previousState: EventCheckpointState,
  formData: FormData,
): Promise<EventCheckpointState> {
  const context = await getEventActionContext();
  const eventId = getEventId(formData);
  const checkpointId = String(formData.get("checkpointId") ?? "");
  if (!checkpointId) return { error: "missing" };

  const prisma = getPrisma();
  const deleted = await prisma.$transaction(async (transaction) => {
    const checkpoint = await transaction.eventCheckpoint.findFirst({
      where: {
        id: checkpointId,
        eventId,
        event: { workspaceId: context.workspace.id, archivedAt: null },
      },
      select: { id: true, name: true, claimedCount: true, event: { select: { slug: true } } },
    });
    if (!checkpoint) return null;

    await transaction.eventCheckpoint.delete({ where: { id: checkpoint.id } });
    await transaction.activityLog.create({
      data: {
        workspaceId: context.workspace.id,
        actorId: context.user.id,
        action: "event.checkpoint_deleted",
        entityType: "event_checkpoint",
        entityId: checkpoint.id,
        metadata: { eventId, name: checkpoint.name, claimsDeleted: checkpoint.claimedCount },
      },
    });
    return { eventSlug: checkpoint.event.slug };
  });
  if (!deleted) notFound();

  revalidateCheckpointViews(eventId, deleted.eventSlug);
  return { success: true };
}

export async function sendEventInvitationsAction(
  _previousState: EventModuleState,
  formData: FormData,
): Promise<EventModuleState> {
  const context = await getEventActionContext();
  const eventId = getEventId(formData);
  const recipients = String(formData.get("recipients") ?? "")
    .split(/[\n,\s]+/)
    .map((email) => email.trim().toLowerCase())
    .filter((email) => z.email().safeParse(email).success);
  if (!recipients.length) return { error: "Enter at least one valid guest email." };
  const uniqueRecipients = [...new Set(recipients)].slice(0, 200);
  const subject = String(formData.get("subject") ?? "").trim().slice(0, 160) || "You’re invited";
  const message = String(formData.get("message") ?? "").trim().slice(0, 3000);

  const prisma = getPrisma();
  const event = await prisma.event.findFirst({
    where: { id: eventId, workspaceId: context.workspace.id, archivedAt: null },
    select: { id: true, name: true },
  });
  if (!event) notFound();

  const job = await enqueueEventInvitations(context.workspace.id, context.user.id, {
    eventId: event.id,
    recipients: uniqueRecipients,
    subject,
    message,
  });
  return { jobId: job.id };
}

export async function archiveEventAction(formData: FormData) {
  const context = await getEventActionContext();
  const eventId = getEventId(formData);
  if (!workspaceHasFeature(context.subscription, "event_lifecycle")) {
    redirect(`/dashboard/events/${eventId}?error=plan_feature`);
  }
  const prisma = getPrisma();
  const event = await prisma.event.findFirst({
    where: { id: eventId, workspaceId: context.workspace.id, archivedAt: null },
    select: { id: true },
  });
  if (!event) notFound();

  await prisma.$transaction([
    prisma.event.update({
      where: { id: event.id },
      data: { archivedAt: new Date() },
    }),
    prisma.activityLog.create({
      data: {
        workspaceId: context.workspace.id,
        actorId: context.user.id,
        action: "event.archived",
        entityType: "event",
        entityId: event.id,
      },
    }),
  ]);
  redirect("/dashboard/events?archived=1");
}

export async function deleteEventAction(formData: FormData) {
  const context = await getEventActionContext();
  const eventId = getEventId(formData);
  const prisma = getPrisma();
  const event = await prisma.event.findFirst({
    where: { id: eventId, workspaceId: context.workspace.id },
    select: {
      id: true,
      registrations: { take: 1, select: { id: true } },
      attachments: { select: { storagePath: true, contentType: true } },
    },
  });
  if (!event) notFound();
  if (event.registrations.length > 0) redirect(`/dashboard/events/${eventId}?error=has_registrations`);

  const removedObjects: Array<{ path: string; contentType: string; bytes: Uint8Array }> = [];
  try {
    for (const attachment of event.attachments) {
      if (!attachment.storagePath) continue;
      const bytes = await downloadSupabaseObject(attachment.storagePath);
      await deleteSupabaseObject(attachment.storagePath);
      removedObjects.push({
        path: attachment.storagePath,
        contentType: attachment.contentType,
        bytes,
      });
    }
  } catch (error) {
    try {
      await restoreEventAttachmentObjects(removedObjects);
    } catch (restoreError) {
      console.error("Event attachments could not be restored after storage cleanup failed.", restoreError);
      throw new Error("Event deletion stopped, but some attachments could not be restored.", { cause: error });
    }
    console.error("Event attachments could not be removed from Supabase Storage.", error);
    throw new Error("Event deletion stopped because its attachments could not be removed from storage.", { cause: error });
  }

  let result: "NOT_FOUND" | "HAS_REGISTRATIONS" | "DELETED";
  try {
    result = await prisma.$transaction(async (transaction) => {
      const currentEvent = await transaction.event.findFirst({
        where: { id: eventId, workspaceId: context.workspace.id },
        select: { id: true },
      });
      if (!currentEvent) return "NOT_FOUND";

      const deleted = await transaction.event.deleteMany({
        where: { id: currentEvent.id, workspaceId: context.workspace.id, registrations: { none: {} } },
      });
      if (!deleted.count) return "HAS_REGISTRATIONS";

      await transaction.activityLog.create({
        data: {
          workspaceId: context.workspace.id,
          actorId: context.user.id,
          action: "event.deleted",
          entityType: "event",
          entityId: currentEvent.id,
        },
      });
      return "DELETED";
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    try {
      await restoreEventAttachmentObjects(removedObjects);
    } catch (restoreError) {
      console.error("Event attachments could not be restored after the database deletion failed.", restoreError);
      throw new Error("The event deletion failed and some attachments could not be restored.", { cause: error });
    }
    throw error;
  }

  if (result !== "DELETED") await restoreEventAttachmentObjects(removedObjects);
  if (result === "NOT_FOUND") notFound();
  if (result === "HAS_REGISTRATIONS") redirect(`/dashboard/events/${eventId}?error=has_registrations`);
  redirect("/dashboard/events?deleted=1");
}

export async function duplicateEventAction(formData: FormData) {
  const context = await getEventActionContext();
  const eventId = getEventId(formData);
  if (!workspaceHasFeature(context.subscription, "event_lifecycle")) {
    redirect(`/dashboard/events/${eventId}?error=plan_feature`);
  }
  const prisma = getPrisma();
  const source = await prisma.event.findFirst({
    where: { id: eventId, workspaceId: context.workspace.id, archivedAt: null },
    include: { modules: true, settings: true },
  });
  if (!source) notFound();

  const copy = await prisma.event.create({
    data: {
      workspaceId: context.workspace.id,
      name: `${source.name} (copy)`,
      slug: `${source.slug.slice(0, 50)}-copy-${randomUUID().slice(0, 8)}`,
      description: source.description,
      category: source.category,
      type: source.type,
      format: source.format,
      visibility: source.visibility,
      status: "DRAFT",
      startsAt: source.startsAt,
      endsAt: source.endsAt,
      timezone: source.timezone,
      venue: source.venue,
      address: source.address,
      capacity: source.capacity,
      registrationDeadline: source.registrationDeadline,
      organizerName: source.organizerName,
      contactEmail: source.contactEmail,
      contactPhone: source.contactPhone,
      coverImageUrl: source.coverImageUrl,
      settings: source.settings ? {
        create: {
          allowRegistration: false,
          allowWaitlist: source.settings.allowWaitlist,
          requireApproval: source.settings.requireApproval,
          customBranding: source.settings.customBranding ?? undefined,
        },
      } : undefined,
      modules: { create: source.modules.map(({ key, enabled, settings }) => ({ key, enabled, settings: settings ?? undefined })) },
    },
  });
  await prisma.activityLog.create({
    data: {
      workspaceId: context.workspace.id,
      actorId: context.user.id,
      action: "event.duplicated",
      entityType: "event",
      entityId: copy.id,
      metadata: { sourceEventId: source.id },
    },
  });
  redirect(`/dashboard/events/${copy.id}`);
}
