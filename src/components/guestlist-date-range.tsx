"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { CalendarGrid, initialCalendarMonth, useCalendarPopover } from "@/components/calendar-grid";
import { usePreferences } from "@/components/preferences-provider";
import { parseDateParam } from "@/lib/date-range";

export function GuestlistDateRange({ initialFrom, initialTo }: { initialFrom: string; initialTo: string }) {
  const { locale, t } = usePreferences();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const { open, setOpen, containerRef, triggerRef, panelId } = useCalendarPopover();
  const [month, setMonth] = useState(() => initialCalendarMonth(
    parseDateParam(initialFrom) ? initialFrom : initialTo,
  ));

  const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  const fromDate = parseDateParam(from);
  const toDate = parseDateParam(to);
  const label = fromDate && toDate
    ? `${dateFormatter.format(fromDate)} – ${dateFormatter.format(toDate)}`
    : fromDate
      ? `${t("From")} ${dateFormatter.format(fromDate)}`
      : toDate
        ? `${t("To")} ${dateFormatter.format(toDate)}`
        : from || to ? t("Invalid date range") : t("Select date range");
  function selectDate(date: string) {
    if (!fromDate || to || date < from) {
      setFrom(date);
      setTo("");
    } else {
      setTo(date);
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  return (
    <div className="guestlist-date-range" ref={containerRef}>
      <input name="from" type="hidden" value={from} />
      <input name="to" type="hidden" value={to} />
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${t("Date range")}: ${label}`}
        className="guestlist-date-range-trigger"
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <CalendarDays aria-hidden="true" size={16} />
        <span>{label}</span>
      </button>
      {open && (
        <div aria-label={t("Choose registration date range")} className="guestlist-calendar" id={panelId} role="dialog">
          <CalendarGrid from={from} month={month} onMonthChange={setMonth} onSelect={selectDate} to={to} />
          <div className="guestlist-calendar-footer">
            <span>{from && !to ? t("Choose an end date") : t("Choose a start and end date")}</span>
            <button onClick={() => { setFrom(""); setTo(""); }} type="button">{t("Clear")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
