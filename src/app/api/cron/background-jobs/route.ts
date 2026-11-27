import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import {
  getBackgroundWorkerSecret,
  runBackgroundJobWorker,
  scheduleBackgroundJobWorkerContinuation,
} from "@/lib/background-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = getBackgroundWorkerSecret();
  if (!secret) {
    return Response.json({ error: "A worker secret must be set to a random value of at least 32 characters." }, { status: 500 });
  }

  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await runBackgroundJobWorker();
  if (result.hasPending && result.processed > 0) {
    after(scheduleBackgroundJobWorkerContinuation);
  }

  return Response.json({ processed: result.processed });
}
