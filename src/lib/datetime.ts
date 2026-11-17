const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function formatEventDate(date: Date, timeZone: string, locale: string, includeYear = true) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: includeYear ? "numeric" : undefined,
    timeZone,
  }).formatToParts(date).map((part) =>
    locale === "en" && part.type === "weekday" && part.value === "Wed" ? "Weds" : part.value,
  ).join("");
}

export function formatEventDateRange(startsAt: Date, endsAt: Date, timeZone: string, locale: string) {
  const yearFormatter = new Intl.DateTimeFormat(locale, { year: "numeric", timeZone });
  const sameYear = yearFormatter.format(startsAt) === yearFormatter.format(endsAt);
  return {
    start: formatEventDate(startsAt, timeZone, locale, !sameYear),
    end: formatEventDate(endsAt, timeZone, locale),
  };
}

export function utcToLocalDateTime(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const valueFor = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((part) => part.type === type)?.value;
    if (!value) throw new Error("Unable to display the event date and time.");
    return value;
  };
  return `${valueFor("year").padStart(4, "0")}-${valueFor("month")}-${valueFor("day")}T${valueFor("hour")}:${valueFor("minute")}`;
}

export function localDateTimeToUtc(value: string, timeZone: string) {
  const match = LOCAL_DATE_TIME.exec(value);
  if (!match) throw new Error("Enter a valid date and time.");

  const target = match.slice(1).map(Number);
  const [year, month, day, hour, minute] = target;
  const desiredAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = desiredAsUtc;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = formatter.formatToParts(new Date(candidate));
    const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const renderedAsUtc = Date.UTC(
      valueFor("year"),
      valueFor("month") - 1,
      valueFor("day"),
      valueFor("hour"),
      valueFor("minute"),
    );
    const difference = desiredAsUtc - renderedAsUtc;
    if (difference === 0) return new Date(candidate);
    candidate += difference;
  }

  throw new Error("That local time does not exist in the selected timezone.");
}
