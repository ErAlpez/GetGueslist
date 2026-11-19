import { timingSafeEqual } from "node:crypto";
import { runAutomatedFollowups } from "@/lib/automated-followups";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) {
    return Response.json({ error: "CRON_SECRET must be set to a random value of at least 32 characters." }, { status: 500 });
  }

  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  return Response.json(await runAutomatedFollowups());
}
