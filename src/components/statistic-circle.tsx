import { AnimatedMetric } from "@/components/animated-metric";

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
  const progress = total > 0 ? Math.min(Math.max((value / total) * 100, 0), 100) : 0;
  const progressLabel = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(progress / 100);

  return (
    <strong className="statistic-circle">
      <svg aria-label={progressLabel} className="statistic-circle-ring" role="img" viewBox="0 0 90 90">
        <circle cx="45" cy="45" r="40" pathLength="100" strokeDasharray="100 100" strokeDashoffset={100 - progress} />
      </svg>
      <AnimatedMetric locale={locale} value={value} />{percentage ? "%" : null}
    </strong>
  );
}
