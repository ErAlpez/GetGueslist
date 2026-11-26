"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CreditCard,
  Database,
  HardDrive,
  Mail,
  ShieldAlert,
} from "lucide-react";
import { refreshSystemHealthAction } from "@/app/dashboard/admin/plans/health-actions";
import type { SuperAdminHealthDashboard, SuperAdminHealthServiceId } from "@/lib/super-admin-health";
import type { Locale } from "@/lib/localization";

const refreshIntervalMs = 5 * 60 * 1000;
const systemHealthIcons: Record<SuperAdminHealthServiceId, typeof Database> = {
  database: Database,
  billing: CreditCard,
  resend: Mail,
  "file-storage": HardDrive,
  "rate-limiting": ShieldAlert,
};

export function SuperAdminHealthPanel({
  initialDashboard,
  locale,
}: {
  initialDashboard: SuperAdminHealthDashboard;
  locale: Locale;
}) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const runningRef = useRef(false);
  const lastRefreshStartedAtRef = useRef<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const numberFormat = new Intl.NumberFormat(locale);
  const healthPercentFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const healthAvailability = dashboard.availabilityPercent === null
    ? "No data"
    : `${healthPercentFormat.format(dashboard.availabilityPercent)}%`;
  const healthAverageLatency = dashboard.averageLatencyMs === null
    ? "No data"
    : `${numberFormat.format(dashboard.averageLatencyMs)} ms`;
  const healthLastChecked = dashboard.lastCheckedAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(dashboard.lastCheckedAt)
    : "No run in the last 24 hours";
  const healthTimeFormat = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });

  const refresh = useCallback(async (manual = false) => {
    if (runningRef.current) return;
    const now = performance.now();
    if (!manual && lastRefreshStartedAtRef.current !== null
      && now - lastRefreshStartedAtRef.current < refreshIntervalMs - 1000) return;
    runningRef.current = true;
    lastRefreshStartedAtRef.current = now;
    setIsRunning(true);
    setError(null);
    try {
      setDashboard(await refreshSystemHealthAction());
    } catch {
      setError("Live check failed. Showing the most recently saved results.");
    } finally {
      runningRef.current = false;
      setIsRunning(false);
    }
  }, []);

  useEffect(() => {
    const initialCheck = window.setTimeout(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, refreshIntervalMs);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearTimeout(initialCheck);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refresh]);

  const refreshStatus = isRunning
    ? "Checking services…"
    : error ?? (dashboard.lastCheckedAt
      ? `Last recorded run: ${healthLastChecked}`
      : "Live check will start when this dashboard is open.");

  return (
    <section aria-labelledby="system-health-heading" className="super-admin-analytics-section">
      <div className="panel-heading-row super-admin-section-heading">
        <div>
          <h2 id="system-health-heading">System health</h2>
          <p>Live checks every five minutes while this page is open · Vercel background cron: daily · last recorded run: {healthLastChecked} · rolling 24-hour metrics</p>
        </div>
        <div className="super-admin-health-live-control">
          <button className="button button-light" disabled={isRunning} onClick={() => void refresh(true)} type="button">
            {isRunning ? "Checking…" : "Check now"}
          </button>
          <span aria-live="polite" className={error ? "is-error" : ""} role={error ? "alert" : undefined}>{refreshStatus}</span>
        </div>
      </div>
      <div aria-label="24-hour system health statistics" className="super-admin-health-overview-grid">
        <article className="super-admin-health-metric">
          <span>Service availability</span>
          <strong className={dashboard.availabilityPercent !== null && dashboard.availabilityPercent < 99 ? "is-low" : ""}>{healthAvailability}</strong>
          <small>Target: 99% or higher</small>
        </article>
        <article className="super-admin-health-metric">
          <span>Recorded runs</span>
          <strong>{numberFormat.format(dashboard.runCount)}</strong>
          <small>Recorded in the last 24 hours</small>
        </article>
        <article className="super-admin-health-metric">
          <span>Failed probes</span>
          <strong className={dashboard.failedChecks ? "is-low" : ""}>{numberFormat.format(dashboard.failedChecks)}</strong>
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
        {dashboard.observedChecks ? (
          <>
            <div aria-label="Hourly service availability over the previous 24 hours" className="super-admin-health-bars" role="img">
              {dashboard.hourlyAvailability.map((hour) => {
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
        ) : <p className="super-admin-health-empty">No checks have been recorded in the last 24 hours. A live check runs when this dashboard opens; Vercel&apos;s daily background cron requires CRON_SECRET.</p>}
      </section>
      <div aria-label="System health checks" className="super-admin-health-grid">
        {dashboard.services.map((check) => {
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
  );
}
