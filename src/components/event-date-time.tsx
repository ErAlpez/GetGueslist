"use client";

import { useId, useState } from "react";
import { CalendarDays } from "lucide-react";
import { CalendarGrid, initialCalendarMonth, useCalendarPopover } from "@/components/calendar-grid";
import { usePreferences } from "@/components/preferences-provider";
import { parseDateParam } from "@/lib/date-range";

export function EventDateTime({ label, name, initialValue = "", defaultTime = "", required = false, onValueChange }: { label: string; name?: string; initialValue?: string; defaultTime?: string; required?: boolean; onValueChange?: (value: string) => void }) {
  const { locale, t } = usePreferences();
  const [date, setDate] = useState(() => initialValue.slice(0, 10));
  const [time, setTime] = useState(() => initialValue.split("T")[1]?.slice(0, 5) || defaultTime);
  const [invalid, setInvalid] = useState(false);
  const [month, setMonth] = useState(() => initialCalendarMonth(initialValue.split("T")[0] ?? ""));
  const { open, setOpen, containerRef, triggerRef, panelId } = useCalendarPopover();
  const labelId = useId();
  const errorId = useId();
  const selectedDate = parseDateParam(date);
  const dateLabel = selectedDate
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(selectedDate)
    : t("Select date");
  const value = date && time ? `${date}T${time}` : "";
  return (
    <div className="form-field">
      <span id={labelId}>{t(label)}{required && <span className="sr-only"> ({t("Required")})</span>}</span>
      <div className="venuguestpass-date-range event-date-time" ref={containerRef}>
        {name && (
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
            value={value}
          />
        )}
        <button
          aria-controls={panelId}
          aria-describedby={invalid ? errorId : undefined}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={`${t(label)}: ${dateLabel}${date && time ? `, ${time}` : ""}`}
          className="venuguestpass-date-range-trigger"
          onClick={() => setOpen((current) => !current)}
          ref={triggerRef}
          type="button"
        >
          <CalendarDays aria-hidden="true" size={16} />
          <span>{dateLabel}{date && time ? `, ${time}` : ""}</span>
        </button>
        {open && (
          <div aria-labelledby={labelId} className="venuguestpass-calendar event-date-time-calendar" id={panelId} role="dialog">
            <CalendarGrid
              from={date}
              month={month}
              onMonthChange={setMonth}
              onSelect={(nextDate) => {
                setDate(nextDate);
                setInvalid(false);
                onValueChange?.(nextDate && time ? `${nextDate}T${time}` : "");
              }}
            />
            <label className="event-date-time-time">
              {t("Time")}
              <input
                aria-label={`${t(label)} ${t("Time")}`}
                onChange={(event) => {
                  const nextTime = event.target.value;
                  setTime(nextTime);
                  setInvalid(false);
                  onValueChange?.(date && nextTime ? `${date}T${nextTime}` : "");
                }}
                required={required || Boolean(date)}
                type="time"
                value={time}
              />
            </label>
            <div className="venuguestpass-calendar-footer">
              <button onClick={() => { setDate(""); setTime(defaultTime); setInvalid(false); onValueChange?.(""); }} type="button">{t("Clear")}</button>
              <button onClick={() => { setOpen(false); triggerRef.current?.focus(); }} type="button">{t("Done")}</button>
            </div>
          </div>
        )}
      </div>
      {invalid && <span className="event-date-time-error" id={errorId} role="alert">{t("Choose a date and time.")}</span>}
    </div>
  );
}
