"use client";

import { useId, useState } from "react";
import { CalendarDays } from "lucide-react";
import { CalendarGrid, initialCalendarMonth, useCalendarPopover } from "@/components/calendar-grid";
import { usePreferences } from "@/components/preferences-provider";
import { parseDateParam } from "@/lib/date-range";

export function EventDateTime({ label, name, initialValue = "", required = false, alignEnd = false }: { label: string; name: string; initialValue?: string; required?: boolean; alignEnd?: boolean }) {
  const { locale, t } = usePreferences();
  const [date, setDate] = useState(() => initialValue.split("T")[0] ?? "");
  const [invalid, setInvalid] = useState(false);
  const [month, setMonth] = useState(() => initialCalendarMonth(initialValue.split("T")[0] ?? ""));
  const { open, setOpen, containerRef, triggerRef, panelId } = useCalendarPopover();
  const labelId = useId();
  const errorId = useId();
  const selectedDate = parseDateParam(date);
  const dateLabel = selectedDate
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(selectedDate)
    : t("Select date");
  return (
    <div className="form-field">
      <span id={labelId}>{t(label)}{required && <span className="sr-only"> ({t("Required")})</span>}</span>
      <div className={`guestlist-date-range event-date-time${alignEnd ? " event-date-time-end" : ""}`} ref={containerRef}>
        <input
          aria-hidden="true"
          className="event-date-time-validation"
          name={name}
          onChange={() => {}}
          onInvalid={(event) => {
            event.preventDefault();
            if (event.currentTarget.form?.querySelector(":invalid") === event.currentTarget) {
              setInvalid(true);
              setOpen(true);
              triggerRef.current?.focus();
            }
          }}
          required={required}
          tabIndex={-1}
          type="text"
          value={date}
        />
        <button
          aria-controls={panelId}
          aria-describedby={invalid ? errorId : undefined}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={`${t(label)}: ${dateLabel}`}
          className="guestlist-date-range-trigger"
          onClick={() => setOpen((current) => !current)}
          ref={triggerRef}
          type="button"
        >
          <CalendarDays aria-hidden="true" size={16} />
          <span>{dateLabel}</span>
        </button>
        {open && (
          <div aria-labelledby={labelId} className="guestlist-calendar event-date-time-calendar" id={panelId} role="dialog">
            <CalendarGrid
              from={date}
              month={month}
              onMonthChange={setMonth}
              onSelect={(value) => { setDate(value); setInvalid(false); }}
            />
            <div className="guestlist-calendar-footer">
              <button onClick={() => { setDate(""); setInvalid(false); }} type="button">{t("Clear")}</button>
              <button onClick={() => { setOpen(false); triggerRef.current?.focus(); }} type="button">{t("Done")}</button>
            </div>
          </div>
        )}
      </div>
      {invalid && <span className="event-date-time-error" id={errorId} role="alert">{t("Choose a date.")}</span>}
    </div>
  );
}
