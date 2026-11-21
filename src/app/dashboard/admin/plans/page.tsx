import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CircleDashed,
  CreditCard,
  Database,
  Globe2,
  HardDrive,
  Mail,
  MapPin,
  Search,
  ShieldAlert,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getPreferences } from "@/lib/preferences";
import { localizeNode, translate } from "@/lib/localization";
import { planFeatureOptions } from "@/lib/plan-features";
import { requireSuperAdmin } from "@/lib/super-admin";
import { getSuperAdminHealthDashboard } from "@/lib/super-admin-health";
import { SuperAdminPlanEditor } from "@/components/super-admin-plan-editor";
import { SuperAdminSubscriptionEditor } from "@/components/super-admin-subscription-editor";
import { StatisticCircle } from "@/components/statistic-circle";
import { moderatePlatformReviewAction } from "@/app/dashboard/admin/plans/review-actions";
import "./plan-management.css";

const pageSize = 25;
const reviewPageSize = 20;
const reviewStatuses = ["PENDING", "APPROVED", "HIDDEN", "ALL"] as const;
const systemHealthIcons = {
  database: Database,
  billing: CreditCard,
  resend: Mail,
  "file-storage": HardDrive,
  "rate-limiting": ShieldAlert,
} as const;

function formatRevenue(amountCents: number, currency: string, locale: string) {
  if (!/^[A-Z]{3}$/.test(currency)) return `${amountCents / 100} ${currency}`;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(amountCents / 100);
}

type PageProps = {
  searchParams: Promise<{ q?: string; page?: string; reviewStatus?: string; reviewPage?: string }>;
};

export default async function SuperAdminPlansPage({ searchParams }: PageProps) {
  await requireSuperAdmin();
  const [{ locale }, params] = await Promise.all([getPreferences(), searchParams]);
  const query = params.q?.trim().slice(0, 100) ?? "";
  const parsedPage = Number(params.page ?? 1);
  const requestedPage = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const parsedReviewPage = Number(params.reviewPage ?? 1);
  const requestedReviewPage = Number.isSafeInteger(parsedReviewPage) && parsedReviewPage > 0 ? parsedReviewPage : 1;
  const reviewStatus = reviewStatuses.includes(params.reviewStatus as (typeof reviewStatuses)[number])
    ? params.reviewStatus as (typeof reviewStatuses)[number]
    : "PENDING";
  const prisma = getPrisma();
  const periodStart = new Date();
  periodStart.setUTCDate(periodStart.getUTCDate() - 29);
  periodStart.setUTCHours(0, 0, 0, 0);
  const workspaceWhere = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          { slug: { contains: query, mode: "insensitive" as const } },
          { owner: { is: { name: { contains: query, mode: "insensitive" as const } } } },
          { owner: { is: { email: { contains: query, mode: "insensitive" as const } } } },
        ],
      }
    : {};

  const [
    plans,
    workspaceCount,
    auditLogs,
    totalAccounts,
    verifiedAccounts,
    totalWorkspaces,
    newSignups,
    newSubscriptions,
    subscriptionStatusRows,
    paidInvoiceTotals,
    websitePageViews,
    visitorLocations,
    reviewStatusCounts,
    healthDashboard,
  ] = await Promise.all([
    prisma.plan.findMany({ orderBy: [{ monthlyPriceCents: "asc" }, { code: "asc" }] }),
    prisma.workspace.count({ where: workspaceWhere }),
    prisma.superAdminAuditLog.findMany({
      include: { admin: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.user.count(),
    prisma.user.count({ where: { emailVerified: true } }),
    prisma.workspace.count(),
    prisma.user.count({ where: { createdAt: { gte: periodStart } } }),
    prisma.subscription.count({ where: { createdAt: { gte: periodStart } } }),
    prisma.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.subscriptionInvoice.groupBy({
      by: ["currency"],
      where: {
        status: { equals: "paid", mode: "insensitive" },
        paidAt: { gte: periodStart },
      },
      _sum: { amountCents: true },
      _count: { _all: true },
      orderBy: { currency: "asc" },
    }),
    prisma.websiteDailyStat.aggregate({
      where: { date: { gte: periodStart } },
      _sum: { views: true },
    }),
    prisma.websiteDailyStat.groupBy({
      by: ["countryCode"],
      where: { date: { gte: periodStart } },
      _sum: { views: true },
      orderBy: { _sum: { views: "desc" } },
      take: 8,
    }),
    prisma.platformReview.groupBy({ by: ["status"], _count: { _all: true } }),
    getSuperAdminHealthDashboard(prisma),
  ]);
  const pageCount = Math.max(1, Math.ceil(workspaceCount / pageSize));
  const currentPage = Math.min(requestedPage, pageCount);
  const reviewCounts = new Map(reviewStatusCounts.map(({ status, _count }) => [status, _count._all]));
  const reviewCount = reviewStatus === "ALL"
    ? [...reviewCounts.values()].reduce((total, count) => total + count, 0)
    : reviewCounts.get(reviewStatus) ?? 0;
  const reviewPageCount = Math.max(1, Math.ceil(reviewCount / reviewPageSize));
  const currentReviewPage = Math.min(requestedReviewPage, reviewPageCount);
  const reviewWhere = reviewStatus === "ALL" ? {} : { status: reviewStatus };
  const [workspaces, reviewEntries] = await Promise.all([
    prisma.workspace.findMany({
      where: workspaceWhere,
      include: {
        owner: { select: { name: true, email: true } },
        subscription: { include: { plan: { select: { id: true, code: true, name: true } } } },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: (currentPage - 1) * pageSize,
      take: pageSize,
    }),
    prisma.platformReview.findMany({
      where: reviewWhere,
      select: {
        id: true,
        authorName: true,
        workspaceName: true,
        rating: true,
        message: true,
        publicationConsent: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (currentReviewPage - 1) * reviewPageSize,
      take: reviewPageSize,
    }),
  ]);
  const selectablePlans = plans.map(({ id, code, name, isActive }) => ({ id, code, name, isActive }));
  const subscriptionsByStatus = new Map(
    subscriptionStatusRows.map(({ status, _count }) => [status, _count._all]),
  );
  const activeSubscriptions =
    (subscriptionsByStatus.get("ACTIVE") ?? 0) +
    (subscriptionsByStatus.get("TRIALING") ?? 0);
  const totalSubscriptions = [...subscriptionsByStatus.values()].reduce((total, count) => total + count, 0);
  const paidInvoiceCount = paidInvoiceTotals.reduce((total, item) => total + item._count._all, 0);
  const paidRevenueSummary = paidInvoiceTotals.length
    ? paidInvoiceTotals.map((item) => formatRevenue(item._sum.amountCents ?? 0, item.currency, locale)).join(" · ")
    : "No paid sales";
  const pageViewCount = websitePageViews._sum.views ?? 0;
  const currencyNames = new Intl.DisplayNames(locale, { type: "region" });
  const numberFormat = new Intl.NumberFormat(locale);
  const healthPercentFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const healthAvailability = healthDashboard.availabilityPercent === null
    ? "No data"
    : `${healthPercentFormat.format(healthDashboard.availabilityPercent)}%`;
  const healthAverageLatency = healthDashboard.averageLatencyMs === null
    ? "No data"
    : `${numberFormat.format(healthDashboard.averageLatencyMs)} ms`;
  const healthLastChecked = healthDashboard.lastCheckedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(healthDashboard.lastCheckedAt)
    : "Awaiting first scheduled run";
  const healthTimeFormat = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });
  const reviewPageHref = (pageNumber: number) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (params.page) search.set("page", String(requestedPage));
    search.set("reviewStatus", reviewStatus);
    search.set("reviewPage", String(pageNumber));
    return `/dashboard/admin/plans?${search.toString()}`;
  };
  const reviewFilterHref = (status: (typeof reviewStatuses)[number]) => {
    const search = new URLSearchParams();
    if (query) search.set("q", query);
    if (params.page) search.set("page", String(requestedPage));
    search.set("reviewStatus", status);
    return `/dashboard/admin/plans?${search.toString()}`;
  };

  const page = (
    <div className="super-admin-plans-page">
      <div className="page-heading-row">
        <div>
          <div className="page-kicker">PLATFORM</div>
          <h1>Plan management</h1>
          <p>Manage the plan catalog and workspace subscriptions.</p>
        </div>
        <span className="super-admin-badge"><ShieldCheck aria-hidden="true" size={15} /> Super Admin</span>
      </div>

      <section className="super-admin-analytics-section">
        <div className="panel-heading-row super-admin-section-heading">
          <div><h2>Growth &amp; revenue</h2><p>Signups, subscriptions, and recorded paid invoices over the last 30 days.</p></div>
        </div>
        <div aria-label="Growth and revenue metrics" className="stat-cards dashboard-stat-cards super-admin-growth-cards">
          <article className="stat-card stat-total-events">
            <span className="stat-card-label">New signups</span>
            <StatisticCircle locale={locale} total={Math.max(newSignups, 1)} value={newSignups} />
            <span className="stat-card-note"><UsersRound size={13} /> Last 30 days</span>
            <span className="stat-card-icon"><UsersRound size={17} /></span>
          </article>
          <article className="stat-card stat-active-events">
            <span className="stat-card-label">New subscriptions</span>
            <StatisticCircle locale={locale} total={Math.max(newSubscriptions, 1)} value={newSubscriptions} />
            <span className="stat-card-note"><CreditCard size={13} /> Started in last 30 days</span>
            <span className="stat-card-icon"><CreditCard size={17} /></span>
          </article>
          <article className="stat-card stat-upcoming-events">
            <span className="stat-card-label">Active subscriptions</span>
            <StatisticCircle locale={locale} total={totalSubscriptions} value={activeSubscriptions} />
            <span className="stat-card-note"><CircleDashed size={13} /> Active or trialing</span>
            <span className="stat-card-icon"><CircleDashed size={17} /></span>
          </article>
          <article className="stat-card stat-total-attendees">
            <span className="stat-card-label">Paid invoices</span>
            <StatisticCircle locale={locale} total={Math.max(paidInvoiceCount, 1)} value={paidInvoiceCount} />
            <span className="stat-card-note super-admin-sales-note"><CreditCard size={13} /> {paidRevenueSummary}</span>
            <span className="stat-card-icon"><CreditCard size={17} /></span>
          </article>
        </div>
      </section>

      <section className="super-admin-analytics-section">
        <div className="panel-heading-row super-admin-section-heading">
          <div><h2>Operations</h2><p>Public website page views and approximate visitor locations over the last 30 days.</p></div>
        </div>
        <div className="dashboard-grid super-admin-operations-grid">
          <div aria-label="Website traffic metrics" className="stat-cards dashboard-stat-cards super-admin-operations-stats">
            <article className="stat-card stat-total-attendees">
              <span className="stat-card-label">Website traffic</span>
              <StatisticCircle locale={locale} total={Math.max(pageViewCount, 1)} value={pageViewCount} />
              <span className="stat-card-note"><Globe2 size={13} /> Page views · last 30 days</span>
              <span className="stat-card-icon"><Globe2 size={17} /></span>
            </article>
          </div>
          <section className="app-panel super-admin-locations-panel">
            <div className="panel-heading-row"><div><h2>Visitor locations</h2><p>Page views by country, not unique visitors.</p></div></div>
            {visitorLocations.length ? (
              <div className="recent-checkin-list super-admin-location-list">
                {visitorLocations.map((location) => {
                  const country = location.countryCode === "XX"
                    ? "Unknown location"
                    : currencyNames.of(location.countryCode) ?? location.countryCode;
                  return (
                    <div className="recent-checkin-row" key={location.countryCode}>
                      <span aria-hidden="true" className="recent-checkin-icon"><MapPin size={17} /></span>
                      <span className="recent-checkin-copy"><strong>{country}</strong><small>Visitor location</small></span>
                      <span className="recent-checkin-time">{numberFormat.format(location._sum.views ?? 0)} views</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="recent-empty">No public page views recorded in the last 30 days.</div>
            )}
          </section>
        </div>
      </section>

      <section className="super-admin-analytics-section">
        <div className="panel-heading-row super-admin-section-heading">
          <div><h2>People &amp; activity</h2><p>Account and workspace totals with recent platform activity.</p></div>
        </div>
        <div className="dashboard-grid super-admin-people-grid">
          <div aria-label="People and workspace metrics" className="stat-cards dashboard-stat-cards super-admin-people-stats">
            <article className="stat-card stat-total-events">
              <span className="stat-card-label">User accounts</span>
              <StatisticCircle locale={locale} total={Math.max(totalAccounts, 1)} value={totalAccounts} />
              <span className="stat-card-note"><UsersRound size={13} /> {numberFormat.format(verifiedAccounts)} verified</span>
              <span className="stat-card-icon"><UsersRound size={17} /></span>
            </article>
            <article className="stat-card stat-active-events">
              <span className="stat-card-label">Workspaces</span>
              <StatisticCircle locale={locale} total={Math.max(totalWorkspaces, 1)} value={totalWorkspaces} />
              <span className="stat-card-note"><CalendarDays size={13} /> Across the platform</span>
              <span className="stat-card-icon"><CalendarDays size={17} /></span>
            </article>
          </div>
          <section className="app-panel overview-activity-panel">
            <div className="panel-heading-row"><div><h2>Recent activity</h2><p>Latest plan, subscription, and review changes.</p></div></div>
            {auditLogs.length ? (
              <div className="recent-checkin-list">
                {auditLogs.map((entry) => (
                  <div className="recent-checkin-row" key={entry.id}>
                    <span aria-hidden="true" className="recent-checkin-icon"><ShieldCheck size={17} /></span>
                    <span className="recent-checkin-copy"><strong>{entry.action.replaceAll(".", " ")}</strong><small>{entry.admin.name} · {entry.admin.email}</small></span>
                    <time className="recent-checkin-time" dateTime={entry.createdAt.toISOString()}>{new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(entry.createdAt)}</time>
                  </div>
                ))}
              </div>
            ) : <div className="recent-empty">Admin activity appears here after the first plan, subscription, or review change.</div>}
          </section>
        </div>
      </section>

      <section aria-labelledby="system-health-heading" className="super-admin-analytics-section">
        <div className="panel-heading-row super-admin-section-heading">
          <div><h2 id="system-health-heading">System health</h2><p>Scheduled every five minutes · last run: {healthLastChecked} · rolling 24-hour metrics</p></div>
        </div>
        <div aria-label="24-hour system health statistics" className="super-admin-health-overview-grid">
          <article className="super-admin-health-metric">
            <span>Service availability</span>
            <strong className={healthDashboard.availabilityPercent !== null && healthDashboard.availabilityPercent < 99 ? "is-low" : ""}>{healthAvailability}</strong>
            <small>Target: 99% or higher</small>
          </article>
          <article className="super-admin-health-metric">
            <span>Scheduled runs</span>
            <strong>{numberFormat.format(healthDashboard.runCount)}</strong>
            <small>Recorded in the last 24 hours</small>
          </article>
          <article className="super-admin-health-metric">
            <span>Failed probes</span>
            <strong className={healthDashboard.failedChecks ? "is-low" : ""}>{numberFormat.format(healthDashboard.failedChecks)}</strong>
            <small>Configured services only</small>
          </article>
          <article className="super-admin-health-metric">
            <span>Average probe latency</span>
            <strong>{healthAverageLatency}</strong>
            <small>Database, email, and storage checks</small>
          </article>
        </div>
        <section className="app-panel super-admin-health-trend">
          <div className="panel-heading-row">
            <div><h3>Hourly availability</h3><p>Successful probes across configured services.</p></div>
            <span>Last 24 hours</span>
          </div>
          {healthDashboard.observedChecks ? (
            <>
              <div aria-label="Hourly service availability over the previous 24 hours" className="super-admin-health-bars" role="img">
                {healthDashboard.hourlyAvailability.map((hour) => {
                  const availability = hour.availabilityPercent;
                  const state = availability === null ? "is-empty" : availability < 99 ? "is-low" : "is-healthy";
                  const label = availability === null ? "No checks" : `${healthPercentFormat.format(availability)}% availability`;
                  return (
                    <span aria-hidden="true" className={`super-admin-health-bar ${state}`} key={hour.startedAt.toISOString()} title={`${healthTimeFormat.format(hour.startedAt)}: ${label} (${hour.observedChecks} probes)`}>
                      <i style={{ height: `${Math.max(3, availability ?? 0)}%` }} />
                    </span>
                  );
                })}
              </div>
              <div className="super-admin-health-chart-axis"><span>24 hours ago</span><span>Now</span></div>
            </>
          ) : <p className="super-admin-health-empty">No scheduled samples yet. Verify Vercel Cron and CRON_SECRET are configured; the chart populates after its first run.</p>}
        </section>
        <div aria-label="System health checks" className="super-admin-health-grid">
          {healthDashboard.services.map((check) => {
            const HealthIcon = systemHealthIcons[check.id];
            return (
              <article aria-label={`${check.name} (${check.provider}): ${check.label}`} className="super-admin-health-card" key={check.id}>
                <div className="super-admin-health-card-heading">
                  <span aria-hidden="true" className="super-admin-health-icon"><HealthIcon size={17} /></span>
                  <div>
                    <h3>{check.name}</h3>
                    <small className="super-admin-health-provider">{check.provider}</small>
                    <span className={`super-admin-health-status is-${check.status}`}>{check.label}</span>
                  </div>
                </div>
                <p>{check.detail}</p>
                <div className="super-admin-health-card-stats">
                  <span><small>24h availability</small><strong>{check.availabilityPercent === null ? "—" : `${healthPercentFormat.format(check.availabilityPercent)}%`}</strong></span>
                  <span><small>Avg latency</small><strong>{check.averageLatencyMs === null ? "—" : `${numberFormat.format(check.averageLatencyMs)} ms`}</strong></span>
                  <span><small>Samples</small><strong>{numberFormat.format(check.sampleCount)}</strong></span>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="app-panel super-admin-reviews">
        <div className="panel-heading-row">
          <div><h2>Review moderation</h2><p>Only opted-in 5-star owner reviews can be approved for homepage publication.</p></div>
          <span>{numberFormat.format(reviewCount)} {reviewCount === 1 ? "review" : "reviews"}</span>
        </div>
        <nav aria-label="Review status" className="super-admin-review-filters">
          {reviewStatuses.map((status) => {
            const count = status === "ALL" ? [...reviewCounts.values()].reduce((total, value) => total + value, 0) : reviewCounts.get(status) ?? 0;
            const label = status === "ALL" ? "All" : status.charAt(0) + status.slice(1).toLowerCase();
            return (
              <Link aria-current={reviewStatus === status ? "page" : undefined} className={reviewStatus === status ? "is-active" : ""} href={reviewFilterHref(status)} key={status}>
                {label} <span>{numberFormat.format(count)}</span>
              </Link>
            );
          })}
        </nav>
        {reviewEntries.length ? (
          <div className="super-admin-review-list">
            {reviewEntries.map((review) => (
              <article className="super-admin-review-card" key={review.id}>
                <div className="super-admin-review-heading">
                  <div>
                    <strong>{review.authorName}</strong>
                    <small>{review.workspaceName} · {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(review.createdAt)}</small>
                  </div>
                  <span className={`super-admin-review-status status-${review.status.toLowerCase()}`}>{review.status.toLowerCase()}</span>
                </div>
                <div aria-label={`${review.rating} out of 5 stars`} className="super-admin-review-rating" role="img">
                  {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                  <span>{review.rating}/5</span>
                </div>
                <p className="super-admin-review-message">{review.message}</p>
                <div className="super-admin-review-actions">
                  <span className={review.publicationConsent ? "review-consent is-granted" : "review-consent"}>
                    {review.publicationConsent ? "Public display consent given" : "Private feedback only"}
                  </span>
                  {review.status !== "APPROVED" && review.rating === 5 && review.publicationConsent && (
                    <form action={moderatePlatformReviewAction}>
                      <input name="reviewId" type="hidden" value={review.id} />
                      <input name="status" type="hidden" value="APPROVED" />
                      <button className="button button-dark" type="submit">Approve &amp; publish</button>
                    </form>
                  )}
                  {review.status !== "HIDDEN" && (
                    <form action={moderatePlatformReviewAction}>
                      <input name="reviewId" type="hidden" value={review.id} />
                      <input name="status" type="hidden" value="HIDDEN" />
                      <button className="button button-light" type="submit">Hide</button>
                    </form>
                  )}
                  {review.status === "PENDING" && (review.rating !== 5 || !review.publicationConsent) && (
                    <small>Only opted-in 5-star reviews can be published.</small>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : <p className="super-admin-empty">No reviews in this status.</p>}
        {reviewPageCount > 1 && (
          <nav aria-label="Review pages" className="super-admin-pagination">
            {currentReviewPage > 1 ? <Link href={reviewPageHref(currentReviewPage - 1)}><ArrowLeft aria-hidden="true" size={14} /> Previous</Link> : <span />}
            <span>Page {currentReviewPage} of {reviewPageCount}</span>
            {currentReviewPage < reviewPageCount ? <Link href={reviewPageHref(currentReviewPage + 1)}>Next <ArrowRight aria-hidden="true" size={14} /></Link> : <span />}
          </nav>
        )}
      </section>

      <section className="app-panel super-admin-plan-catalog">
        <div className="panel-heading-row">
          <div><h2>Plan catalog</h2><p>Changes to limits and features affect every workspace subscribed to that plan.</p></div>
        </div>
        <details className="super-admin-create-plan">
          <summary>{translate(locale, "Create plan")}</summary>
          <SuperAdminPlanEditor />
        </details>
        <div className="super-admin-existing-plans">
          {plans.map((plan) => {
            const featureCount = Array.isArray(plan.features) ? plan.features.length : 0;
            return (
              <details className="super-admin-plan-item" key={plan.id}>
                <summary>
                  <span><strong>{plan.name}</strong><small>{plan.code} · {featureCount} {featureCount === 1 ? "feature" : "features"}</small></span>
                  <span className={`status-pill status-${plan.isActive ? "active" : "inactive"}`}>{plan.isActive ? "Active" : "Inactive"}</span>
                </summary>
                <SuperAdminPlanEditor plan={plan} />
              </details>
            );
          })}
        </div>
        <p className="super-admin-feature-count">{planFeatureOptions.length} available feature flags</p>
      </section>

      <section className="app-panel super-admin-workspaces">
        <div className="panel-heading-row">
          <div><h2>Workspace subscriptions</h2><p>Manually assign an active plan and update the subscription status.</p></div>
          <span>{workspaceCount} {workspaceCount === 1 ? "workspace" : "workspaces"}</span>
        </div>
        <form action="/dashboard/admin/plans" className="dashboard-search-field super-admin-search">
          <Search aria-hidden="true" size={14} />
          <input aria-label={translate(locale, "Search workspaces")} defaultValue={query} maxLength={100} name="q" placeholder={translate(locale, "Search workspace, slug, or owner")} />
          <button aria-label={translate(locale, "Search workspaces")} type="submit"><ArrowRight aria-hidden="true" size={13} /></button>
        </form>
        {workspaces.length ? (
          <div className="super-admin-workspace-list">
            {workspaces.map((workspace) => (
              <article className="super-admin-workspace-row" key={workspace.id}>
                <div className="super-admin-workspace-info">
                  <strong>{workspace.name}</strong>
                  <small>{workspace.slug}</small>
                  <small>{workspace.owner.name} · {workspace.owner.email}</small>
                  <small>
                    Current: {workspace.subscription?.plan.name ?? "No plan"} · {workspace.subscription?.status.toLowerCase().replaceAll("_", " ") ?? "no subscription"}
                  </small>
                </div>
                <SuperAdminSubscriptionEditor
                  key={`${workspace.id}:${workspace.subscription?.planId ?? ""}:${workspace.subscription?.status ?? ""}`}
                  planId={workspace.subscription?.planId ?? null}
                  plans={selectablePlans}
                  status={workspace.subscription?.status ?? null}
                  workspaceId={workspace.id}
                />
              </article>
            ))}
          </div>
        ) : (
          <p className="super-admin-empty">{query ? "No workspaces match this search." : "No workspaces found."}</p>
        )}
        {pageCount > 1 && (
          <nav aria-label="Workspace pages" className="super-admin-pagination">
            {currentPage > 1 ? (
              <Link href={`/dashboard/admin/plans?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(currentPage - 1) })}`}>
                <ArrowLeft aria-hidden="true" size={14} /> Previous
              </Link>
            ) : <span />}
            <span>Page {currentPage} of {pageCount}</span>
            {currentPage < pageCount ? (
              <Link href={`/dashboard/admin/plans?${new URLSearchParams({ ...(query ? { q: query } : {}), page: String(currentPage + 1) })}`}>
                Next <ArrowRight aria-hidden="true" size={14} />
              </Link>
            ) : <span />}
          </nav>
        )}
      </section>

    </div>
  );
  return localizeNode(page, locale);
}
