import Link from "next/link";
import { ArrowRight, QrCode, Ticket } from "lucide-react";
import { DownloadButton } from "@/components/download-button";
import { TicketQr } from "@/components/ticket-qr";
import { createTicketToken } from "@/lib/tickets";
import { getPrisma } from "@/lib/prisma";
import { getPreferences } from "@/lib/preferences";
import { localizeNode } from "@/lib/localization";
import { requireWorkspaceContext } from "@/lib/workspace";
import "./tickets.css";

type TicketsPageProps = {
  searchParams: Promise<{ event?: string; issued?: string }>;
};

export default async function TicketsPage({ searchParams }: TicketsPageProps) {
  const { locale } = await getPreferences();
  const context = await requireWorkspaceContext();
  const { event: eventId, issued } = await searchParams;
  const prisma = getPrisma();
  const events = await prisma.event.findMany({
    where: { workspaceId: context.workspace.id, archivedAt: null },
    select: { id: true, name: true },
    orderBy: { startsAt: "desc" },
  });
  const selectedEvent = eventId
    ? events.find((event) => event.id === eventId) ?? null
    : null;
  const tickets = await prisma.ticket.findMany({
    where: {
      registration: {
        event: {
          workspaceId: context.workspace.id,
          ...(eventId ? { id: selectedEvent?.id ?? "__no_event__" } : {}),
        },
      },
    },
    include: {
      registration: {
        include: {
          attendee: { select: { firstName: true, lastName: true, email: true } },
          event: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const issuedTicket = issued ? tickets.find((ticket) => ticket.id === issued) : undefined;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

  return localizeNode((
    <div className="tickets-page">
      <div className="page-heading-row">
        <div><div className="page-kicker">TICKETING</div><h1>Tickets</h1><p>Unique QR tickets issued to your guests.</p></div>
        <DownloadButton href={eventId ? `/api/guestlist/export?event=${encodeURIComponent(eventId)}` : "/api/guestlist/export"} label="Export guestlist" />
      </div>
      {issuedTicket && <p className="form-message form-success ticket-success">QR ticket created for {issuedTicket.registration.attendee.firstName} {issuedTicket.registration.attendee.lastName}.</p>}
      <nav aria-label="Tickets" className="ticket-filters">
        <Link aria-current={!eventId ? "page" : undefined} className={!eventId ? "selected" : ""} href="/dashboard/tickets">All events</Link>
        {events.map((event) => <Link aria-current={eventId === event.id ? "page" : undefined} className={eventId === event.id ? "selected" : ""} href={`/dashboard/tickets?event=${event.id}`} key={event.id}>{event.name}</Link>)}
      </nav>
      {tickets.length ? (
        <div className="ticket-grid">
          {tickets.map((ticket) => {
            const token = createTicketToken(ticket.id);
            const publicUrl = `${baseUrl}/t/${token}`;
            const isIssued = ticket.id === issued;
            return (
              <article className={`ticket-card${isIssued ? " ticket-card-highlight" : ""}`} key={ticket.id}>
                <div className="ticket-card-info">
                  <span className={`status-pill status-${ticket.status.toLowerCase()}`}>{ticket.status.toLowerCase()}</span>
                  <h2>{ticket.registration.attendee.firstName} {ticket.registration.attendee.lastName}</h2>
                  <div className="ticket-card-meta">
                    <p>{ticket.registration.event.name}</p>
                    <span className="ticket-card-id">ID: {ticket.displayId}</span>
                  </div>
                  <Link className="ticket-open-link" href={`/t/${token}`} rel="noreferrer" target="_blank">Open digital ticket <ArrowRight size={13} /></Link>
                </div>
                <div className="ticket-card-code">
                  <TicketQr size={94} value={publicUrl} />
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <section className="app-panel tickets-empty">
          <div className="empty-state">
            <span className="empty-state-icon"><QrCode size={20} /></span>
            <strong>No tickets yet</strong>
            <p>Add a guest to an event to issue a unique QR ticket.</p>
            {events[0] && <Link className="text-link" href={`/dashboard/events/${selectedEvent?.id ?? events[0].id}/guestlist/add`}>Add a guest <ArrowRight size={14} /></Link>}
            {!events.length && <Link className="text-link" href="/dashboard/events/new">Create an event <ArrowRight size={14} /></Link>}
          </div>
        </section>
      )}
      {tickets.length === 100 && <p className="ticket-limit-note"><Ticket size={13} /> Showing the latest 100 tickets. Filter by event to narrow the list.</p>}
    </div>
  ), locale);
}
