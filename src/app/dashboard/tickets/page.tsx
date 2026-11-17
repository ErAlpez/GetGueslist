import Link from "next/link";
import { ArrowLeft, ArrowRight, QrCode } from "lucide-react";
import { DownloadButton } from "@/components/download-button";
import { createTicketToken } from "@/lib/tickets";
import { getPrisma } from "@/lib/prisma";
import { getPreferences } from "@/lib/preferences";
import { localizeNode } from "@/lib/localization";
import { requireWorkspaceContext } from "@/lib/workspace";
import { AnimatedMetric } from "@/components/animated-metric";
import "./tickets.css";

type TicketsPageProps = {
  searchParams: Promise<{ event?: string; issued?: string; page?: string }>;
};

const pageSize = 20;

export default async function TicketsPage({ searchParams }: TicketsPageProps) {
  const { locale } = await getPreferences();
  const context = await requireWorkspaceContext();
  const { event: eventId, issued, page: pageParam } = await searchParams;
  const requestedPage = Number(pageParam ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const prisma = getPrisma();
  const [events, allGuestCount] = await Promise.all([
    prisma.event.findMany({
      where: { workspaceId: context.workspace.id, archivedAt: null },
      select: {
        id: true,
        name: true,
        _count: { select: { registrations: true } },
      },
      orderBy: { startsAt: "desc" },
    }),
    prisma.eventRegistration.count({
      where: { event: { workspaceId: context.workspace.id } },
    }),
  ]);
  const selectedEvent = eventId
    ? events.find((event) => event.id === eventId) ?? null
    : null;
  const ticketWhere = {
    registration: {
      event: {
        workspaceId: context.workspace.id,
        ...(eventId ? { id: selectedEvent?.id ?? "__no_event__" } : {}),
      },
    },
  };
  const totalCount = await prisma.ticket.count({ where: ticketWhere });
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const tickets = await prisma.ticket.findMany({
    where: ticketWhere,
    include: {
      registration: {
        include: {
          attendee: { select: { firstName: true, lastName: true, email: true } },
          event: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
  });

  const issuedTicket = issued ? tickets.find((ticket) => ticket.id === issued) : undefined;

  function ticketsHref(nextPage?: number) {
    const search = new URLSearchParams();
    if (eventId) search.set("event", eventId);
    if (nextPage !== undefined) search.set("page", String(nextPage));
    const query = search.toString();
    return query ? `/dashboard/tickets?${query}` : "/dashboard/tickets";
  }

  return localizeNode((
    <div className="tickets-page">
      <div className="page-heading-row">
        <div><div className="page-kicker">TICKETING</div><h1>Tickets</h1><p>Unique QR tickets issued to your guests.</p></div>
        <DownloadButton href={eventId ? `/api/guestlist/export?event=${encodeURIComponent(eventId)}` : "/api/guestlist/export"} label="Export guestlist" />
      </div>
      {issuedTicket && <p className="form-message form-success ticket-success">QR ticket created for {issuedTicket.registration.attendee.firstName} {issuedTicket.registration.attendee.lastName}.</p>}
      <nav aria-label="Tickets" className="ticket-filters">
        <Link aria-current={!eventId ? "page" : undefined} className={!eventId ? "selected" : ""} href="/dashboard/tickets">
          <span>All events</span><span className="ticket-filter-count">{allGuestCount}</span>
        </Link>
        {events.map((event) => (
          <Link
            aria-current={eventId === event.id ? "page" : undefined}
            className={eventId === event.id ? "selected" : ""}
            href={`/dashboard/tickets?event=${event.id}`}
            key={event.id}
          >
            <span>{event.name}</span><span className="ticket-filter-count">{event._count.registrations}</span>
          </Link>
        ))}
      </nav>
      {tickets.length ? (
        <>
          <div className="guest-table-scroll">
            <table aria-label="Tickets" className="guest-table ticket-table">
              <thead><tr><th scope="col">Attendee</th><th scope="col">Status</th><th scope="col">Issued</th><th scope="col">Digital ticket</th></tr></thead>
              <tbody>{tickets.map((ticket) => {
                const token = createTicketToken(ticket.id);
                const isIssued = ticket.id === issued;
                return (
                  <tr className={isIssued ? "ticket-row-highlight" : undefined} key={ticket.id}>
                    <td>
                      <span className="guest-name">{ticket.registration.attendee.firstName} {ticket.registration.attendee.lastName}</span>
                      {ticket.registration.attendee.email && <span className="guest-email">{ticket.registration.attendee.email}</span>}
                    </td>
                    <td><span className={`status-pill status-${ticket.status.toLowerCase()}`}>{ticket.status.toLowerCase()}</span></td>
                    <td>{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(ticket.createdAt)}</td>
                    <td><Link className="ticket-open-link" href={`/t/${token}`} rel="noreferrer" target="_blank">Open digital ticket <ArrowRight size={13} /></Link></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <div className="table-pagination">
            <span><AnimatedMetric locale={locale} value={totalCount} /> {totalCount === 1 ? "ticket" : "tickets"}</span>
            <div>
              <Link aria-disabled={currentPage <= 1} className={currentPage <= 1 ? "disabled" : ""} href={ticketsHref(Math.max(1, currentPage - 1))}><ArrowLeft size={13} /> Previous</Link>
              <span>Page {currentPage} of {totalPages}</span>
              <Link aria-disabled={currentPage >= totalPages} className={currentPage >= totalPages ? "disabled" : ""} href={ticketsHref(Math.min(totalPages, currentPage + 1))}>Next <ArrowRight size={13} /></Link>
            </div>
          </div>
        </>
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
    </div>
  ), locale);
}
