"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Html5QrcodeScanner } from "html5-qrcode";
import { AlertTriangle, ArrowRight, LoaderCircle, Search, ScanLine, X } from "lucide-react";
import { usePreferences } from "@/components/preferences-provider";
import { localizeNode } from "@/lib/localization";

type CheckInResult = {
  result: "checked_in" | "already_checked_in" | "invalid_ticket" | "ticket_unavailable" | "expired" | "invalid_request" | "unauthorized" | "forbidden";
  message?: string;
  attendeeName?: string;
  eventName?: string;
  checkedInAt?: string;
};

type SearchAttendee = {
  registrationId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  category: string;
  ticketId: string | null;
  ticketStatus: string;
  ticketToken: string | null;
};

type SearchResult = {
  eventId: string;
  query: string;
  attendees: SearchAttendee[];
  error: string;
};

function extractToken(value: string) {
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length === 2 && segments[0] === "t") return segments[1];
  } catch {
    return value.trim();
  }
  return value.trim();
}

function createDeviceId() {
  if (typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();

  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function CheckInScanner({
  eventId,
  phoneScannerAccess,
}: {
  eventId: string;
  phoneScannerAccess?: ReactNode;
}) {
  const { locale } = usePreferences();
  const router = useRouter();
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [manualQuery, setManualQuery] = useState("");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [checking, setChecking] = useState(false);
  const processingRef = useRef(false);
  const scannedRef = useRef(false);
  const deviceIdRef = useRef("browser-scanner");

  useEffect(() => {
    deviceIdRef.current = createDeviceId();
  }, []);

  const checkIn = useCallback(async (rawValue: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setChecking(true);
    setResult(null);

    try {
      const response = await fetch("/api/check-in/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          token: extractToken(rawValue),
          deviceId: deviceIdRef.current,
        }),
      });
      const payload = await response.json() as CheckInResult;
      setResult(payload);
      if (payload.result === "checked_in") router.refresh();
      if (payload.result === "checked_in" || payload.result === "already_checked_in") {
        setSearchResult((current) => current && ({
          ...current,
          attendees: current.attendees.map((attendee) =>
            attendee.ticketToken === extractToken(rawValue)
              ? { ...attendee, ticketStatus: "USED" }
              : attendee,
          ),
        }));
      }
    } catch {
      setResult({
        result: "invalid_request",
        message: "We couldn’t validate this ticket. Check your connection and try again.",
      });
    } finally {
      setChecking(false);
      processingRef.current = false;
    }
  }, [eventId, router]);

  useEffect(() => {
    const container = document.getElementById("guestlist-qr-reader");
    if (!container) return;

    const scanner = new Html5QrcodeScanner(
      "guestlist-qr-reader",
      { fps: 8, qrbox: { width: 220, height: 220 }, rememberLastUsedCamera: true },
      false,
    );
    scanner.render(
      (decodedText) => {
        if (scannedRef.current) return;
        scannedRef.current = true;
        void checkIn(decodedText);
      },
      () => undefined,
    );

    return () => {
      void scanner.clear().catch((error: unknown) => {
        console.error("Could not stop the QR scanner cleanly:", error);
      });
    };
  }, [checkIn]);

  useEffect(() => {
    const query = manualQuery.trim();
    if (query.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/check-in/search?event=${encodeURIComponent(eventId)}&q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          setSearchResult({ eventId, query, attendees: [], error: "Guest search isn’t available right now." });
          return;
        }
        const payload = await response.json() as { attendees: SearchAttendee[] };
        setSearchResult({ eventId, query, attendees: payload.attendees, error: "" });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSearchResult({ eventId, query, attendees: [], error: "Guest search failed. Please try again." });
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [eventId, manualQuery]);

  function resetScanner() {
    scannedRef.current = false;
    setResult(null);
  }

  const resultTone = result?.result === "already_checked_in" || result?.result === "ticket_unavailable" || result?.result === "expired"
    ? "warning"
    : "error";
  const resultLabel = resultTone === "warning" ? "Ticket needs attention" : "Unable to check in";
  const resultDetail = result?.attendeeName
    ? result.message ?? result.eventName
    : result?.message ?? (result?.result === "unauthorized"
      ? "Sign in to check in guests."
      : result?.result === "forbidden"
        ? "You don’t have permission to check in guests."
        : "Please try again.");
  const query = manualQuery.trim();
  const currentSearch = searchResult?.eventId === eventId && searchResult.query === query ? searchResult : null;

  return localizeNode((
    <div className={`check-in-workspace${phoneScannerAccess ? " check-in-workspace-with-phone-access" : ""}`}>
      {phoneScannerAccess}
      <div className="scanner-panel app-panel">
        <div className="panel-heading-row"><div><h2>Scan a ticket</h2><p>Allow camera access to scan a guest’s QR ticket.</p></div><ScanLine size={16} /></div>
        <div className="scanner-frame"><div id="guestlist-qr-reader" /></div>
        {checking && <div className="scanner-progress"><LoaderCircle className="spin" size={14} /> Validating ticket…</div>}
        {result?.result === "checked_in" && (
          <>
            <span className="sr-only" role="status">Check-in complete. {result.attendeeName}</span>
            <button className="scan-next-button" onClick={resetScanner} type="button">Scan next <ArrowRight aria-hidden="true" size={14} /></button>
          </>
        )}
        {result && result.result !== "checked_in" && (
          <div aria-live="polite" className={`scan-result scan-result-${resultTone}`}>
            <span aria-hidden="true" className="scan-result-symbol">
              {resultTone === "warning" ? <AlertTriangle size={19} /> : <X size={19} />}
            </span>
            <span className="scan-result-copy">
              <span className="scan-result-label">{resultLabel}</span>
              {result.attendeeName && <strong>{result.attendeeName}</strong>}
              {resultDetail && <small>{resultDetail}</small>}
            </span>
            <button onClick={resetScanner} type="button">Scan next <ArrowRight aria-hidden="true" size={14} /></button>
          </div>
        )}
      </div>
      <div className="manual-checkin app-panel">
        <div className="panel-heading-row"><div><h2>Find a guest</h2><p>Search by ticket ID, name or email to check in a guest.</p></div></div>
        <label className="manual-search"><Search aria-hidden="true" size={14} /><input aria-label="Ticket ID, name or email" autoComplete="off" onChange={(event) => setManualQuery(event.target.value)} placeholder="Enter ticket ID, name or email" value={manualQuery} /></label>
        {query.length >= 2 && currentSearch?.error && <p className="form-message form-error manual-search-error">{currentSearch.error}</p>}
        {query.length >= 2 && !currentSearch && <div className="manual-helper" role="status">Searching guests…</div>}
        {query.length >= 2 && currentSearch && !currentSearch.error && (
          <div className="manual-results">
            {currentSearch.attendees.map((attendee) => (
              <div className="manual-attendee" key={attendee.registrationId}>
                <span className="manual-attendee-copy"><strong>{attendee.firstName} {attendee.lastName}</strong><small>{attendee.email || attendee.category.toLowerCase()}</small>{attendee.ticketId && <small>Ticket ID: {attendee.ticketId.toUpperCase()}</small>}</span>
                {attendee.ticketToken && attendee.ticketStatus === "ACTIVE"
                  ? <button disabled={checking} onClick={() => { if (attendee.ticketToken) void checkIn(attendee.ticketToken); }} type="button">Check in</button>
                  : <span className="manual-ticket-state">{attendee.ticketStatus.toLowerCase().replaceAll("_", " ")}</span>}
              </div>
            ))}
            {!currentSearch.attendees.length && <p className="no-manual-results">No matching guests found.</p>}
          </div>
        )}
        {query.length < 2 && <div className="manual-helper">Enter at least 2 characters, or the first 8 characters of a ticket ID. Results stay scoped to this event.</div>}
      </div>
    </div>
  ), locale);
}
