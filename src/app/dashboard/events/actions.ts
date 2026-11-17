"use server";

import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { EventStatus, Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { localDateTimeToUtc, utcToLocalDateTime } from "@/lib/datetime";
import { exclusiveDateEnd, parseDateParam } from "@/lib/date-range";
import { eventLogoPrefix, maxEventLogoDataLength } from "@/lib/event-logo";
import { getPrisma } from "@/lib/prisma";
import { readRegistrationQuestionOptions, registrationQuestionTypes } from "@/lib/registration-form";
import { getWorkspaceContext } from "@/lib/workspace";

export type EventFormState = {
  error?: string;
};

export type RegistrationFormState = {
  error?: string;
  success?: string;
};

export type EventLogoState = {
  error?: string;
  success?: string;
  logo?: string | null;
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
  startsAt: z.string().min(1, "Choose a start date."),
  endsAt: z.string().min(1, "Choose an end date."),
  timezone: z.string().min(1, "Choose a timezone."),
  venue: z.string().trim().max(180),
  address: z.string().trim().max(500),
  capacity: z.string(),
  registrationDeadline: z.string(),
  organizerName: z.string().trim().max(120),
  contactEmail: z.union([z.literal(""), z.email()]),
  contactPhone: z.string().trim().max(40),
});

const permittedRoles = new Set(["OWNER", "ADMIN", "MANAGER"]);
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

  const startDate = parseDateParam(input.startsAt);
  const endDate = parseDateParam(input.endsAt);
  const deadlineDate = input.registrationDeadline ? parseDateParam(input.registrationDeadline) : undefined;
  if (!startDate || !endDate || (input.registrationDeadline && !deadlineDate)) {
    return { error: "Enter valid event dates." } as const;
  }
  if (endDate < startDate) return { error: "The end date must be on or after the start date." } as const;
  if (deadlineDate && deadlineDate > startDate) {
    return { error: "The registration deadline must be on or before the start date." } as const;
  }

  let startsAt: Date;
  let endsAt: Date;
  let registrationDeadline: Date | null = null;
  try {
    const resolveDate = (value: string, date: Date, previous: Date | null | undefined, endOfDay: boolean) => {
      if (previous && existing?.timezone === input.timezone && utcToLocalDateTime(previous, input.timezone).slice(0, 10) === value) {
        return previous;
      }
      const boundaryDate = endOfDay ? exclusiveDateEnd(date).toISOString().slice(0, 10) : value;
      const boundary = localDateTimeToUtc(`${boundaryDate}T00:00`, input.timezone);
      return endOfDay ? new Date(boundary.getTime() - 1) : boundary;
    };
    startsAt = resolveDate(input.startsAt, startDate, existing?.startsAt, false);
    endsAt = resolveDate(input.endsAt, endDate, existing?.endsAt, true);
    registrationDeadline = deadlineDate
      ? resolveDate(input.registrationDeadline, deadlineDate, existing?.registrationDeadline, true)
      : null;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Enter valid event dates." } as const;
  }

  if (endsAt <= startsAt) return { error: "The end date must be after the start date." } as const;

  return { input, capacity, startsAt, endsAt, registrationDeadline } as const;
}

export async function createEventAction(
  _previousState: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");
  if (!permittedRoles.has(context.membership.role)) {
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
  if (!permittedRoles.has(context.membership.role)) {
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
  for (const path of ["/dashboard", "/dashboard/events", "/dashboard/guestlist", "/dashboard/tickets", "/dashboard/check-in", "/dashboard/reports", `/dashboard/events/${event.id}`, `/register/${event.id}`]) {
    revalidatePath(path);
  }
  redirect(`/dashboard/events/${event.id}?updated=1`);
}

async function getEventActionContext() {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");
  if (!permittedRoles.has(context.membership.role)) {
    redirect("/dashboard/events?error=permission");
  }
  return context;
}

function getEventId(formData: FormData) {
  const eventId = formData.get("eventId");
  if (typeof eventId !== "string" || !eventId) redirect("/dashboard/events");
  return eventId;
}

export async function publishEventAction(formData: FormData) {
  const context = await getEventActionContext();
  const eventId = getEventId(formData);
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
  let logo: string | null = null;
  if (!remove) {
    const raw = formData.get("imageData");
    if (typeof raw !== "string" || raw.length > maxEventLogoDataLength ||
        !/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
      return { error: "Choose a logo before saving." };
    }
    const encoded = raw.slice(eventLogoPrefix.length);
    const bytes = Buffer.from(encoded, "base64");
    if (encoded !== bytes.toString("base64") || bytes.length < 20 ||
        bytes.toString("ascii", 0, 4) !== "RIFF" ||
        bytes.readUInt32LE(4) !== bytes.length - 8 ||
        bytes.toString("ascii", 8, 12) !== "WEBP" ||
        !["VP8 ", "VP8L", "VP8X"].includes(bytes.toString("ascii", 12, 16))) {
      return { error: "That logo could not be saved. Choose another image." };
    }
    logo = raw;
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

export async function saveRegistrationFormAction(
  _previousState: RegistrationFormState,
  formData: FormData,
): Promise<RegistrationFormState> {
  const context = await getEventActionContext();
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

export async function archiveEventAction(formData: FormData) {
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
  const result = await prisma.$transaction(async (transaction) => {
    const event = await transaction.event.findFirst({
      where: { id: eventId, workspaceId: context.workspace.id },
      select: { id: true },
    });
    if (!event) return "NOT_FOUND";

    const deleted = await transaction.event.deleteMany({
      where: { id: event.id, workspaceId: context.workspace.id, registrations: { none: {} } },
    });
    if (!deleted.count) return "HAS_REGISTRATIONS";

    await transaction.activityLog.create({
      data: {
        workspaceId: context.workspace.id,
        actorId: context.user.id,
        action: "event.deleted",
        entityType: "event",
        entityId: event.id,
      },
    });
    return "DELETED";
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (result === "NOT_FOUND") notFound();
  if (result === "HAS_REGISTRATIONS") redirect(`/dashboard/events/${eventId}?error=has_registrations`);
  redirect("/dashboard/events?deleted=1");
}

export async function duplicateEventAction(formData: FormData) {
  const context = await getEventActionContext();
  const eventId = getEventId(formData);
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
