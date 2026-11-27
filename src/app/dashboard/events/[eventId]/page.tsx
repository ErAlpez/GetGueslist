import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ArrowRight,
  ClipboardList,
  Clock3,
  ExternalLink,
  Gift,
  LockKeyhole,
  MapPin,
  QrCode,
  ScanLine,
  Settings2,
  UsersRound,
} from "lucide-react";
import { RegistrationFormBuilder } from "@/components/registration-form-builder";
import { EventModulesManager } from "@/components/event-modules-manager";
import { EventCheckpointsManager } from "@/components/event-checkpoints-manager";
import { EventAttachmentsManager } from "@/components/event-attachments-manager";
import { EventMoreMenu } from "@/components/event-more-menu";
import {
  publishEventAction,
  unpublishEventAction,
} from "@/app/dashboard/events/actions";
import { getPrisma } from "@/lib/prisma";
import { getPreferences } from "@/lib/preferences";
import { localizeNode } from "@/lib/localization";
import { AnimatedMetric } from "@/components/animated-metric";
import { formatEventDateRange } from "@/lib/datetime";
import { readEventLogo } from "@/lib/event-logo";
import { requireWorkspaceSection } from "@/lib/workspace";
import { workspaceRoleHasPermission } from "@/lib/workspace-roles";
import { workspaceHasFeature } from "@/lib/plan-features";
import {
  isRegistrationQuestionType,
  readRegistrationQuestionOptions,
} from "@/lib/registration-form";

type EventDetailPageProps = {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{
    error?: string;
    published?: string;
    unpublished?: string;
    updated?: string;
    checkpoint?: string;
    checkpointError?: string;
  }>;
};

export default async function EventDetailPage({ params, searchParams }: EventDetailPageProps) {
  const { locale } = await getPreferences();
  const { eventId } = await params;
  const context = await requireWorkspaceSection("events");
  const [event, notices] = await Promise.all([
    getPrisma().event.findFirst({
      where: {
        workspaceId: context.workspace.id,
        archivedAt: null,
        OR: [{ id: eventId }, { slug: eventId }],
      },
      include: {
        settings: true,
        modules: { orderBy: { key: "asc" } },
        checkpoints: { orderBy: { sortOrder: "asc" } },
        attachments: {
          select: { id: true, fileName: true, contentType: true, size: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
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
  if (eventId !== event.slug) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(notices)) {
      if (value) query.set(key, value);
    }
    const queryString = query.toString();
    const checkpointAnchor = notices.checkpoint || notices.checkpointError ? "#checkpoints" : "";
    redirect(`/dashboard/events/${encodeURIComponent(event.slug)}${queryString ? `?${queryString}` : ""}${checkpointAnchor}`);
  }

  const checkedInCount = await getPrisma().attendanceLog.count({
    where: { eventId: event.id, workspaceId: context.workspace.id, action: "CHECK_IN" },
  });
  const canManage = workspaceRoleHasPermission(context.membership.role, "events.manage");
  const canUseEventLifecycle = workspaceHasFeature(context.subscription, "event_lifecycle");
  const canUseAutomatedFollowups =
    ["ACTIVE", "TRIALING"].includes(context.subscription?.status ?? "") &&
    workspaceHasFeature(context.subscription, "automated_followups");
  const eventFeedback = canManage
    ? await getPrisma().eventFeedback.findMany({
        where: { eventId: event.id },
        include: {
          registration: {
            select: { attendee: { select: { firstName: true, lastName: true } } },
          },
        },
        orderBy: { submittedAt: "desc" },
        take: 50,
      })
    : [];
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
      {notices.error === "plan_feature" && <p className="form-message form-error event-notice">Publishing, duplicating, and archiving events require the Starter plan.</p>}
      {notices.error === "registration_closed" && <p className="form-message form-error event-notice">This event’s date or registration deadline has passed, so it can’t be published.</p>}
      {notices.error === "has_registrations" && <p className="form-message form-error event-notice">This event has registrations, so it can’t be deleted. Archive it instead to keep the event history.</p>}
      {notices.error === "permission" && <p className="form-message form-error event-notice">You don’t have permission to edit events in this workspace.</p>}

      <section className="event-detail-hero">
        <div className="event-detail-heading">
          <div><div className="event-detail-eyebrow">{event.category} <span>·</span> {event.format.toLowerCase()}</div><h1>{event.name}</h1><p>{event.description || "No event description yet."}</p></div>
        </div>
        <div className="event-detail-actions">
          {event.status === "DRAFT" && canManage ? canUseEventLifecycle
            ? <form action={publishEventAction}><input name="eventId" type="hidden" value={event.id} /><button className="button button-dark app-primary-button" type="submit"><ExternalLink size={14} /> Publish event</button></form>
            : <span className="plan-gated-label"><LockKeyhole size={12} /> Publish requires Starter</span>
            : null}
          {event.status !== "DRAFT" && canManage ? <form action={unpublishEventAction}><input name="eventId" type="hidden" value={event.id} /><button className="button button-light event-action-button" type="submit">Unpublish</button></form> : null}
          {canManage && (
            <EventMoreMenu canUseEventLifecycle={canUseEventLifecycle} eventId={event.id} />
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
        <Link href={`/dashboard/attendees?event=${event.id}`}>Attendees</Link>
        <Link href={`/dashboard/tickets?event=${event.id}`}>Tickets</Link>
        <Link href={`/dashboard/check-in?event=${event.id}`}>Check-in</Link>
        {canManage && <Link href={`/dashboard/events/${event.id}/raffle`}>Live raffle</Link>}
        <a href="#attendance">Attendance</a>
        {canManage && <a href="#feedback">Feedback</a>}
        {canManage && <a href="#registration-form">Registration form</a>}
        {canManage && <a href="#attachments">Attachments</a>}
        <a href="#checkpoints">Checkpoints</a>
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
            <Link href={`/dashboard/attendees?event=${event.id}`}><UsersRound size={15} /><span><strong>Manage attendees</strong><small>View or add attendees</small></span><ArrowRight size={14} /></Link>
            <Link href={`/dashboard/check-in?event=${event.id}`}><ScanLine size={15} /><span><strong>Open check-in</strong><small>Validate tickets at the door</small></span><ArrowRight size={14} /></Link>
            {canManage && <Link href={`/dashboard/events/${event.id}/raffle`}><Gift size={15} /><span><strong>Live raffle</strong><small>Pick a winner from checked-in guests</small></span><ArrowRight size={14} /></Link>}
            <Link href={`/dashboard/tickets?event=${event.id}`}><QrCode size={15} /><span><strong>View tickets</strong><small>Tickets issued for this event</small></span><ArrowRight size={14} /></Link>
            {canManage && <a href="#registration-form"><ClipboardList size={15} /><span><strong>Registration form</strong><small>{canShareRegistration ? "Available to guests" : "Not currently visible to guests"}</small></span><ArrowRight size={14} /></a>}
            {canShareRegistration && <Link href={`/register/${event.id}`} rel="noreferrer" target="_blank"><ExternalLink size={15} /><span><strong>Share registration form</strong><small>Guests can register themselves</small></span><ArrowRight size={14} /></Link>}
          </div>
        </section>

        <section className="app-panel event-config-panel" id="settings">
          <div className="panel-heading-row"><div><h2>Event modules</h2><p>Enabled tools for this event.</p></div><Settings2 size={15} /></div>
          <EventModulesManager
            eventId={event.id}
            modules={event.modules}
            canManage={canManage}
          />
        </section>
      </div>
      {canManage && <EventAttachmentsManager attachments={event.attachments} eventId={event.id} />}
      <EventCheckpointsManager
        canManage={canManage}
        checkpoints={event.checkpoints}
        error={notices.checkpointError}
        eventId={event.id}
        notice={notices.checkpoint}
      />
      {canManage && (
        <section
          className={canUseAutomatedFollowups
            ? "app-panel event-feedback-panel"
            : "plan-feature-lock plan-feature-lock-wide event-feedback-panel"}
          id="feedback"
        >
          {canUseAutomatedFollowups ? (
            <>
              <div className="panel-heading-row">
                <div>
                  <h2>Automated reminders &amp; feedback</h2>
                  <p>Starter and higher plans send a QR ticket reminder 24 hours before start and ask checked-in guests for feedback two hours after the event.</p>
                </div>
              </div>
              {eventFeedback.length === 0 ? (
                <p className="event-feedback-empty">Guest responses will appear here after the event.</p>
              ) : (
                <div className="event-feedback-list">
                  {eventFeedback.map((item) => (
                    <article className="event-feedback-item" key={item.id}>
                      <div className="event-feedback-item-heading">
                        <strong>{item.registration.attendee.firstName} {item.registration.attendee.lastName}</strong>
                        <span>{item.rating} / 5</span>
                      </div>
                      {item.message && <p>{item.message}</p>}
                      <time dateTime={item.submittedAt.toISOString()}>
                        {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: event.timezone }).format(item.submittedAt)}
                      </time>
                    </article>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <span><LockKeyhole aria-hidden="true" size={16} /></span>
              <div>
                <strong>Automated reminders &amp; feedback are locked</strong>
                <p>Upgrade to Starter or a higher plan to send automated reminders and collect guest feedback.</p>
              </div>
            </>
          )}
        </section>
      )}
      {canManage && <RegistrationFormBuilder
        canBranding={workspaceHasFeature(context.subscription, "event_branding")}
        canCustomForms={workspaceHasFeature(context.subscription, "custom_forms")}
        canShareRegistration={canShareRegistration}
        eventId={event.id}
        key={JSON.stringify(registrationQuestions)}
        logo={readEventLogo(event.settings?.customBranding)}
        questions={registrationQuestions}
        registrationUrl={registrationUrl}
      />}
    </div>
  ), locale);
}
