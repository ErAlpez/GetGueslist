import Link from "next/link";
import { ArrowLeft, ArrowRight, Filter, Plus, Search, UsersRound } from "lucide-react";
import { attendeeCategories } from "@/lib/attendee-categories";
import { getPrisma } from "@/lib/prisma";
import { requireWorkspaceSection } from "@/lib/workspace";
import { workspaceRoleHasPermission } from "@/lib/workspace-roles";
import { workspaceHasFeature } from "@/lib/plan-features";
import { getPreferences } from "@/lib/preferences";
import { localizeNode } from "@/lib/localization";
import { exclusiveDateEnd, parseDateParam } from "@/lib/date-range";
import { VenuGuestPassDateRange } from "@/components/venuguestpass-date-range";
import { GuestCsvImport } from "@/components/guest-csv-import";
import { DownloadButton } from "@/components/download-button";
import { AnimatedMetric } from "@/components/animated-metric";
import { VenuGuestPassOfflineCache } from "@/components/venuguestpass-offline-cache";

type AttendeesPageProps = {
  searchParams: Promise<{ q?: string; event?: string; category?: string; from?: string; to?: string; page?: string }>;
};

const pageSize = 20;

function formatRegistrationAnswer(value: unknown) {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value === null || value === undefined) return "";
  return JSON.stringify(value) ?? "";
}

export default async function AttendeesPage({ searchParams }: AttendeesPageProps) {
  const { locale } = await getPreferences();
  const context = await requireWorkspaceSection("attendees");
  const canManageAttendees = workspaceRoleHasPermission(context.membership.role, "attendees.manage");
  const canManageEvents = workspaceRoleHasPermission(context.membership.role, "events.manage");
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const canFilterAttendees = workspaceHasFeature(context.subscription, "guestlist_filters");
  const canExportCsv = workspaceHasFeature(context.subscription, "csv_exports");
  const canExportWorkspace = workspaceHasFeature(context.subscription, "workspace_exports");
  const requestedEventId = canFilterAttendees ? params.event ?? "" : "";
  const category = canFilterAttendees ? attendeeCategories.find((item) => item === params.category) : undefined;
  const fromValue = canFilterAttendees ? params.from ?? "" : "";
  const toValue = canFilterAttendees ? params.to ?? "" : "";
  const from = parseDateParam(fromValue);
  const to = parseDateParam(toValue);
  const hasInvalidDate = (fromValue !== "" && from === null) || (toValue !== "" && to === null);
  const dateRangeError = hasInvalidDate
    ? "Choose valid dates for the registration range."
    : from && to && from > to
      ? "The start date must be on or before the end date."
      : "";
  const requestedPage = Number(params.page ?? 1);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const prisma = getPrisma();

  const [events, selectedEvent] = await Promise.all([
    prisma.event.findMany({
      where: { workspaceId: context.workspace.id, archivedAt: null },
      select: { id: true, name: true, startsAt: true },
      orderBy: { startsAt: "desc" },
    }),
    requestedEventId
      ? prisma.event.findFirst({
          where: { id: requestedEventId, workspaceId: context.workspace.id, archivedAt: null },
          select: { id: true, name: true },
        })
      : Promise.resolve(null),
  ]);
  const registrationWhere = {
    event: {
      workspaceId: context.workspace.id,
      ...(requestedEventId ? { id: selectedEvent?.id ?? "__no_event__" } : {}),
    },
    ...(category ? { category } : {}),
    ...(!dateRangeError && (from || to) ? {
      registeredAt: {
        ...(from ? { gte: from } : {}),
        ...(to ? { lt: exclusiveDateEnd(to) } : {}),
      },
    } : {}),
    ...(query ? {
      attendee: {
        OR: [
          { firstName: { contains: query, mode: "insensitive" as const } },
          { lastName: { contains: query, mode: "insensitive" as const } },
          { email: { contains: query, mode: "insensitive" as const } },
        ],
      },
    } : {}),
  };
  const totalCount = dateRangeError ? 0 : await prisma.eventRegistration.count({ where: registrationWhere });
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(page, totalPages);
  const registrations = dateRangeError ? [] : await prisma.eventRegistration.findMany({
    where: registrationWhere,
    include: {
      attendee: true,
      event: { select: { id: true, name: true } },
      answers: { include: { question: { select: { label: true, position: true } } } },
      ticket: {
        select: {
          id: true,
          displayId: true,
          status: true,
          attendanceLogs: {
            where: { action: "CHECK_IN" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      },
    },
    orderBy: { registeredAt: "desc" },
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
  });

  function attendeesHref(nextPage?: number, includeEvent = true) {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (includeEvent && requestedEventId) search.set("event", requestedEventId);
    if (category) search.set("category", category);
    if (fromValue) search.set("from", fromValue);
    if (toValue) search.set("to", toValue);
    if (nextPage !== undefined) search.set("page", String(nextPage));
    const queryString = search.toString();
    return queryString ? `/dashboard/attendees?${queryString}` : "/dashboard/attendees";
  }

  function pageHref(nextPage: number) {
    return attendeesHref(nextPage);
  }

  const addHref = selectedEvent
    ? `/dashboard/events/${selectedEvent.id}/guestlist/add`
    : events[0]
      ? `/dashboard/events/${events[0].id}/guestlist/add`
      : "/dashboard/events/new";
  let exportControl = <span className="plan-gated-label">CSV export requires Starter</span>;
  if (canExportCsv) {
    if (requestedEventId || canExportWorkspace) {
      exportControl = <DownloadButton href="/api/guestlist/export" label="Export CSV" useFormFilters />;
    } else {
      exportControl = <span className="plan-gated-label">Select an event to export; workspace-wide exports require Max</span>;
    }
  }

  return localizeNode((
    <div className="venuguestpass-page">
      <VenuGuestPassOfflineCache snapshot={{
        userId: context.user.id,
        workspaceId: context.workspace.id,
        workspaceName: context.workspace.name,
        cachedAt: new Date().toISOString(),
        events: events.map(({ id, name }) => ({ id, name })),
        registrations: registrations.map((registration) => ({
          id: registration.id,
          eventName: registration.event.name,
          firstName: registration.attendee.firstName,
          lastName: registration.attendee.lastName,
          email: registration.attendee.email,
          category: registration.category,
          rsvpStatus: registration.rsvpStatus,
          registeredAt: registration.registeredAt.toISOString(),
          ticketId: registration.ticket?.displayId ?? null,
          checkedInAt: registration.ticket?.attendanceLogs[0]?.createdAt.toISOString() ?? null,
        })),
      }} />
      <div className="page-heading-row">
        <div><div className="page-kicker">ATTENDEE MANAGEMENT</div><h1>Attendees</h1><p>Search attendees and registrations across your workspace.</p></div>
        <div className="venuguestpass-actions">
          {canManageAttendees && (
            <GuestCsvImport
              events={events.map(({ id, name }) => ({ id, name }))}
              initialEventId={selectedEvent?.id ?? (events.length === 1 ? events[0].id : "")}
            />
          )}
          {canManageAttendees && <Link className="button button-dark app-primary-button" href={addHref}><Plus size={14} /> Add guest</Link>}
        </div>
      </div>
      <section className="app-panel venuguestpass-panel">
        <form action="/dashboard/attendees" className="venuguestpass-toolbar">
          <label className="dashboard-search-field guest-search"><Search aria-hidden="true" size={14} /><input aria-label="Search name or email" defaultValue={query} name="q" placeholder="Search name or email" /><button aria-label="Search attendees" type="submit"><ArrowRight aria-hidden="true" size={13} /></button></label>
          {canFilterAttendees ? (
            <>
              <select aria-label="Filter by event" defaultValue={requestedEventId} name="event">
                <option value="">All events</option>
                {events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}
              </select>
              <select aria-label="Filter by category" defaultValue={category ?? ""} name="category"><option value="">All categories</option>{attendeeCategories.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select>
              <VenuGuestPassDateRange initialFrom={fromValue} initialTo={toValue} key={`${fromValue}:${toValue}`} />
              <button className="venuguestpass-filter-submit" type="submit"><Filter size={14} /> Apply filters</button>
            </>
          ) : <span className="plan-gated-label">Attendee filters require Starter</span>}
          {exportControl}
        </form>
        {dateRangeError && <p className="venuguestpass-filter-error" role="alert">{dateRangeError}</p>}
        {selectedEvent && <div className="selected-event-banner"><span>Showing guests for <strong>{selectedEvent.name}</strong></span><Link href={attendeesHref(undefined, false)}>Clear event filter</Link></div>}
        {registrations.length ? (
          <>
            <div className="guest-table-scroll">
              <table className="guest-table">
                <thead><tr><th>Attendee</th><th>Event</th><th>Category</th><th>RSVP</th><th>Meal</th><th>Ticket ID</th><th>Registered</th><th>Check-in</th></tr></thead>
                <tbody>{registrations.map((registration) => (
                  <tr key={registration.id}>
                    <td>
                      <span className="guest-name">{registration.attendee.firstName} {registration.attendee.lastName}</span>
                      <span className="guest-email">{registration.attendee.email}</span>
                      {(registration.age !== null || registration.gender !== null || registration.answers.length > 0) && (
                        <details className="guest-registration-answers">
                          <summary>Registration answers <span>({registration.answers.length + (registration.age !== null ? 1 : 0) + (registration.gender !== null ? 1 : 0)})</span></summary>
                          <dl>
                            {registration.age !== null && <div><dt>Age</dt><dd>{registration.age}</dd></div>}
                            {registration.gender !== null && <div><dt>Gender</dt><dd>{registration.gender === "MALE" ? "Male" : "Female"}</dd></div>}
                            {[...registration.answers].sort((a, b) => a.question.position - b.question.position).map((answer) => (
                            <div key={answer.id}><dt>{answer.question.label}</dt><dd>{formatRegistrationAnswer(answer.value)}</dd></div>
                            ))}
                          </dl>
                        </details>
                      )}
                    </td>
                    <td>{registration.event.name}</td>
                    <td><span className="category-chip">{registration.category.toLowerCase().replaceAll("_", " ")}</span></td>
                    <td><span className="category-chip">{registration.rsvpStatus.toLowerCase()}</span></td>
                    <td>{registration.mealChoice ?? "—"}{(registration.sessionIds ?? []).length > 0 && <span className="guest-email">{(registration.sessionIds ?? []).length} session{(registration.sessionIds ?? []).length === 1 ? "" : "s"} selected</span>}</td>
                    <td>{registration.ticket ? <span className="ticket-id">{registration.ticket.displayId}</span> : "—"}</td>
                    <td>{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(registration.registeredAt)}</td>
                    <td>{registration.ticket?.attendanceLogs[0] ? <span className="checked-in-label">Checked in · {new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(registration.ticket.attendanceLogs[0].createdAt)}</span> : <span className="not-checked-label">Not checked in</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className="table-pagination"><span><AnimatedMetric locale={locale} value={totalCount} /> {totalCount === 1 ? "registration" : "registrations"}</span><div><Link aria-disabled={currentPage <= 1} className={currentPage <= 1 ? "disabled" : ""} href={pageHref(Math.max(1, currentPage - 1))}><ArrowLeft size={13} /> Previous</Link><span>Page {currentPage} of {totalPages}</span><Link aria-disabled={currentPage >= totalPages} className={currentPage >= totalPages ? "disabled" : ""} href={pageHref(Math.min(totalPages, currentPage + 1))}>Next <ArrowRight size={13} /></Link></div></div>
          </>
        ) : (
          <div className="empty-state venuguestpass-empty">
            <span className="empty-state-icon"><UsersRound size={20} /></span>
            <strong>{query || category || requestedEventId || fromValue || toValue ? "No guests match these filters" : "Your attendee list is ready"}</strong>
            <p>{events.length ? "Attendee registrations for this workspace will appear here." : "No events have been added to this workspace yet."}</p>
            {events.length
              ? canManageAttendees && <Link className="text-link" href={addHref}>Add your first guest <ArrowRight size={14} /></Link>
              : canManageEvents && <Link className="text-link" href="/dashboard/events/new">Create an event <ArrowRight size={14} /></Link>}
          </div>
        )}
      </section>
    </div>
  ), locale);
}
