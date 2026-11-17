"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePreferences } from "@/components/preferences-provider";
import { parseDateParam } from "@/lib/date-range";

export function useCalendarPopover() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return { open, setOpen, containerRef, triggerRef, panelId };
}

export function initialCalendarMonth(value: string) {
  const date = new Date((parseDateParam(value) || new Date()).getTime());
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export function CalendarGrid({
  month,
  onMonthChange,
  from,
  to = "",
  onSelect,
}: {
  month: Date;
  onMonthChange: (month: Date) => void;
  from: string;
  to?: string;
  onSelect: (date: string) => void;
}) {
  const { locale, t } = usePreferences();
  const fullDateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" });
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const firstDay = month.getUTCDay();
  const lastDay = new Date(month);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);

  function changeMonth(offset: number) {
    const next = new Date(month);
    next.setUTCMonth(next.getUTCMonth() + offset);
    onMonthChange(next);
  }

  return (
    <>
      <div className="guestlist-calendar-heading">
        <button aria-label={t("Previous month")} disabled={month.getUTCFullYear() === 0 && month.getUTCMonth() === 0} onClick={() => changeMonth(-1)} type="button"><ChevronLeft size={16} /></button>
        <strong aria-live="polite">{monthFormatter.format(month)}</strong>
        <button aria-label={t("Next month")} disabled={month.getUTCFullYear() === 9999 && month.getUTCMonth() === 11} onClick={() => changeMonth(1)} type="button"><ChevronRight size={16} /></button>
      </div>
      <div className="guestlist-calendar-grid">
        {Array.from({ length: 7 }, (_, index) => (
          <span className="guestlist-calendar-weekday" key={`weekday-${index}`}>
            {weekdayFormatter.format(new Date(Date.UTC(2023, 0, index + 1)))}
          </span>
        ))}
        {Array.from({ length: firstDay }, (_, index) => <span aria-hidden="true" key={`empty-${index}`} />)}
        {Array.from({ length: lastDay.getUTCDate() }, (_, index) => {
          const date = new Date(month);
          date.setUTCDate(index + 1);
          const value = date.toISOString().slice(0, 10);
          const selected = value === from || value === to;
          const inRange = Boolean(from && to && value > from && value < to);
          return (
            <button
              aria-label={fullDateFormatter.format(date)}
              aria-pressed={selected}
              className={`${selected ? "is-selected" : ""}${inRange ? " is-in-range" : ""}`}
              key={value}
              onClick={() => onSelect(value)}
              type="button"
            >
              {index + 1}
            </button>
          );
        })}
      </div>
    </>
  );
}
