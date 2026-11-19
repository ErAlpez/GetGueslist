import { CertificateTextError, generateAttendanceCertificate } from "@/lib/certificate";
import { getTicketIdFromToken, hashTicketToken, verifyTicketToken } from "@/lib/tickets";
import { getPrisma } from "@/lib/prisma";
import { readEventLogo } from "@/lib/event-logo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: RouteContext<"/t/[token]/certificate">) {
  const { token } = await params;
  if (!verifyTicketToken(token)) return new Response("Certificate unavailable.", { status: 404 });

  const ticketId = getTicketIdFromToken(token);
  if (!ticketId) return new Response("Certificate unavailable.", { status: 404 });

  const ticket = await getPrisma().ticket.findFirst({
    where: {
      id: ticketId,
      tokenHash: hashTicketToken(token),
      status: "USED",
      attendanceLogs: { some: { action: "CHECK_IN" } },
    },
    select: {
      registration: {
        select: {
          attendee: { select: { firstName: true, lastName: true } },
          event: {
            select: {
              name: true,
              startsAt: true,
              endsAt: true,
              timezone: true,
              settings: { select: { customBranding: true } },
            },
          },
        },
      },
      attendanceLogs: {
        where: { action: "CHECK_IN" },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });
  const checkedInAt = ticket?.attendanceLogs[0]?.createdAt;
  if (!ticket || !checkedInAt) return new Response("Certificate available after check-in.", { status: 404 });

  let pdf: Buffer;
  try {
    pdf = await generateAttendanceCertificate({
      attendeeName: `${ticket.registration.attendee.firstName} ${ticket.registration.attendee.lastName}`,
      eventName: ticket.registration.event.name,
      eventStartsAt: ticket.registration.event.startsAt,
      eventEndsAt: ticket.registration.event.endsAt,
      checkedInAt,
      timeZone: ticket.registration.event.timezone,
      eventLogo: readEventLogo(ticket.registration.event.settings?.customBranding),
    });
  } catch (error) {
    if (error instanceof CertificateTextError) {
      return new Response("This certificate cannot be rendered because the attendee or event name uses an unsupported script combination.", {
        status: 422,
      });
    }
    throw error;
  }

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="attendance-certificate.pdf"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
