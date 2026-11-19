import "server-only";

import { getPrisma } from "@/lib/prisma";
import { getTicketIdFromToken, hashTicketToken, verifyTicketToken } from "@/lib/tickets";

export async function getEventFeedbackTicket(token: string) {
  if (!verifyTicketToken(token)) return null;
  const ticketId = getTicketIdFromToken(token);
  if (!ticketId) return null;

  const ticket = await getPrisma().ticket.findFirst({
    where: {
      id: ticketId,
      tokenHash: hashTicketToken(token),
      status: "USED",
      attendanceLogs: { some: { action: "CHECK_IN" } },
    },
    select: {
      registrationId: true,
      registration: {
        select: {
          event: {
            select: {
              id: true,
              name: true,
              startsAt: true,
              endsAt: true,
              timezone: true,
              venue: true,
              status: true,
              archivedAt: true,
            },
          },
          feedback: { select: { rating: true, message: true, submittedAt: true } },
        },
      },
    },
  });
  if (
    !ticket ||
    ticket.registration.event.status === "DRAFT" ||
    ticket.registration.event.status === "CANCELLED" ||
    ticket.registration.event.archivedAt
  ) {
    return null;
  }
  return ticket;
}
