"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Search } from "lucide-react";
import { usePreferences } from "@/components/preferences-provider";

type TicketEventOption = {
  id: string;
  name: string;
  _count: { registrations: number };
};

export function filterTicketEvents(events: TicketEventOption[], query: string) {
  const search = query.trim().toLowerCase();
  return search ? events.filter((event) => event.name.toLowerCase().includes(search)) : events;
}

export function TicketsEventFilter({
  events,
  selectedEventId,
  allGuestCount,
}: {
  events: TicketEventOption[];
  selectedEventId?: string;
  allGuestCount: number;
}) {
  const { t } = usePreferences();
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const filteredEvents = filterTicketEvents(events, submittedQuery);

  return (
    <div className="ticket-event-filter">
      <form
        className="dashboard-search-field ticket-event-search"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmittedQuery(query);
        }}
      >
        <Search aria-hidden="true" size={15} />
        <input
          aria-label={t("Search events")}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("Search events...")}
          type="search"
          value={query}
        />
        <button aria-label={t("Search events")} type="submit"><ArrowRight aria-hidden="true" size={13} /></button>
      </form>
      <nav aria-label={t("Tickets")} className="ticket-filters">
        <Link
          aria-current={!selectedEventId ? "page" : undefined}
          className={!selectedEventId ? "selected" : ""}
          href="/dashboard/tickets"
        >
          <span>{t("All events")}</span><span className="ticket-filter-count">{allGuestCount}</span>
        </Link>
        {filteredEvents.map((event) => (
          <Link
            aria-current={selectedEventId === event.id ? "page" : undefined}
            className={selectedEventId === event.id ? "selected" : ""}
            href={`/dashboard/tickets?event=${event.id}`}
            key={event.id}
          >
            <span>{event.name}</span><span className="ticket-filter-count">{event._count.registrations}</span>
          </Link>
        ))}
      </nav>
      {submittedQuery.trim() && filteredEvents.length === 0 && (
        <p aria-live="polite" className="ticket-event-search-empty">{t("No events match your search.")}</p>
      )}
    </div>
  );
}
