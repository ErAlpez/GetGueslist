import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import {
  hashMobileCheckinToken,
  isSameOriginRequest,
  mobileCheckinCookieName,
} from "@/lib/mobile-checkin";

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) {
    return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  }

  const token = (await cookies()).get(mobileCheckinCookieName)?.value;
  if (token) {
    await getPrisma().mobileCheckinAccess.updateMany({
      where: {
        sessionTokenHash: hashMobileCheckinToken(token),
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  response.cookies.set({
    name: mobileCheckinCookieName,
    value: "",
    expires: new Date(0),
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}

