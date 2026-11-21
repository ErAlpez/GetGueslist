import type { ReactNode } from "react";
import { AnimatedMetric } from "@/components/animated-metric";

function getStatisticProgress(value: number, total: number, locale: string) {
  const progress = total > 0 ? Math.min(Math.max((value / total) * 100, 0), 100) : 0;
  const progressLabel = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(progress / 100);
  return { progress, progressLabel };
}

export function StatisticCircle({
  value,
  total,
  locale,
  percentage = false,
}: {
  value: number;
  total: number;
  locale: string;
  percentage?: boolean;
}) {
  const { progress, progressLabel } = getStatisticProgress(value, total, locale);

  return (
    <strong className="statistic-circle">
      <svg aria-label={progressLabel} className="statistic-circle-ring" role="img" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r="40" pathLength="100" strokeDasharray="100 100" strokeDashoffset={100 - progress} />
      </svg>
      <AnimatedMetric locale={locale} value={value} />{percentage ? "%" : null}
    </strong>
  );
}

export function StatisticIconCircle({
  value,
  total,
  locale,
  icon,
}: {
  value: number;
  total: number;
  locale: string;
  icon: ReactNode;
}) {
  const { progress, progressLabel } = getStatisticProgress(value, total, locale);

  return (
    <span aria-label={progressLabel} className="statistic-icon-circle" role="img">
      <svg aria-hidden="true" className="statistic-icon-circle-ring" viewBox="0 0 120 120">
        <circle className="statistic-icon-circle-track" cx="60" cy="60" r="52" />
        <circle className="statistic-icon-circle-progress" cx="60" cy="60" pathLength="100" r="52" strokeDasharray="100 100" strokeDashoffset={100 - progress} />
      </svg>
      <span aria-hidden="true" className="statistic-icon-circle-content">{icon}</span>
    </span>
  );
}
