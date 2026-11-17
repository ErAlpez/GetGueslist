import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getWorkspaceContext } from "@/lib/workspace";
import {
  createMobileCheckinToken,
  hashMobileCheckinToken,
  isSameOriginRequest,
  mobileCheckinPairingLifetimeMs,
} from "@/lib/mobile-checkin";

const createPairingSchema = z.object({
  eventId: z.string().min(1).max(191),
  deviceName: z.string().trim().min(1).max(60).default("Check-in phone"),
});

const revokeSchema = z.object({
  accessId: z.string().min(1).max(191),
});

function isAccessManager(role: string) {
  return role === "OWNER" || role === "ADMIN";
}

export async function GET(request: Request) {
  const context = await getWorkspaceContext();
  if (!context) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!isAccessManager(context.membership.role)) {
    return Response.json({ error: "Only workspace owners and admins can manage phone scanners." }, { status: 403 });
  }

  const eventId = new URL(request.url).searchParams.get("eventId")?.trim() ?? "";
  if (!eventId) return Response.json({ error: "Choose an event." }, { status: 400 });

  const now = new Date();
  const accesses = await getPrisma().mobileCheckinAccess.findMany({
    where: {
      workspaceId: context.workspace.id,
      eventId,
      revokedAt: null,
      OR: [
        { sessionExpiresAt: { gt: now } },
        { pairedAt: null, pairingExpiresAt: { gt: now } },
      ],
    },
    select: {
      id: true,
      deviceName: true,
      pairedAt: true,
      pairingExpiresAt: true,
      sessionExpiresAt: true,
      lastSeenAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return Response.json({ accesses }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const context = await getWorkspaceContext();
  if (!context) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!isAccessManager(context.membership.role)) {
    return Response.json({ error: "Only workspace owners and admins can manage phone scanners." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = createPairingSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Provide a scanner name and event." }, { status: 400 });

  const event = await getPrisma().event.findFirst({
    where: {
      id: parsed.data.eventId,
      workspaceId: context.workspace.id,
      archivedAt: null,
      status: { notIn: ["COMPLETED", "CANCELLED"] },
    },
    select: { id: true },
  });
  if (!event) return Response.json({ error: "This event is not available for check-in." }, { status: 404 });

  const pairingToken = createMobileCheckinToken();
  const pairingExpiresAt = new Date(Date.now() + mobileCheckinPairingLifetimeMs);
  const access = await getPrisma().mobileCheckinAccess.create({
    data: {
      workspaceId: context.workspace.id,
      eventId: event.id,
      createdById: context.user.id,
      deviceName: parsed.data.deviceName,
      pairingTokenHash: hashMobileCheckinToken(pairingToken),
      pairingExpiresAt,
    },
    select: { id: true, deviceName: true, pairingExpiresAt: true },
  });

  return Response.json(
    { ...access, pairingToken },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const context = await getWorkspaceContext();
  if (!context) return Response.json({ error: "Authentication required." }, { status: 401 });
  if (!isAccessManager(context.membership.role)) {
    return Response.json({ error: "Only workspace owners and admins can manage phone scanners." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Provide a scanner access record." }, { status: 400 });

  const revoked = await getPrisma().mobileCheckinAccess.updateMany({
    where: {
      id: parsed.data.accessId,
      workspaceId: context.workspace.id,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
  if (!revoked.count) return Response.json({ error: "Scanner access was not found or is already revoked." }, { status: 404 });

  return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}

