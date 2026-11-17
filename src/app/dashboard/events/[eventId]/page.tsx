import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Check,
  ClipboardList,
  CircleHelp,
  Clock3,
  Copy,
  ExternalLink,
  MapPin,
  MoreHorizontal,
  Pencil,
  QrCode,
  ScanLine,
  Settings2,
  UsersRound,
} from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
import { RegistrationFormBuilder } from "@/components/registration-form-builder";
import {
  archiveEventAction,
  deleteEventAction,
  duplicateEventAction,
  publishEventAction,
  unpublishEventAction,
} from "@/app/dashboard/events/actions";
import { getPrisma } from "@/lib/prisma";
import { getPreferences } from "@/lib/preferences";
import { localizeNode } from "@/lib/localization";
import { AnimatedMetric } from "@/components/animated-metric";
import { formatEventDateRange } from "@/lib/datetime";
import { readEventLogo } from "@/lib/event-logo";
import { requireWorkspaceContext } from "@/lib/workspace";
import {
  isRegistrationQuestionType,
  readRegistrationQuestionOptions,
} from "@/lib/registration-form";

type EventDetailPageProps = {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ error?: string; published?: string; unpublished?: string; updated?: string }>;
};

export default async function EventDetailPage({ params, searchParams }: EventDetailPageProps) {
  const { locale } = await getPreferences();
  const { eventId } = await params;
  const context = await requireWorkspaceContext();
  const [event, notices] = await Promise.all([
    getPrisma().event.findFirst({
      where: { id: eventId, workspaceId: context.workspace.id, archivedAt: null },
      include: {
        settings: true,
        modules: { orderBy: { key: "asc" } },
        registrationForm: {
          include: {
            questions: {
              orderBy: { position: "asc" },
              include: { _count: { select: { answers: true } } },
            },
          },
        },
        _count: { select: { registrations: true, attendanceLogs: true } },
      },
    }),
    searchParams,
  ]);
  if (!event) notFound();

  const checkedInCount = await getPrisma().attendanceLog.count({
    where: { eventId: event.id, workspaceId: context.workspace.id, action: "CHECK_IN" },
  });
  const canManage = ["OWNER", "ADMIN", "MANAGER"].includes(context.membership.role);
  const statusLabel = event.status.toLowerCase().replaceAll("_", " ");
  const eventDates = formatEventDateRange(event.startsAt, event.endsAt, event.timezone, locale);
  const canShareRegistration =
    event.visibility !== "INVITE_ONLY" &&
    ["PUBLISHED", "REGISTRATION_OPEN", "ONGOING"].includes(event.status) &&
    event.settings?.allowRegistration !== false &&
    event.settings?.requireApproval !== true &&
    event.registrationForm?.published !== false &&
    event.endsAt > new Date() &&
    (!event.registrationDeadline || event.registrationDeadline > new Date());
  const registrationUrl = new URL(
    `/register/${event.id}`,
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  ).toString();
  const registrationQuestions = event.registrationForm?.questions.flatMap((question) => {
    if (!isRegistrationQuestionType(question.type)) return [];
    return [{
      id: question.id,
      label: question.label,
      type: question.type,
      required: question.required,
      options: readRegistrationQuestionOptions(question.options),
      locked: question._count.answers > 0,
    }];
  }) ?? [];

  return localizeNode((
    <div className="event-detail-page">
      <div className="breadcrumbs"><Link href="/dashboard">Overview</Link><ArrowRight size={12} /><Link href="/dashboard/events">My events</Link><ArrowRight size={12} /><span>{event.name}</span></div>
      {notices.error === "plan_limit" && <p className="form-message form-error event-notice">Your plan’s active event limit has been reached. Upgrade your plan before publishing another event.</p>}
      {notices.error === "registration_closed" && <p className="form-message form-error event-notice">This event’s date or registration deadline has passed, so it can’t be published.</p>}
      {notices.error === "has_registrations" && <p className="form-message form-error event-notice">This event has registrations, so it can’t be deleted. Archive it instead to keep the event history.</p>}
      {notices.error === "permission" && <p className="form-message form-error event-notice">You don’t have permission to edit events in this workspace.</p>}
      {notices.published && <p className="form-message form-success event-notice">Event published. Registration is now open.</p>}
      {notices.unpublished && <p className="form-message form-success event-notice">Event unpublished. Existing event data has been kept.</p>}
      {notices.updated && <p className="form-message form-success event-notice">Event details updated.</p>}

      <section className="event-detail-hero">
        <div className="event-detail-heading">
          <div><div className="event-detail-eyebrow">{event.category} <span>·</span> {event.format.toLowerCase()}</div><h1>{event.name}</h1><p>{event.description || "No event description yet."}</p></div>
        </div>
        <div className="event-detail-actions">
          {event.status === "DRAFT" && canManage ? <form action={publishEventAction}><input name="eventId" type="hidden" value={event.id} /><button className="button button-dark app-primary-button" type="submit"><ExternalLink size={14} /> Publish event</button></form> : null}
          {event.status !== "DRAFT" && canManage ? <form action={unpublishEventAction}><input name="eventId" type="hidden" value={event.id} /><button className="button button-light event-action-button" type="submit">Unpublish</button></form> : null}
          {canManage && (
            <details className="event-more-menu">
              <summary aria-label="More event actions"><MoreHorizontal size={17} /></summary>
              <div className="event-more-popover">
                <Link href={`/dashboard/events/${event.id}/edit`}><Pencil size={13} /> Edit event</Link>
                <form action={duplicateEventAction}><input name="eventId" type="hidden" value={event.id} /><button type="submit"><Copy size={13} /> Duplicate event</button></form>
                <form action={archiveEventAction}><input name="eventId" type="hidden" value={event.id} /><ConfirmButton message="Archive this event? Its records will be kept.">Archive event</ConfirmButton></form>
                <form action={deleteEventAction}><input name="eventId" type="hidden" value={event.id} /><ConfirmButton className="danger-action" message="Permanently delete this event? This is only allowed when it has no registrations.">Delete empty event</ConfirmButton></form>
              </div>
            </details>
          )}
        </div>
        <div className="event-detail-meta">
          <span><Clock3 size={14} />{eventDates.start} - {eventDates.end}</span>
          <span><MapPin size={14} />{event.venue || (event.format === "VIRTUAL" ? "Online" : "Venue not set")}</span>
          <span className={`status-pill status-${event.status.toLowerCase().replaceAll("_", "-")}`}>{statusLabel}</span>
        </div>
      </section>

      <nav aria-label="Event navigation" className="event-tabs">
        <a className="active" href="#overview">Overview</a>
        <Link href={`/dashboard/guestlist?event=${event.id}`}>Guestlist</Link>
        <Link href={`/dashboard/tickets?event=${event.id}`}>Tickets</Link>
        <Link href={`/dashboard/check-in?event=${event.id}`}>Check-in</Link>
        <a href="#attendance">Attendance</a>
        {canManage && <a href="#registration-form">Registration form</a>}
        <a href="#settings">Settings</a>
      </nav>

      <div className="event-detail-grid" id="overview">
        <section className="app-panel event-overview-panel">
          <div className="panel-heading-row"><div><h2>Event overview</h2><p>Registration and attendance at a glance.</p></div></div>
          <div className="event-metric-grid">
            <div><span>Registered</span><strong><AnimatedMetric locale={locale} value={event._count.registrations} /></strong><small>{event.capacity ? `of ${event.capacity} capacity` : "No capacity limit"}</small></div>
            <div><span>Checked in</span><strong><AnimatedMetric locale={locale} value={checkedInCount} /></strong><small>Recorded check-ins</small></div>
            <div><span>Visibility</span><strong className="metric-text">{event.visibility.toLowerCase().replaceAll("_", " ")}</strong><small>Event access</small></div>
          </div>
          {event.capacity && event.capacity > 0 && (
            <div className="event-capacity"><div><span>Capacity used</span><strong><AnimatedMetric locale={locale} value={Math.min(Math.round((event._count.registrations / event.capacity) * 100), 100)} />%</strong></div><div className="usage-bar"><span style={{ width: `${Math.min((event._count.registrations / event.capacity) * 100, 100)}%` }} /></div></div>
          )}
          <div className="event-overview-links">
            <Link href={`/dashboard/guestlist?event=${event.id}`}><UsersRound size={15} /><span><strong>Manage guestlist</strong><small>View or add attendees</small></span><ArrowRight size={14} /></Link>
            <Link href={`/dashboard/check-in?event=${event.id}`}><ScanLine size={15} /><span><strong>Open check-in</strong><small>Validate tickets at the door</small></span><ArrowRight size={14} /></Link>
            <Link href={`/dashboard/tickets?event=${event.id}`}><QrCode size={15} /><span><strong>View tickets</strong><small>Tickets issued for this event</small></span><ArrowRight size={14} /></Link>
            {canManage && <a href="#registration-form"><ClipboardList size={15} /><span><strong>Registration form</strong><small>{canShareRegistration ? "Available to guests" : "Not currently visible to guests"}</small></span><ArrowRight size={14} /></a>}
            {canShareRegistration && <Link href={`/register/${event.id}`} rel="noreferrer" target="_blank"><ExternalLink size={15} /><span><strong>Share registration form</strong><small>Guests can register themselves</small></span><ArrowRight size={14} /></Link>}
          </div>
        </section>

        <section className="app-panel event-config-panel" id="settings">
          <div className="panel-heading-row"><div><h2>Event modules</h2><p>Enabled tools for this event.</p></div><Settings2 size={15} /></div>
          <div className="module-setting-list">
            {event.modules.map((module) => (
              <div className="module-setting-row" key={module.id}>
                <span className={`module-toggle${module.enabled ? " enabled" : ""}`}>{module.enabled && <Check size={10} />}</span>
                <span><strong>{module.key.replaceAll("_", " ")}</strong><small>{module.enabled ? "Enabled" : "Not enabled"}</small></span>
                {!module.enabled && <CircleHelp size={13} />}
              </div>
            ))}
            {!event.modules.length && <p className="muted-note">No modules have been configured.</p>}
          </div>
          <p className="module-note">Module settings are currently read-only in this release. Your event and registration data remain intact when a module is disabled.</p>
        </section>
      </div>
      {canManage && <RegistrationFormBuilder canShareRegistration={canShareRegistration} eventId={event.id} key={JSON.stringify(registrationQuestions)} logo={readEventLogo(event.settings?.customBranding)} questions={registrationQuestions} registrationUrl={registrationUrl} />}
    </div>
  ), locale);
}
