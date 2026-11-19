import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { getWorkspaceContext } from "@/lib/workspace";
import { workspaceRoleHasPermission } from "@/lib/workspace-roles";
import { getTicketIdFromToken, hashTicketToken, verifyTicketToken } from "@/lib/tickets";
import { getMobileCheckinAccess, hasMobileCheckinCookie } from "@/lib/mobile-checkin";
import { generateAttendanceCertificate } from "@/lib/certificate";
import { sendAttendanceCertificateEmail } from "@/lib/email";
import { readEventLogo } from "@/lib/event-logo";

const requestSchema = z.object({
  eventId: z.string().min(1),
  token: z.string().min(1).max(500),
  deviceId: z.string().max(120).optional(),
  checkpointId: z.string().min(1).max(100).optional(),
});

class CheckpointCapacityReached extends Error {}

export async function POST(request: Request) {
  const hasMobileCookie = await hasMobileCheckinCookie();
  const mobileAccess = hasMobileCookie ? await getMobileCheckinAccess() : null;
  const context = hasMobileCookie ? null : await getWorkspaceContext();
  if (hasMobileCookie && !mobileAccess) {
    return Response.json({ result: "unauthorized", message: "This phone scanner session has expired or been revoked." }, { status: 401 });
  }
  if (!mobileAccess && !context) return Response.json({ result: "unauthorized" }, { status: 401 });
  if (context && !workspaceRoleHasPermission(context.membership.role, "checkin.perform")) {
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

  const { eventId, token, deviceId, checkpointId } = parsed.data;
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

  let result: Awaited<ReturnType<typeof validateTicket>>;
  try {
    result = await validateTicket(ticketId, workspaceId);
  } catch (error) {
    if (error instanceof CheckpointCapacityReached) {
      const checkpoint = checkpointId
        ? await prisma.eventCheckpoint.findFirst({
            where: { id: checkpointId, eventId },
            select: { id: true },
          })
        : null;
      return checkpoint
        ? Response.json({ result: "checkpoint_full", message: "This checkpoint has reached its capacity." }, { status: 409 })
        : Response.json({ result: "invalid_checkpoint", message: "This checkpoint is no longer available." }, { status: 404 });
    }
    const uniqueTarget = error instanceof Prisma.PrismaClientKnownRequestError
      ? error.meta?.target
      : undefined;
    const duplicateCheckpointClaim =
      Array.isArray(uniqueTarget)
        ? uniqueTarget.includes("checkpointId") && uniqueTarget.includes("registrationId")
        : typeof uniqueTarget === "string" && uniqueTarget.includes("checkpointId_registrationId");
    if (checkpointId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" && duplicateCheckpointClaim) {
      return Response.json({ result: "already_claimed", message: "This guest has already claimed this checkpoint." }, { status: 409 });
    }
    throw error;
  }

  async function validateTicket(ticketId: string, workspaceId: string) {
    return prisma.$transaction(async (transaction) => {
    const ticket = await transaction.ticket.findUnique({
      where: { id: ticketId },
      include: {
        registration: {
          include: {
            attendee: { select: { firstName: true, lastName: true, email: true } },
            event: {
              select: {
                id: true,
                workspaceId: true,
                name: true,
                startsAt: true,
                endsAt: true,
                timezone: true,
                status: true,
                archivedAt: true,
                settings: { select: { customBranding: true } },
              },
            },
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

    if (checkpointId) {
      if (ticket.status !== "USED") {
        return {
          result: "main_checkin_required" as const,
          attendeeName: `${ticket.registration.attendee.firstName} ${ticket.registration.attendee.lastName}`,
        };
      }

      const mainCheckin = await transaction.attendanceLog.findFirst({
        where: {
          eventId,
          registrationId: ticket.registrationId,
          action: "CHECK_IN",
        },
        select: { id: true },
      });
      if (!mainCheckin) {
        return {
          result: "main_checkin_required" as const,
          attendeeName: `${ticket.registration.attendee.firstName} ${ticket.registration.attendee.lastName}`,
        };
      }

      const checkpoint = await transaction.eventCheckpoint.findFirst({
        where: { id: checkpointId, eventId },
        select: { id: true, name: true, capacity: true },
      });
      if (!checkpoint) return { result: "invalid_checkpoint" as const };

      const scanDeviceId = mobileAccess?.id ?? deviceId;
      await transaction.checkpointClaim.create({
        data: {
          checkpointId: checkpoint.id,
          registrationId: ticket.registrationId,
          operatorId: mobileAccess ? null : context?.user.id ?? null,
          deviceId: scanDeviceId ?? null,
        },
      });

      const updated = await transaction.$executeRaw`
        UPDATE "EventCheckpoint"
        SET "claimedCount" = "claimedCount" + 1, "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${checkpoint.id}
          AND "eventId" = ${eventId}
          AND ("capacity" IS NULL OR "claimedCount" < "capacity")
      `;
      if (updated !== 1) throw new CheckpointCapacityReached();

      await transaction.activityLog.create({
        data: {
          workspaceId,
          actorId: mobileAccess ? null : context?.user.id ?? null,
          action: "attendee.checkpoint_claimed",
          entityType: "checkpoint_claim",
          entityId: ticket.registrationId,
          metadata: {
            eventId,
            checkpointId: checkpoint.id,
            checkpointName: checkpoint.name,
            ...(mobileAccess ? { scanner: mobileAccess.deviceName } : {}),
          },
        },
      });

      return {
        result: "claimed" as const,
        attendeeName: `${ticket.registration.attendee.firstName} ${ticket.registration.attendee.lastName}`,
        checkpointName: checkpoint.name,
      };
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
      attendeeEmail: ticket.registration.attendee.email,
      eventName: ticket.registration.event.name,
      eventStartsAt: ticket.registration.event.startsAt,
      eventEndsAt: ticket.registration.event.endsAt,
      eventTimeZone: ticket.registration.event.timezone,
      eventLogo: readEventLogo(ticket.registration.event.settings?.customBranding),
      checkedInAt: now.toISOString(),
    };
    });
  }

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
  if (result.result === "main_checkin_required") {
    return Response.json({ ...result, message: "Check in this guest at the main entrance before recording a checkpoint claim." }, { status: 409 });
  }
  if (result.result === "invalid_checkpoint") {
    return Response.json({ ...result, message: "This checkpoint is no longer available." }, { status: 404 });
  }
  if (result.result === "claimed") {
    return Response.json({ ...result }, { status: 200 });
  }
  if (result.result !== "checked_in") {
    console.error("Unexpected check-in validation result:", result.result);
    return Response.json({ result: "invalid_request", message: "This ticket could not be checked in." }, { status: 500 });
  }

  const { eventLogo, ...publicResult } = result;
  let certificateEmailStatus: "sent" | "failed" | "no_email" | "unavailable" = "no_email";
  let certificatePdf: Buffer;
  try {
    certificatePdf = await generateAttendanceCertificate({
      attendeeName: result.attendeeName,
      eventName: result.eventName,
      eventStartsAt: result.eventStartsAt,
      eventEndsAt: result.eventEndsAt,
      checkedInAt: new Date(result.checkedInAt),
      timeZone: result.eventTimeZone,
      eventLogo,
    });
  } catch (error) {
    console.error("Attendance certificate could not be generated:", error instanceof Error ? error.message : "Unknown error");
    certificateEmailStatus = "unavailable";
    return Response.json({ ...publicResult, certificateEmailStatus }, { status: 200 });
  }

  if (result.attendeeEmail) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL;
      if (!baseUrl) throw new Error("Set NEXT_PUBLIC_APP_URL or BETTER_AUTH_URL to enable certificate email delivery.");
      const appUrl = new URL(baseUrl);
      if (!["http:", "https:"].includes(appUrl.protocol)) throw new Error("The application URL must use HTTP or HTTPS.");
      if (
        appUrl.username ||
        appUrl.password ||
        ["localhost", "127.0.0.1", "[::1]"].includes(appUrl.hostname) ||
        appUrl.hostname.endsWith(".localhost")
      ) {
        throw new Error("Certificate email delivery requires a public application URL without credentials.");
      }

      const certificateUrl = new URL(`/t/${encodeURIComponent(token)}/certificate`, appUrl);
      await sendAttendanceCertificateEmail({
        to: result.attendeeEmail,
        guestName: result.attendeeName,
        eventName: result.eventName,
        certificateUrl: certificateUrl.toString(),
        certificatePdf,
      });
      certificateEmailStatus = "sent";
    } catch (error) {
      console.error("Attendance certificate email could not be sent:", error instanceof Error ? error.message : "Unknown error");
      certificateEmailStatus = "failed";
    }
  }

  return Response.json({ ...publicResult, certificateEmailStatus }, { status: 200 });
}
