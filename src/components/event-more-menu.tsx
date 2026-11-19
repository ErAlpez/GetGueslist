"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Copy, LockKeyhole, MoreHorizontal, Pencil } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
import {
  archiveEventAction,
  deleteEventAction,
  duplicateEventAction,
} from "@/app/dashboard/events/actions";

export function EventMoreMenu({
  canUseEventLifecycle,
  eventId,
}: {
  canUseEventLifecycle: boolean;
  eventId: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div className={`event-more-menu${open ? " is-open" : ""}`} ref={containerRef}>
      <button
        aria-controls={popoverId}
        aria-expanded={open}
        aria-label="More event actions"
        className="event-more-trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <MoreHorizontal aria-hidden="true" size={17} />
      </button>
      {open && (
        <div className="event-more-popover" id={popoverId}>
          <Link href={`/dashboard/events/${eventId}/edit`}>
            <Pencil size={13} /> Edit event
          </Link>
          {canUseEventLifecycle ? (
            <>
              <form action={duplicateEventAction}>
                <input name="eventId" type="hidden" value={eventId} />
                <button type="submit"><Copy size={13} /> Duplicate event</button>
              </form>
              <form action={archiveEventAction}>
                <input name="eventId" type="hidden" value={eventId} />
                <ConfirmButton message="Archive this event? Its records will be kept.">
                  Archive event
                </ConfirmButton>
              </form>
            </>
          ) : (
            <>
              <span className="event-more-locked"><LockKeyhole size={13} /> Duplicate · Starter</span>
              <span className="event-more-locked"><LockKeyhole size={13} /> Archive · Starter</span>
            </>
          )}
          <form action={deleteEventAction}>
            <input name="eventId" type="hidden" value={eventId} />
            <ConfirmButton
              className="danger-action"
              message="Permanently delete this event? This is only allowed when it has no registrations."
            >
              Delete empty event
            </ConfirmButton>
          </form>
        </div>
      )}
    </div>
  );
}
