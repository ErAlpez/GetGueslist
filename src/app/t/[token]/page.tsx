import { notFound } from "next/navigation";
import { CalendarDays, MapPin, Ticket } from "lucide-react";
import { TicketQr } from "@/components/ticket-qr";
import { NfcTicketWriter } from "@/components/nfc-ticket-writer";
import { DownloadButton } from "@/components/download-button";
import { getPrisma } from "@/lib/prisma";
import { getPreferences } from "@/lib/preferences";
import { localizeNode } from "@/lib/localization";
import { formatEventDateRange } from "@/lib/datetime";
import { getTicketIdFromToken, hashTicketToken, verifyTicketToken } from "@/lib/tickets";
import "./public-ticket.css";

type PublicTicketPageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ email?: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return {
    title: "Your VenuGuestPass ticket",
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

export default async function PublicTicketPage({ params, searchParams }: PublicTicketPageProps) {
  const { locale } = await getPreferences();
  const { token } = await params;
  const { email } = await searchParams;
  if (!verifyTicketToken(token)) notFound();

  const ticketId = getTicketIdFromToken(token);
  if (!ticketId) notFound();
  const ticket = await getPrisma().ticket.findFirst({
    where: { id: ticketId, tokenHash: hashTicketToken(token) },
    include: {
      registration: {
        include: {
          attendee: { select: { firstName: true, lastName: true } },
          event: {
            select: {
              name: true,
              startsAt: true,
              endsAt: true,
              timezone: true,
              venue: true,
              address: true,
              modules: { where: { key: "nfc_check_in" }, select: { enabled: true } },
            },
          },
        },
      },
      attendanceLogs: {
        where: { action: "CHECK_IN" },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!ticket) notFound();

  const statusLabel = ticket.status === "USED" ? "Already checked in" : ticket.status.toLowerCase();
  const event = ticket.registration.event;
  const nfcEnabled = (event.modules ?? []).some((module) => module.enabled);
  const certificateAvailable = ticket.status === "USED" && ticket.attendanceLogs.length > 0;
  const ticketUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/t/${token}`;
  const eventDates = formatEventDateRange(event.startsAt, event.endsAt, event.timezone, locale);
  return localizeNode((
    <main className="public-ticket-page">
      <div className="public-ticket-wrap">
        {email === "failed" && <p className="public-ticket-email-error" role="alert">Registration succeeded, but we could not email your ticket. Save this page or contact the organizer.</p>}
        <article className="public-ticket">
          <div className="public-ticket-header"><span className="ticket-header-mark"><Ticket size={18} /></span><span>DIGITAL EVENT TICKET</span><span className={`status-pill status-${ticket.status.toLowerCase()}`}>{statusLabel}</span></div>
          <div className="public-ticket-main">
            <div className="public-ticket-guest"><span>ADMIT ONE</span><h1>{ticket.registration.attendee.firstName} {ticket.registration.attendee.lastName}</h1><p>{ticket.registration.category.toLowerCase().replaceAll("_", " ")} guest</p></div>
            <div className="public-ticket-qr">
              <TicketQr size={168} value={ticketUrl} />
              <small>Present this QR code at check-in</small>
              {nfcEnabled && ticket.status === "ACTIVE" && <NfcTicketWriter ticketUrl={ticketUrl} />}
            </div>
          </div>
          <div className="public-ticket-details">
            <h2>{ticket.registration.event.name}</h2>
            <span><CalendarDays size={15} /><span><time dateTime={event.startsAt.toISOString()}>{eventDates.start}</time>{" - "}<time dateTime={event.endsAt.toISOString()}>{eventDates.end}</time></span></span>
            {ticket.registration.event.venue && <span><MapPin size={15} />{ticket.registration.event.venue}{ticket.registration.event.address ? ` · ${ticket.registration.event.address}` : ""}</span>}
          </div>
          <div className="public-ticket-footer"><span>Ticket ID</span><strong>{ticket.displayId}</strong><small>Keep this ticket private. It grants entry to the event.</small></div>
        </article>
        {certificateAvailable && (
          <DownloadButton
            className="public-ticket-certificate"
            contentType="application/pdf"
            filename="attendance-certificate.pdf"
            href={`/t/${encodeURIComponent(token)}/certificate`}
            label="Download attendance certificate"
          />
        )}
        <p className="public-ticket-help">Need help with your ticket? Contact the event organizer.</p>
      </div>
    </main>
  ), locale);
}
