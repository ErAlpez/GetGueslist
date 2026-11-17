import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getPrisma } from "@/lib/prisma";

export const mobileCheckinCookieName = "guestlist-mobile-checkin";
export const mobileCheckinPairingLifetimeMs = 5 * 60 * 1000;
export const mobileCheckinSessionLifetimeMs = 12 * 60 * 60 * 1000;

export function createMobileCheckinToken() {
  return randomBytes(32).toString("base64url");
}

export function hashMobileCheckinToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    const requestOrigin = new URL(request.url).origin;
    const configuredOrigin = process.env.BETTER_AUTH_URL
      ? new URL(process.env.BETTER_AUTH_URL).origin
      : requestOrigin;
    return origin === requestOrigin || origin === configuredOrigin;
  } catch {
    return false;
  }
}

export async function getMobileCheckinAccess() {
  const token = (await cookies()).get(mobileCheckinCookieName)?.value;
  if (!token) return null;

  const access = await getPrisma().mobileCheckinAccess.findUnique({
    where: { sessionTokenHash: hashMobileCheckinToken(token) },
    include: { event: { select: { id: true, name: true, status: true, archivedAt: true } } },
  });
  if (
    !access ||
    !access.pairedAt ||
    access.revokedAt ||
    !access.sessionExpiresAt ||
    access.sessionExpiresAt <= new Date() ||
    access.event.archivedAt ||
    access.event.status === "COMPLETED" ||
    access.event.status === "CANCELLED"
  ) {
    return null;
  }

  return access;
}

export async function hasMobileCheckinCookie() {
  return Boolean((await cookies()).get(mobileCheckinCookieName)?.value);
}

