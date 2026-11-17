import Link from "next/link";
import { ArrowRight, CalendarDays, Plus, Search } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { requireWorkspaceContext } from "@/lib/workspace";
import { getPreferences } from "@/lib/preferences";
import { localizeNode } from "@/lib/localization";
import { AnimatedMetric } from "@/components/animated-metric";

type EventsPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function EventsPage({ searchParams }: EventsPageProps) {
  const { locale } = await getPreferences();
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const context = await requireWorkspaceContext();
  const { q = "" } = await searchParams;
  const events = await getPrisma().event.findMany({
    where: {
      workspaceId: context.workspace.id,
      archivedAt: null,
      ...(q.trim() ? { name: { contains: q.trim(), mode: "insensitive" } } : {}),
    },
    include: { _count: { select: { registrations: true } } },
    orderBy: { startsAt: "desc" },
  });

  return localizeNode((
    <div className="events-page">
      <div className="page-heading-row">
        <div><div className="page-kicker">EVENT MANAGEMENT</div><h1>My events</h1><p>Manage events and the details that bring them together.</p></div>
        <Link className="button button-dark app-primary-button" href="/dashboard/events/new"><Plus size={15} /> Create event</Link>
      </div>
      <section className="app-panel events-table-panel">
        <div className="events-toolbar">
          <form action="/dashboard/events" className="event-search"><Search size={14} /><input defaultValue={q} name="q" placeholder="Search events" /><button aria-label="Search events" type="submit"><ArrowRight size={13} /></button></form>
          <span className="event-count"><AnimatedMetric locale={locale} value={events.length} /> {events.length === 1 ? "event" : "events"}</span>
        </div>
        {events.length ? (
          <div className="events-table-scroll">
            <table className="events-table">
              <thead><tr><th>Event</th><th>Date & time</th><th>Venue</th><th>Guests</th><th>Status</th><th><span className="sr-only">Open event</span></th></tr></thead>
              <tbody>{events.map((event) => (
                <tr key={event.id}>
                  <td><Link className="table-event-name" href={`/dashboard/events/${event.id}`}>{event.name}</Link><span className="table-event-sub">{event.category} · {event.format.toLowerCase()}</span></td>
                  <td>{formatter.format(event.startsAt)}</td>
                  <td>{event.venue || (event.format === "VIRTUAL" ? "Online" : "Not set")}</td>
                  <td><AnimatedMetric locale={locale} value={event._count.registrations} />{event.capacity ? <span className="table-capacity"> / {event.capacity}</span> : null}</td>
                  <td><span className={`status-pill status-${event.status.toLowerCase().replaceAll("_", "-")}`}>{event.status.toLowerCase().replaceAll("_", " ")}</span></td>
                  <td><Link aria-label={`View ${event.name}`} className="table-row-action" href={`/dashboard/events/${event.id}`}><ArrowRight size={14} /></Link></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state events-empty">
            <span className="empty-state-icon"><CalendarDays size={20} /></span>
            <strong>{q ? "No events match that search" : "Your next event starts here"}</strong>
            <p>{q ? "Try a different event name." : "Create a draft, add your event details, and invite your first guests."}</p>
            {!q && <Link className="button button-dark app-primary-button" href="/dashboard/events/new"><Plus size={14} /> Create event</Link>}
          </div>
        )}
      </section>
    </div>
  ), locale);
}
