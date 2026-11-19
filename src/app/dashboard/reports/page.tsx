import Link from "next/link";
import "./reports.css";
import { ArrowRight, BarChart3, CheckCircle2, UsersRound } from "lucide-react";
import { AttendeeCategory } from "@prisma/client";
import { DownloadButton } from "@/components/download-button";
import { AnimatedMetric } from "@/components/animated-metric";
import { StatisticCircle } from "@/components/statistic-circle";
import { VenuGuestPassDateRange } from "@/components/venuguestpass-date-range";
import { getPrisma } from "@/lib/prisma";
import { getPreferences } from "@/lib/preferences";
import { localizeNode } from "@/lib/localization";
import { requireWorkspaceSection } from "@/lib/workspace";
import { workspaceHasFeature } from "@/lib/plan-features";
import { registrationTrend } from "./registration-trend";

type ReportsPageProps = {
  searchParams: Promise<{ event?: string; category?: string; from?: string; to?: string }>;
};

function parseDate(value: string | undefined, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const { locale } = await getPreferences();
  const context = await requireWorkspaceSection("reports");
  const canViewBasicReports = workspaceHasFeature(context.subscription, "basic_reports");
  if (!canViewBasicReports) {
    return localizeNode((
      <div className="reports-page">
        <div className="page-heading-row"><div><div className="page-kicker">INSIGHTS</div><h1>Reports & analytics</h1><p>Registration and attendance from your workspace data.</p></div></div>
        <section className="app-panel reports-locked-panel">
          <strong>Attendance summaries and report filters require Starter.</strong>
          <p>Upgrade your workspace plan to view attendance summaries and filter reports by event, category, and date.</p>
        </section>
      </div>
    ), locale);
  }

  const canViewAdvancedReports = workspaceHasFeature(context.subscription, "advanced_reports");
  const canViewMultiEventReports = workspaceHasFeature(context.subscription, "multi_event_reporting");
  const canViewCheckinActivity = workspaceHasFeature(context.subscription, "checkin_activity");
  const canExportCsv = workspaceHasFeature(context.subscription, "csv_exports");
  const canExportWorkspace = workspaceHasFeature(context.subscription, "workspace_exports");
  const params = await searchParams;
  const prisma = getPrisma();
  const categories: AttendeeCategory[] = ["VIP", "SPEAKER", "SPONSOR", "ORGANIZER", "MEDIA", "GENERAL", "STAFF", "VOLUNTEER", "GUEST", "WALK_IN"];
  const category = categories.find((item) => item === params.category);
  const start = parseDate(params.from);
  const end = parseDate(params.to, true);
  const now = new Date();
  const trendStart = new Date(now);
  trendStart.setUTCHours(0, 0, 0, 0);
  trendStart.setUTCDate(trendStart.getUTCDate() - 6);
  const events = await prisma.event.findMany({
    where: { workspaceId: context.workspace.id, archivedAt: null },
    select: { id: true, name: true },
    orderBy: { startsAt: "desc" },
  });
  const requestedEvent = params.event ? events.find((event) => event.id === params.event) ?? null : null;
  const selectedEvent = requestedEvent ?? (canViewMultiEventReports ? null : events[0] ?? null);
  const selectedEventId = selectedEvent?.id ?? "";
  const eventScopeId = selectedEventId || (canViewMultiEventReports ? undefined : "__no_event__");
  const where = {
    event: {
      workspaceId: context.workspace.id,
      ...(eventScopeId ? { id: eventScopeId } : {}),
    },
    ...(category ? { category } : {}),
    ...((start || end) ? {
      registeredAt: {
        ...(start ? { gte: start } : {}),
        ...(end ? { lte: end } : {}),
      },
    } : {}),
  };
  const trendWhere = {
    ...where,
    registeredAt: {
      gte: start && start > trendStart ? start : trendStart,
      ...(end ? { lte: end } : {}),
    },
  };
  const attendanceWhere = {
    workspaceId: context.workspace.id,
    action: "CHECK_IN" as const,
    registration: {
      ...(category ? { category } : {}),
      ...((start || end) ? {
        registeredAt: {
          ...(start ? { gte: start } : {}),
          ...(end ? { lte: end } : {}),
        },
      } : {}),
      event: {
        workspaceId: context.workspace.id,
        ...(eventScopeId ? { id: eventScopeId } : {}),
      },
    },
  };
  const [totalRegistrations, checkedIn, registrationsForTrend, recentAttendance] = await Promise.all([
    prisma.eventRegistration.count({ where }),
    prisma.attendanceLog.count({ where: attendanceWhere }),
    canViewAdvancedReports ? prisma.eventRegistration.findMany({
      where: trendWhere,
      select: { registeredAt: true },
      orderBy: { registeredAt: "desc" },
      take: 10000,
    }) : Promise.resolve([]),
    canViewCheckinActivity ? prisma.attendanceLog.findMany({
      where: attendanceWhere,
      include: { registration: { include: { attendee: { select: { firstName: true, lastName: true } }, event: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }) : Promise.resolve([]),
  ]);
  const rate = totalRegistrations ? Math.round((checkedIn / totalRegistrations) * 100) : 0;
  const days = registrationTrend(registrationsForTrend, locale, now);
  const maximum = Math.max(...days.map((day) => day.count), 1);
  const exportParams = new URLSearchParams(Object.entries({
    event: selectedEventId,
    category: category ?? "",
    from: params.from ?? "",
    to: params.to ?? "",
  }).filter(([, value]) => value));
  const exportHref = `/api/guestlist/export${exportParams.size ? `?${exportParams}` : ""}`;

  return localizeNode((
    <div className="reports-page">
      <div className="page-heading-row"><div><div className="page-kicker">INSIGHTS</div><h1>Reports & analytics</h1><p>Registration and attendance from your workspace data.</p></div>{canExportCsv && (selectedEventId || canExportWorkspace) ? <DownloadButton href={exportHref} label="Export CSV" /> : <span className="plan-gated-label">{canExportCsv ? "Workspace-wide CSV export requires Max." : "CSV export requires Starter."}</span>}</div>
      <form action="/dashboard/reports" className="venuguestpass-toolbar report-filters">
        <label>Event<select aria-label="Filter by event" defaultValue={selectedEventId} name="event">{canViewMultiEventReports ? <option value="">All events</option> : null}{events.map((event) => <option key={event.id} value={event.id}>{event.name}</option>)}</select></label>
        <label>Category<select aria-label="Filter by category" defaultValue={category ?? ""} name="category"><option value="">All categories</option>{categories.map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
        <VenuGuestPassDateRange initialFrom={params.from ?? ""} initialTo={params.to ?? ""} key={`${params.from ?? ""}:${params.to ?? ""}`} />
        <button className="button button-light report-filter-submit" type="submit">Apply filters <ArrowRight size={13} /></button>
      </form>
      {!canViewMultiEventReports && <p className="plan-gated-label report-feature-note">Cross-event reports require Max.</p>}

      <section aria-label="Report totals" className="stat-cards report-stat-cards">
        <article className="stat-card stat-total-attendees"><span className="stat-card-label">Total registrations</span><StatisticCircle locale={locale} value={totalRegistrations} total={totalRegistrations} /><span className="stat-card-note"><UsersRound size={13} /> Matching selected filters</span></article>
        <article className="stat-card stat-checked-in"><span className="stat-card-label">Checked in</span><StatisticCircle locale={locale} value={checkedIn} total={totalRegistrations} /><span className="stat-card-note">Attendance log entries</span></article>
        <article className="stat-card stat-not-checked-in"><span className="stat-card-label">Not checked in</span><StatisticCircle locale={locale} value={Math.max(totalRegistrations - checkedIn, 0)} total={totalRegistrations} /><span className="stat-card-note">Registrations without a check-in</span></article>
        {canViewAdvancedReports
          ? <article className="stat-card stat-attendance-rate"><span className="stat-card-label">Attendance rate</span><StatisticCircle locale={locale} value={rate} total={100} percentage /><span className="stat-card-note">Checked in / registrations</span></article>
          : <article className="stat-card report-feature-locked"><span className="stat-card-label">Attendance rate</span><span className="plan-gated-label">Max only</span></article>}
      </section>

      <div className="report-grid">
        {canViewAdvancedReports ? (
          <section className="app-panel report-chart-panel">
            <div className="panel-heading-row"><div><h2>Registration trend</h2><p>Daily registrations over the last 7 days, based on the selected filters.</p></div><BarChart3 size={15} /></div>
            {registrationsForTrend.length ? (
              <div className="registration-chart" role="img" aria-label="Daily registration totals for the last seven days">
                {days.map((day) => <div className="registration-chart-column" key={day.label}><span><AnimatedMetric locale={locale} value={day.count} /></span><div><i style={{ height: `${Math.max((day.count / maximum) * 100, day.count ? 8 : 2)}%` }} /></div><small>{day.label}</small></div>)}
              </div>
            ) : <div className="report-empty">Registration activity will appear here when guests sign up.</div>}
            {registrationsForTrend.length === 10000 && <p className="report-truncation-note">The trend source reached its 10,000-registration display limit; totals above remain accurate.</p>}
          </section>
        ) : (
          <section className="app-panel report-chart-panel report-feature-locked-panel">
            <div className="panel-heading-row"><div><h2>Registration trend</h2><p>Registration trends are available on Max.</p></div></div>
            <span className="plan-gated-label">Max only</span>
          </section>
        )}
        <section className="app-panel report-attendance-panel">
          <div className="panel-heading-row"><div><h2>Attendance</h2><p>Check-in progress for the selected scope.</p></div></div>
          {canViewAdvancedReports
            ? <div className="attendance-summary-number"><AnimatedMetric locale={locale} value={rate} /><span>%</span></div>
            : <span className="plan-gated-label attendance-rate-gate">Attendance-rate analytics require Max</span>}
          <div className="attendance-summary-caption"><AnimatedMetric locale={locale} value={checkedIn} /> of <AnimatedMetric locale={locale} value={totalRegistrations} /> registrations checked in</div>
          {canViewAdvancedReports && <div className="attendance-summary-bar"><span style={{ width: `${rate}%` }} /></div>}
          <Link className="text-link" href={selectedEvent ? `/dashboard/check-in?event=${selectedEvent.id}` : "/dashboard/check-in"}>Open check-in <ArrowRight size={13} /></Link>
        </section>
      </div>

      {canViewCheckinActivity ? (
        <section className="app-panel report-activity-panel">
          <div className="panel-heading-row"><div><h2>Recent attendance activity</h2><p>Latest check-ins for these filters.</p></div></div>
          {recentAttendance.length ? <div className="recent-checkin-list">{recentAttendance.map((log) => <div className="recent-checkin-row" key={log.id}><span aria-hidden="true" className="recent-checkin-icon"><CheckCircle2 size={18} /></span><span className="recent-checkin-copy"><strong>{log.registration.attendee.firstName} {log.registration.attendee.lastName}</strong><small>{log.registration.event.name}</small></span>        <span className="recent-checkin-time">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(log.createdAt)}</span></div>)}</div> : <div className="report-empty">Attendance records will appear here as guests check in.</div>}
        </section>
      ) : (
        <section className="app-panel report-activity-panel report-feature-locked-panel">
          <div className="panel-heading-row"><div><h2>Recent attendance activity</h2><p>Recent check-in activity requires Max.</p></div></div>
          <span className="plan-gated-label">Max only</span>
        </section>
      )}
    </div>
  ), locale);
}
