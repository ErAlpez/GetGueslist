import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  Gift,
  Plus,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { getDashboardSummary, requireWorkspaceSection } from "@/lib/workspace";
import { workspaceRoleHasPermission } from "@/lib/workspace-roles";
import { getPreferences } from "@/lib/preferences";
import { localizeNode } from "@/lib/localization";
import { AnimatedMetric } from "@/components/animated-metric";
import { StatisticCircle, StatisticIconCircle } from "@/components/statistic-circle";
import "./dashboard.css";

export default async function DashboardPage() {
  const [{ locale }, context] = await Promise.all([
    getPreferences(),
    requireWorkspaceSection("overview"),
  ]);
  const summary = await getDashboardSummary(context.workspace.id, locale);
  const canManageEvents = workspaceRoleHasPermission(context.membership.role, "events.manage");
  const plan = summary.subscription?.plan;
  const PlanIcon = !plan || plan.code === "FREE" ? Gift : Sparkles;
  const activeEventLimit = plan?.activeEventLimit;
  const usagePercent = activeEventLimit == null
    ? null
    : activeEventLimit === 0
      ? 0
      : Math.min(Math.round((summary.activeEvents / activeEventLimit) * 100), 100);
  const maxRegistrationCount = Math.max(...summary.registrationTrend.map((day) => day.count), 1);
  const firstName = context.user.name.split(/\s+/)[0];

  return localizeNode((
    <div className="dashboard-page">
      <div className="page-heading-row">
        <div>
          <div className="page-kicker">OVERVIEW</div>
          <h1>Good morning, {firstName}</h1>
          <p>Here’s the latest from {context.workspace.name}.</p>
        </div>
        {canManageEvents && <Link className="button button-dark app-primary-button" href="/dashboard/events/new"><Plus size={16} /> Create event</Link>}
      </div>

      <section aria-label="Workspace statistics" className="stat-cards dashboard-stat-cards">
        <article className="stat-card stat-total-events">
          <span className="stat-card-label">Total events</span><StatisticCircle locale={locale} value={summary.totalEvents} total={summary.totalEvents} />
          <span className="stat-card-note"><CheckCircle2 size={13} /> {summary.completedEvents} completed</span>
          <span className="stat-card-icon"><CalendarDays size={17} /></span>
        </article>
        <article className="stat-card stat-active-events">
          <span className="stat-card-label">Active events</span><StatisticCircle locale={locale} value={summary.activeEvents} total={summary.totalEvents} />
          <span className="stat-card-note"><CircleDashed size={13} /> Published or ongoing</span>
          <span className="stat-card-icon"><ArrowUpRight size={17} /></span>
        </article>
        <article className="stat-card stat-upcoming-events">
          <span className="stat-card-label">Upcoming events</span><StatisticCircle locale={locale} value={summary.upcomingEvents} total={summary.totalEvents} />
          <span className="stat-card-note"><CalendarDays size={13} /> Scheduled ahead</span>
          <span className="stat-card-icon"><CalendarDays size={17} /></span>
        </article>
        <article className="stat-card stat-total-attendees">
          <span className="stat-card-label">Total attendees</span><StatisticCircle locale={locale} value={summary.totalRegistrations} total={summary.totalRegistrations} />
          <span className="stat-card-note"><UsersRound size={13} /> Across all events</span>
          <span className="stat-card-icon"><UsersRound size={17} /></span>
        </article>
      </section>

      <div className="dashboard-grid">
        <section className="app-panel events-panel">
          <div className="panel-heading-row"><div><h2>Upcoming events</h2><p>Your next events at a glance.</p></div><Link className="panel-action" href="/dashboard/events">View all <ArrowRight size={14} /></Link></div>
          {summary.recentEvents.length ? (
            <div className="dashboard-event-list">
              {summary.recentEvents.map((event) => {
                const eventDateFormatter = new Intl.DateTimeFormat(locale, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  timeZone: event.timezone,
                });
                const dateParts = eventDateFormatter.formatToParts(event.startsAt);
                const eventMonth = dateParts.find((part) => part.type === "month")?.value ?? "";
                const eventDay = dateParts.find((part) => part.type === "day")?.value ?? "";

                return (
                  <Link className="dashboard-event" href={`/dashboard/events/${event.id}`} key={event.id}>
                    <span className="event-calendar"><small>{eventMonth.toUpperCase()}</small><strong>{eventDay}</strong></span>
                    <span className="dashboard-event-copy"><strong>{event.name}</strong><small>{eventDateFormatter.format(event.startsAt)} · {event.venue || event.format.toLowerCase()}</small></span>
                    <span className={`status-pill status-${event.status.toLowerCase().replaceAll("_", "-")}`}>{event.status.toLowerCase().replaceAll("_", " ")}</span>
                    <span className="event-registration-count"><UsersRound size={13} /> <AnimatedMetric locale={locale} value={event._count.registrations} /></span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="empty-state compact-empty">
              <span className="empty-state-icon"><CalendarDays size={19} /></span>
              <strong>Your first event starts here</strong>
              <p>{canManageEvents ? "Create an event to see registrations and attendance in one place." : "Events, registrations, and attendance for your workspace will appear here."}</p>
              {canManageEvents && <Link className="text-link" href="/dashboard/events/new">Create an event <ArrowRight size={14} /></Link>}
            </div>
          )}
        </section>

        <section className="app-panel usage-panel">
          <div className="panel-heading-row"><div><h2>Your plan</h2><p>Usage for the current plan.</p></div>{workspaceRoleHasPermission(context.membership.role, "billing.manage") && <Link className="panel-action" href="/dashboard/billing">Manage <ArrowRight size={14} /></Link>}</div>
          <div className="plan-summary"><span className="plan-summary-mark"><PlanIcon aria-hidden="true" size={18} /></span><span><strong>{plan?.name ?? "Free"} plan</strong><small>{summary.subscription?.status.toLowerCase().replace("_", " ") ?? "No subscription"}</small></span></div>
          <div className="usage-item"><div><span>Active events</span><strong><AnimatedMetric locale={locale} value={summary.activeEvents} /> <small>/ {activeEventLimit ?? "Unlimited"}</small></strong></div>{usagePercent !== null && <div className="usage-bar"><span style={{ width: `${usagePercent}%` }} /></div>}</div>
          <div className="usage-item"><div><span>Attendee limit per event</span><strong>{plan?.attendeePerEventLimit != null ? <AnimatedMetric locale={locale} value={plan.attendeePerEventLimit} /> : "Unlimited"}</strong></div></div>
          <div className="usage-footer"><span>Plan limits are checked when creating events.</span>{workspaceRoleHasPermission(context.membership.role, "billing.manage") && <Link href="/dashboard/billing">View plans <ArrowRight size={13} /></Link>}</div>
        </section>

        <section className="app-panel registrations-panel">
          <div className="panel-heading-row"><div><h2>Recent registrations</h2><p>New guests across your events.</p></div><Link className="panel-action" href="/dashboard/attendees">Attendees <ArrowRight size={14} /></Link></div>
          {summary.recentRegistrations.length ? (
            <div className="registration-list">
              {summary.recentRegistrations.map((registration) => (
                <div className="registration-row" key={registration.id}>
                  <span className="registration-avatar">{registration.attendee.firstName.charAt(0)}{registration.attendee.lastName.charAt(0)}</span>
                  <span className="registration-copy"><strong>{registration.attendee.firstName} {registration.attendee.lastName}</strong><small>{registration.event.name}</small></span>
                  <span className="registration-time">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: registration.event.timezone }).format(registration.registeredAt)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state compact-empty registration-empty">
              <span className="empty-state-icon"><UsersRound size={19} /></span>
              <strong>No registrations yet</strong>
              <p>Guest registrations will appear here as they come in.</p>
            </div>
          )}
        </section>

        <section className="app-panel attendance-summary-panel">
          <div className="panel-heading-row"><div><h2>Attendance summary</h2><p>Across all events in your workspace.</p></div></div>
          <div className="attendance-summary-metric-row">
            <div className="attendance-summary-metric-content">
              <div className="attendance-summary-number"><AnimatedMetric locale={locale} value={summary.attendanceRate} /><span>%</span></div>
              <div className="attendance-summary-caption">of registrations checked in</div>
            </div>
            <StatisticIconCircle icon={<UsersRound size={36} />} locale={locale} total={100} value={summary.attendanceRate} />
          </div>
          <div className="attendance-summary-bar"><span style={{ width: `${summary.attendanceRate}%` }} /></div>
          <div className="attendance-summary-legend"><span><i /> Checked in <b><AnimatedMetric locale={locale} value={summary.checkedInAttendees} /></b></span><span><i /> Not checked in <b><AnimatedMetric locale={locale} value={summary.notCheckedInAttendees} /></b></span></div>
        </section>
      </div>
      <div className="dashboard-lower-grid">
        <section className="app-panel overview-trend-panel">
          <div className="panel-heading-row"><div><h2>Registration trend</h2><p>Daily registrations over the last 7 days.</p></div><span className="overview-chart-heading-actions"><BarChart3 aria-hidden="true" size={15} /><Link className="panel-action" href="/dashboard/reports">Reports <ArrowRight size={14} /></Link></span></div>
          <div className="overview-chart" role="img" aria-label="Daily registration totals for the last seven days">
            {summary.registrationTrend.map((day) => {
              return <div className="overview-chart-column" key={day.label}><span><AnimatedMetric locale={locale} value={day.count} /></span><div><i style={{ height: `${Math.max((day.count / maxRegistrationCount) * 100, day.count ? 8 : 2)}%` }} /></div><small>{day.label}</small></div>;
            })}
          </div>
        </section>
        <section className="app-panel overview-activity-panel">
          <div className="panel-heading-row"><div><h2>Recent attendance</h2><p>Latest check-ins across events.</p></div><Link className="panel-action" href="/dashboard/check-in">Check-in <ArrowRight size={14} /></Link></div>
          {summary.recentAttendanceLogs.length ? (
            <div className="recent-checkin-list">{summary.recentAttendanceLogs.map((log) => (
              <div className="recent-checkin-row" key={log.id}>
                <span aria-hidden="true" className="recent-checkin-icon"><CheckCircle2 size={18} /></span>
                <span className="recent-checkin-copy"><strong>{log.registration.attendee.firstName} {log.registration.attendee.lastName}</strong><small>{log.event.name}</small></span>
                <span className="recent-checkin-time">{new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone: log.event.timezone }).format(log.createdAt)}</span>
              </div>
            ))}</div>
          ) : <div className="recent-empty">Attendance activity appears here after the first check-in.</div>}
        </section>
      </div>
    </div>
  ), locale);
}
