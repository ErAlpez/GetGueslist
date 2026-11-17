import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function getSigningSecret() {
  const secret = process.env.TICKET_SIGNING_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("TICKET_SIGNING_SECRET must be set to a random value of at least 32 characters.");
  }
  return secret;
}

export function createTicketToken(ticketId: string) {
  const signature = createHmac("sha256", getSigningSecret()).update(ticketId).digest("base64url");
  return `${ticketId}.${signature}`;
}

export function hashTicketToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyTicketToken(token: string) {
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;

  const ticketId = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!ticketId || !signature || ticketId.length > 100) return false;

  const expected = createHmac("sha256", getSigningSecret()).update(ticketId).digest();
  const received = Buffer.from(signature, "base64url");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function getTicketIdFromToken(token: string) {
  const separator = token.lastIndexOf(".");
  return separator > 0 ? token.slice(0, separator) : null;
}
