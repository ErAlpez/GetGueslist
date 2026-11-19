"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { usePreferences } from "@/components/preferences-provider";

export function TopbarEventSearch() {
  const { t } = usePreferences();
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setExpanded(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExpanded(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [expanded]);

  return (
    <form
      action="/dashboard/events"
      className={`topbar-search-control${expanded ? " is-expanded" : ""}`}
      ref={containerRef}
      role="search"
    >
      {expanded && (
        <input
          aria-label={t("Search events")}
          autoComplete="off"
          name="q"
          placeholder={t("Search events...")}
          ref={inputRef}
        />
      )}
      <button
        aria-expanded={expanded}
        aria-label={t(expanded ? "Close event search" : "Search events")}
        className="topbar-search-toggle"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        {expanded ? <X aria-hidden="true" size={16} /> : <Search aria-hidden="true" size={17} />}
      </button>
    </form>
  );
}
