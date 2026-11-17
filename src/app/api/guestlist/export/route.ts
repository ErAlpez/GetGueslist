import { AttendeeCategory } from "@prisma/client";
import { getWorkspaceContext } from "@/lib/workspace";
import { getPrisma } from "@/lib/prisma";
import { exclusiveDateEnd, parseDateParam } from "@/lib/date-range";

function csvCell(value: unknown) {
  const text = String(value ?? "");
  const protectedText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${protectedText.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const context = await getWorkspaceContext();
  if (!context) return Response.json({ error: "Authentication required." }, { status: 401 });

  const url = new URL(request.url);
  const eventId = url.searchParams.get("event");
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
    ["First name", "Last name", "Email", "Phone", "Company", "Position", "Event", "Category", "Ticket ID", "Ticket status", "Registration date", "Check-in time", "Age", "Gender"],
    ...registrations.map((registration) => [
      registration.attendee.firstName,
      registration.attendee.lastName,
      registration.attendee.email,
      registration.attendee.phone,
      registration.attendee.company,
      registration.attendee.position,
      registration.event.name,
      registration.category,
      registration.ticket?.displayId ?? "",
      registration.ticket?.status ?? "",
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
      "Content-Disposition": 'attachment; filename="guestlist-export.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
