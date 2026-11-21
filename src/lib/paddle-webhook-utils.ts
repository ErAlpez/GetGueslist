import { createHmac, timingSafeEqual } from "node:crypto";

export type PaddleSubscriptionStatus =
  | "TRIALING"
  | "ACTIVE"
  | "PAST_DUE"
  | "PAUSED"
  | "CANCELLED";

export function verifyPaddleWebhookSignature(
  payload: string,
  header: string | null,
  secret: string,
  now = Date.now(),
) {
  if (!header || !secret) return false;

  const parts = header.split(";").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("ts="))?.slice(3);
  const signatures = parts
    .filter((part) => part.startsWith("h1="))
    .map((part) => part.slice(3));
  const timestampSeconds = Number(timestamp);
  if (
    !timestamp ||
    !Number.isSafeInteger(timestampSeconds) ||
    Math.abs(now - timestampSeconds * 1000) > 5 * 60 * 1000
  ) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}:${payload}`)
    .digest();

  return signatures.some((signature) => {
    if (!/^[\da-f]{64}$/i.test(signature)) return false;
    const actual = Buffer.from(signature, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}

export function mapPaddleSubscriptionStatus(status: string): PaddleSubscriptionStatus | null {
  switch (status) {
    case "trialing":
      return "TRIALING";
    case "active":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "paused":
      return "PAUSED";
    case "canceled":
      return "CANCELLED";
    default:
      return null;
  }
}
