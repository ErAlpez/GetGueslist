import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getWorkspaceContext } from "@/lib/workspace";
import { getTicketIdFromToken, hashTicketToken, verifyTicketToken } from "@/lib/tickets";

const requestSchema = z.object({
  eventId: z.string().min(1),
  token: z.string().min(1).max(500),
  deviceId: z.string().max(120).optional(),
});

export async function POST(request: Request) {
  const context = await getWorkspaceContext();
  if (!context) return Response.json({ result: "unauthorized" }, { status: 401 });
  if (!["OWNER", "ADMIN", "MANAGER", "CHECKIN"].includes(context.membership.role)) {
    return Response.json({ result: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ result: "invalid_request", message: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ result: "invalid_request", message: "Provide an event and ticket token." }, { status: 400 });
  }

  const { eventId, token, deviceId } = parsed.data;
  if (!verifyTicketToken(token)) {
    return Response.json({ result: "invalid_ticket", message: "This ticket isn’t valid." }, { status: 404 });
  }

  const ticketId = getTicketIdFromToken(token);
  if (!ticketId) {
    return Response.json({ result: "invalid_ticket", message: "This ticket isn’t valid." }, { status: 404 });
  }

  const prisma = getPrisma();
  const result = await prisma.$transaction(async (transaction) => {
    const ticket = await transaction.ticket.findUnique({
      where: { id: ticketId },
      include: {
        registration: {
          include: {
            attendee: { select: { firstName: true, lastName: true } },
            event: { select: { id: true, workspaceId: true, name: true } },
          },
        },
      },
    });

    if (
      !ticket ||
      ticket.tokenHash !== hashTicketToken(token) ||
      ticket.registration.event.id !== eventId ||
      ticket.registration.event.workspaceId !== context.workspace.id
    ) {
      return { result: "invalid_ticket" as const };
    }

    if (ticket.status !== "ACTIVE") {
      return {
        result: ticket.status === "USED" ? "already_checked_in" as const : "ticket_unavailable" as const,
        attendeeName: `${ticket.registration.attendee.firstName} ${ticket.registration.attendee.lastName}`,
        eventName: ticket.registration.event.name,
      };
    }

    const now = new Date();
    if (ticket.expiresAt && ticket.expiresAt <= now) {
      await transaction.ticket.update({
        where: { id: ticket.id },
        data: { status: "EXPIRED" },
      });
      return { result: "expired" as const };
    }

    const update = await transaction.ticket.updateMany({
      where: {
        id: ticket.id,
        status: "ACTIVE",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      data: { status: "USED" },
    });

    if (update.count !== 1) {
      return { result: "already_checked_in" as const };
    }

    if (deviceId) {
      await transaction.checkinDevice.upsert({
        where: {
          workspaceId_deviceId: {
            workspaceId: context.workspace.id,
            deviceId,
          },
        },
        create: {
          workspaceId: context.workspace.id,
          eventId,
          deviceId,
          lastSeenAt: now,
        },
        update: { eventId, lastSeenAt: now },
      });
    }

    await transaction.attendanceLog.create({
      data: {
        workspaceId: context.workspace.id,
        eventId,
        registrationId: ticket.registrationId,
        ticketId: ticket.id,
        action: "CHECK_IN",
        method: "qr",
        deviceId: deviceId || null,
        operatorId: context.user.id,
      },
    });

    await transaction.activityLog.create({
      data: {
        workspaceId: context.workspace.id,
        actorId: context.user.id,
        action: "attendee.checked_in",
        entityType: "attendance",
        entityId: ticket.registrationId,
        metadata: { eventId, method: "qr" },
      },
    });

    return {
      result: "checked_in" as const,
      attendeeName: `${ticket.registration.attendee.firstName} ${ticket.registration.attendee.lastName}`,
      eventName: ticket.registration.event.name,
      checkedInAt: now.toISOString(),
    };
  });

  if (result.result === "invalid_ticket") {
    return Response.json({ result: "invalid_ticket", message: "This ticket isn’t valid for this event." }, { status: 404 });
  }
  if (result.result === "already_checked_in") {
    return Response.json({ ...result, message: "This ticket has already been used." }, { status: 409 });
  }
  if (result.result === "ticket_unavailable") {
    return Response.json({ ...result, message: "This ticket is cancelled or no longer active." }, { status: 409 });
  }
  if (result.result === "expired") {
    return Response.json({ ...result, message: "This ticket has expired." }, { status: 410 });
  }

  return Response.json(result, { status: 200 });
}
