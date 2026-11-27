"use server";

import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { enqueueGuestCsvImport } from "@/lib/background-jobs";
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
  jobId?: string;
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

  const job = await enqueueGuestCsvImport(
    input.context.workspace.id,
    input.context.user.id,
    input.eventId,
    input.rows,
  );
  return { jobId: job.id };
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
