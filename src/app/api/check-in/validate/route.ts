import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getWorkspaceContext } from "@/lib/workspace";
import { getTicketIdFromToken, hashTicketToken, verifyTicketToken } from "@/lib/tickets";
import { getMobileCheckinAccess, hasMobileCheckinCookie } from "@/lib/mobile-checkin";

const requestSchema = z.object({
  eventId: z.string().min(1),
  token: z.string().min(1).max(500),
  deviceId: z.string().max(120).optional(),
});

export async function POST(request: Request) {
  const hasMobileCookie = await hasMobileCheckinCookie();
  const mobileAccess = hasMobileCookie ? await getMobileCheckinAccess() : null;
  const context = hasMobileCookie ? null : await getWorkspaceContext();
  if (hasMobileCookie && !mobileAccess) {
    return Response.json({ result: "unauthorized", message: "This phone scanner session has expired or been revoked." }, { status: 401 });
  }
  if (!mobileAccess && !context) return Response.json({ result: "unauthorized" }, { status: 401 });
  if (context && !["OWNER", "ADMIN", "MANAGER", "CHECKIN"].includes(context.membership.role)) {
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
  if (mobileAccess && eventId !== mobileAccess.eventId) {
    return Response.json({ result: "forbidden", message: "This scanner is not paired with that event." }, { status: 403 });
  }

  const prisma = getPrisma();
  const now = new Date();
  const workspaceId = mobileAccess?.workspaceId ?? context?.workspace.id;
  if (!workspaceId) return Response.json({ result: "unauthorized" }, { status: 401 });

  if (mobileAccess) {
    const activeSession = await prisma.mobileCheckinAccess.updateMany({
      where: {
        id: mobileAccess.id,
        revokedAt: null,
        sessionExpiresAt: { gt: now },
      },
      data: { lastSeenAt: now },
    });
    if (activeSession.count !== 1) {
      return Response.json({ result: "unauthorized", message: "This phone scanner session has expired or been revoked." }, { status: 401 });
    }
  }

  if (!verifyTicketToken(token)) {
    return Response.json({ result: "invalid_ticket", message: "This ticket isn’t valid." }, { status: 404 });
  }

  const ticketId = getTicketIdFromToken(token);
  if (!ticketId) {
    return Response.json({ result: "invalid_ticket", message: "This ticket isn’t valid." }, { status: 404 });
  }

  const result = await prisma.$transaction(async (transaction) => {
    const ticket = await transaction.ticket.findUnique({
      where: { id: ticketId },
      include: {
        registration: {
          include: {
            attendee: { select: { firstName: true, lastName: true } },
            event: { select: { id: true, workspaceId: true, name: true, status: true, archivedAt: true } },
          },
        },
      },
    });

    if (
      !ticket ||
      ticket.tokenHash !== hashTicketToken(token) ||
      ticket.registration.event.id !== eventId ||
      ticket.registration.event.workspaceId !== workspaceId
    ) {
      return { result: "invalid_ticket" as const };
    }

    if (
      mobileAccess &&
      (ticket.registration.event.archivedAt ||
        ticket.registration.event.status === "COMPLETED" ||
        ticket.registration.event.status === "CANCELLED")
    ) {
      return { result: "event_unavailable" as const };
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

    const scanDeviceId = mobileAccess?.id ?? deviceId;
    if (scanDeviceId) {
      await transaction.checkinDevice.upsert({
        where: {
          workspaceId_deviceId: {
            workspaceId,
            deviceId: scanDeviceId,
          },
        },
        create: {
          workspaceId,
          eventId,
          deviceId: scanDeviceId,
          name: mobileAccess?.deviceName,
          lastSeenAt: now,
        },
        update: {
          eventId,
          lastSeenAt: now,
          ...(mobileAccess ? { name: mobileAccess.deviceName } : {}),
        },
      });
    }

    await transaction.attendanceLog.create({
      data: {
        workspaceId,
        eventId,
        registrationId: ticket.registrationId,
        ticketId: ticket.id,
        action: "CHECK_IN",
        method: "qr",
        deviceId: scanDeviceId ?? null,
        operatorId: mobileAccess ? null : context?.user.id ?? null,
      },
    });

    await transaction.activityLog.create({
      data: {
        workspaceId,
        actorId: mobileAccess ? null : context?.user.id ?? null,
        action: "attendee.checked_in",
        entityType: "attendance",
        entityId: ticket.registrationId,
        metadata: {
          eventId,
          method: "qr",
          ...(mobileAccess ? { scanner: mobileAccess.deviceName } : {}),
        },
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
  if (result.result === "event_unavailable") {
    return Response.json({ result: "forbidden", message: "This event is no longer available for check-in." }, { status: 403 });
  }

  return Response.json(result, { status: 200 });
}
