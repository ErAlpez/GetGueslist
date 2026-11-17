import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import {
  createMobileCheckinToken,
  hashMobileCheckinToken,
  isSameOriginRequest,
  mobileCheckinCookieName,
  mobileCheckinSessionLifetimeMs,
} from "@/lib/mobile-checkin";

const redeemSchema = z.object({
  pairingToken: z.string().min(32).max(100),
});

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = redeemSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "This pairing link is invalid or expired." }, { status: 400 });

  const prisma = getPrisma();
  const now = new Date();
  const access = await prisma.mobileCheckinAccess.findUnique({
    where: { pairingTokenHash: hashMobileCheckinToken(parsed.data.pairingToken) },
    include: { event: { select: { id: true, name: true, status: true, archivedAt: true } } },
  });
  if (
    !access ||
    access.revokedAt ||
    access.pairedAt ||
    access.pairingExpiresAt <= now ||
    access.event.archivedAt ||
    access.event.status === "COMPLETED" ||
    access.event.status === "CANCELLED"
  ) {
    return Response.json({ error: "This pairing link is invalid or expired. Ask the event admin for a new one." }, { status: 410 });
  }

  const sessionToken = createMobileCheckinToken();
  const sessionExpiresAt = new Date(now.getTime() + mobileCheckinSessionLifetimeMs);
  const paired = await prisma.mobileCheckinAccess.updateMany({
    where: {
      id: access.id,
      pairedAt: null,
      revokedAt: null,
      pairingExpiresAt: { gt: now },
    },
    data: {
      pairedAt: now,
      sessionTokenHash: hashMobileCheckinToken(sessionToken),
      sessionExpiresAt,
      lastSeenAt: now,
    },
  });
  if (paired.count !== 1) {
    return Response.json({ error: "This pairing link has already been used or expired." }, { status: 410 });
  }

  const response = NextResponse.json({
    eventId: access.event.id,
    eventName: access.event.name,
    deviceName: access.deviceName,
    expiresAt: sessionExpiresAt.toISOString(),
  }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set({
    name: mobileCheckinCookieName,
    value: sessionToken,
    expires: sessionExpiresAt,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}

