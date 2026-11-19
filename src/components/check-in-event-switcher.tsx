"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { usePreferences } from "@/components/preferences-provider";
import "./check-in-event-switcher.css";

export type CheckInEventOption = { id: string; name: string };

export function CheckInEventSwitcher({ events, selectedEvent }: { events: CheckInEventOption[]; selectedEvent: CheckInEventOption }) {
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const optionsId = useId();

  useEffect(() => {
    if (!open) return;
    optionRefs.current[events.findIndex((event) => event.id === selectedEvent.id)]?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    function handleFocusIn(event: FocusEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [open, events, selectedEvent.id]);

  return (
    <div className={`language-control checkin-event-switcher${open ? " is-open" : ""}`} ref={containerRef}>
      <button
        aria-controls={optionsId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`${t("Switch event")}: ${selectedEvent.name}`}
        className="language-trigger"
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <span aria-hidden="true" className="language-trigger-icon"><CalendarDays size={15} /></span>
        <span className="language-trigger-name">{selectedEvent.name}</span>
        <ChevronDown aria-hidden="true" className="language-trigger-chevron" size={13} />
      </button>
      {open && (
        <div className="language-popover">
          <div className="language-popover-heading">
            <span aria-hidden="true" className="language-popover-mark"><CalendarDays size={15} /></span>
            <span><strong>{t("Switch event")}</strong><small>{selectedEvent.name}</small></span>
          </div>
          <div aria-label={t("Switch event")} className="language-options" id={optionsId} role="listbox">
            {events.map((event, index) => (
              <a
                aria-selected={event.id === selectedEvent.id}
                className="language-option"
                href={`/dashboard/check-in?event=${encodeURIComponent(event.id)}`}
                key={event.id}
                onKeyDown={(keyboardEvent) => {
                  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(keyboardEvent.key)) return;
                  keyboardEvent.preventDefault();
                  const nextIndex = keyboardEvent.key === "Home"
                    ? 0
                    : keyboardEvent.key === "End"
                      ? events.length - 1
                      : (index + (keyboardEvent.key === "ArrowDown" ? 1 : -1) + events.length) % events.length;
                  optionRefs.current[nextIndex]?.focus();
                }}
                ref={(element) => { optionRefs.current[index] = element; }}
                role="option"
                tabIndex={event.id === selectedEvent.id ? 0 : -1}
              >
                <span className="language-option-name">{event.name}</span>
                {event.id === selectedEvent.id && <Check aria-hidden="true" className="language-option-check" size={15} />}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
