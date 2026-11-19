import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { createTicketToken } from "@/lib/tickets";
import { getWorkspaceContext } from "@/lib/workspace";
import { workspaceRoleHasPermission } from "@/lib/workspace-roles";

export async function GET(request: Request) {
  const context = await getWorkspaceContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!workspaceRoleHasPermission(context.membership.role, "checkin.perform")) {
    return NextResponse.json({ error: "You don’t have permission to search attendees." }, { status: 403 });
  }

  const url = new URL(request.url);
  const eventId = url.searchParams.get("event")?.trim() ?? "";
  const query = url.searchParams.get("q")?.trim() ?? "";
  if (!eventId || query.length < 2) {
    return NextResponse.json({ attendees: [] });
  }

  const attendees = await getPrisma().eventRegistration.findMany({
    where: {
      eventId,
      event: { workspaceId: context.workspace.id, archivedAt: null },
      OR: [
        {
          attendee: {
            AND: query.split(/\s+/).map((part) => ({
              OR: [
                { firstName: { contains: part, mode: "insensitive" } },
                { lastName: { contains: part, mode: "insensitive" } },
              ],
            })),
          },
        },
        { attendee: { email: { contains: query, mode: "insensitive" } } },
        ...(query.length >= 8
          ? [{ ticket: { is: { OR: [
              { displayId: { equals: query, mode: "insensitive" as const } },
              { id: { startsWith: query, mode: "insensitive" as const } },
            ] } } }]
          : []),
      ],
    },
    include: {
      attendee: { select: { firstName: true, lastName: true, email: true } },
      ticket: { select: { id: true, displayId: true, status: true } },
    },
    take: 10,
    orderBy: { registeredAt: "desc" },
  });

  return NextResponse.json({
    attendees: attendees.map((registration) => ({
      registrationId: registration.id,
      firstName: registration.attendee.firstName,
      lastName: registration.attendee.lastName,
      email: registration.attendee.email,
      category: registration.category,
      ticketId: registration.ticket?.displayId ?? null,
      ticketStatus: registration.ticket?.status ?? "MISSING",
      ticketToken: registration.ticket ? createTicketToken(registration.ticket.id) : null,
    })),
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
