export function registrationTrend(
  dailyCounts: { day: string; count: number | bigint }[],
  locale: string,
  now: Date,
) {
  const formatter = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (6 - index));
    return {
      key: date.toISOString().slice(0, 10),
      label: formatter.format(date),
      count: 0,
    };
  });
  const daysByKey = new Map(days.map((day) => [day.key, day]));
  for (const dailyCount of dailyCounts) {
    const day = daysByKey.get(dailyCount.day);
    if (day) day.count = Number(dailyCount.count);
  }
  return days.map(({ label, count }) => ({ label, count }));
}
