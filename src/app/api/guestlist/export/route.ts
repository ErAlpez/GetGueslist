import { AttendeeCategory } from "@prisma/client";
import { getWorkspaceContext } from "@/lib/workspace";
import { getPrisma } from "@/lib/prisma";
import { exclusiveDateEnd, parseDateParam } from "@/lib/date-range";
import { workspaceHasFeature } from "@/lib/plan-features";
import { workspaceRoleCanAccessSection } from "@/lib/workspace-roles";
import { enqueueAttendeeExport } from "@/lib/background-jobs";

export const maxDuration = 60;

function csvCell(value: unknown) {
  const text = String(value ?? "");
  const protectedText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${protectedText.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const context = await getWorkspaceContext();
  if (!context) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!workspaceRoleCanAccessSection(context.membership.role, "attendees")) {
    return Response.json({ error: "You don’t have permission to export attendees." }, { status: 403 });
  }

  const canExportCsv = workspaceHasFeature(context.subscription, "csv_exports");
  if (!canExportCsv) {
    return Response.json({ error: "CSV exports require the Starter plan or higher." }, { status: 403 });
  }
  const canViewTicketStatus = workspaceHasFeature(context.subscription, "checkin_activity");
  const canExportWorkspace = workspaceHasFeature(context.subscription, "workspace_exports");

  const url = new URL(request.url);
  const eventId = url.searchParams.get("event");
  if (!eventId && !canExportWorkspace) {
    return Response.json({ error: "Workspace-wide CSV exports require the Max plan." }, { status: 403 });
  }

  const query = url.searchParams.get("q")?.trim() ?? "";
  const categories: AttendeeCategory[] = ["VIP", "SPEAKER", "SPONSOR", "ORGANIZER", "MEDIA", "GENERAL", "STAFF", "VOLUNTEER", "GUEST", "WALK_IN"];
  const category = categories.find((item) => item === url.searchParams.get("category"));
  const from = parseDateParam(url.searchParams.get("from"));
  const to = parseDateParam(url.searchParams.get("to"));
  if (from === null || to === null) {
    return Response.json({ error: "Date filters must use YYYY-MM-DD format." }, { status: 400 });
  }
  if (from && to && from > to) {
    return Response.json({ error: "The start date must be before the end date." }, { status: 400 });
  }

  if (eventId) {
    const event = await getPrisma().event.findFirst({
      where: { id: eventId, workspaceId: context.workspace.id, archivedAt: null },
      select: { id: true },
    });
    if (!event) return Response.json({ error: "Event not found." }, { status: 404 });
  }

  const registrations = await getPrisma().eventRegistration.findMany({
    where: {
      event: {
        workspaceId: context.workspace.id,
        ...(eventId ? { id: eventId } : {}),
      },
      ...(category ? { category } : {}),
      ...((from || to) ? {
        registeredAt: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lt: exclusiveDateEnd(to) } : {}),
        },
      } : {}),
      ...(query ? {
        attendee: {
          OR: [
            { firstName: { contains: query, mode: "insensitive" as const } },
            { lastName: { contains: query, mode: "insensitive" as const } },
            { email: { contains: query, mode: "insensitive" as const } },
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

  const rows = [
    [
      "First name", "Last name", "Email", "Phone", "Company", "Position", "Event", "Category",
      "RSVP", "Meal", "Sessions", "Ticket ID",
      ...(canViewTicketStatus ? ["Ticket status"] : []),
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
      ...(canViewTicketStatus ? [registration.ticket?.status ?? ""] : []),
      registration.registeredAt.toISOString(),
      registration.ticket?.attendanceLogs[0]?.createdAt.toISOString() ?? "",
      registration.age,
      registration.gender,
    ]),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");

  return new Response(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="attendees-export.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const requestHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = origin ? new URL(origin).host : null;
  } catch {
    originHost = null;
  }
  if (!requestHost || !originHost || originHost !== requestHost.toLowerCase()) {
    return Response.json({ error: "This request was not accepted." }, { status: 403 });
  }

  const context = await getWorkspaceContext();
  if (!context) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!workspaceRoleCanAccessSection(context.membership.role, "attendees")) {
    return Response.json({ error: "You don’t have permission to export attendees." }, { status: 403 });
  }
  if (!workspaceHasFeature(context.subscription, "csv_exports")) {
    return Response.json({ error: "CSV exports require the Starter plan or higher." }, { status: 403 });
  }

  const canExportWorkspace = workspaceHasFeature(context.subscription, "workspace_exports");
  const canViewTicketStatus = workspaceHasFeature(context.subscription, "checkin_activity");
  const url = new URL(request.url);
  const eventId = url.searchParams.get("event") || undefined;
  if (!eventId && !canExportWorkspace) {
    return Response.json({ error: "Workspace-wide CSV exports require the Max plan." }, { status: 403 });
  }

  const query = url.searchParams.get("q")?.trim() ?? "";
  if (query.length > 200) return Response.json({ error: "Search filters must be 200 characters or fewer." }, { status: 400 });
  const categories: AttendeeCategory[] = ["VIP", "SPEAKER", "SPONSOR", "ORGANIZER", "MEDIA", "GENERAL", "STAFF", "VOLUNTEER", "GUEST", "WALK_IN"];
  const category = categories.find((item) => item === url.searchParams.get("category"));
  const fromValue = url.searchParams.get("from") ?? undefined;
  const toValue = url.searchParams.get("to") ?? undefined;
  const from = parseDateParam(fromValue ?? null);
  const to = parseDateParam(toValue ?? null);
  if (from === null || to === null) {
    return Response.json({ error: "Date filters must use YYYY-MM-DD format." }, { status: 400 });
  }
  if (from && to && from > to) {
    return Response.json({ error: "The start date must be before the end date." }, { status: 400 });
  }

  if (eventId) {
    const event = await getPrisma().event.findFirst({
      where: { id: eventId, workspaceId: context.workspace.id, archivedAt: null },
      select: { id: true },
    });
    if (!event) return Response.json({ error: "Event not found." }, { status: 404 });
  }

  const job = await enqueueAttendeeExport(context.workspace.id, context.user.id, {
    eventId,
    query,
    category,
    from: fromValue,
    to: toValue,
    canViewTicketStatus,
  });
  return Response.json({ jobId: job.id }, { status: 202, headers: { "Cache-Control": "private, no-store" } });
}
