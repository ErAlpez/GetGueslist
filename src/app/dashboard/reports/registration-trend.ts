export function registrationTrend(
  registrations: { registeredAt: Date }[],
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
  for (const registration of registrations) {
    const key = registration.registeredAt.toISOString().slice(0, 10);
    const day = daysByKey.get(key);
    if (day) day.count += 1;
  }
  return days.map(({ label, count }) => ({ label, count }));
}
