"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Html5QrcodeScanner } from "html5-qrcode";
import { AlertTriangle, ArrowRight, Check, ChevronDown, LoaderCircle, Search, ScanLine, X } from "lucide-react";
import { usePreferences } from "@/components/preferences-provider";
import { CheckInEventSwitcher, type CheckInEventOption } from "@/components/check-in-event-switcher";
import { NfcCheckIn } from "@/components/nfc-checkin";
import { localizeNode } from "@/lib/localization";
import { queueOfflineCheckIn, readOfflineQueue, syncOfflineCheckIns } from "@/lib/offline-checkin";
import { searchCheckIns, validateCheckIn } from "@/lib/api";
import { showToast, updateToast } from "@/components/toast-provider";

type CheckInResult = {
  result:
    | "checked_in"
    | "claimed"
    | "already_claimed"
    | "checkpoint_full"
    | "invalid_checkpoint"
    | "main_checkin_required"
    | "already_checked_in"
    | "invalid_ticket"
    | "ticket_unavailable"
    | "expired"
    | "invalid_request"
    | "unauthorized"
    | "forbidden";
  message?: string;
  attendeeName?: string;
  eventName?: string;
  checkpointName?: string;
  checkedInAt?: string;
  certificateEmailStatus?: "sent" | "failed" | "no_email" | "unavailable";
};

type CheckpointOption = {
  id: string;
  name: string;
  claimedCount: number;
  capacity: number | null;
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
  events,
  phoneScannerAccess,
  nfcEnabled = false,
  selectedEvent,
  checkpoints = [],
}: {
  eventId: string;
  events: CheckInEventOption[];
  phoneScannerAccess?: ReactNode;
  nfcEnabled?: boolean;
  selectedEvent: CheckInEventOption;
  checkpoints?: CheckpointOption[];
}) {
  const { locale } = usePreferences();
  const router = useRouter();
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [manualQuery, setManualQuery] = useState("");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkpointId, setCheckpointId] = useState("");
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [checkpointMenuOpen, setCheckpointMenuOpen] = useState(false);
  const [queuedCount, setQueuedCount] = useState(() => typeof window === "undefined" ? 0 : readOfflineQueue().length);
  const processingRef = useRef(false);
  const scannedRef = useRef(false);
  const deviceIdRef = useRef("browser-scanner");
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const modeMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const checkpointMenuRef = useRef<HTMLDivElement>(null);
  const checkpointMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const modeMenuId = useId();
  const checkpointMenuId = useId();
  const activeCheckpointId = checkpoints.some((checkpoint) => checkpoint.id === checkpointId) ? checkpointId : "";
  const activeCheckpoint = checkpoints.find((checkpoint) => checkpoint.id === activeCheckpointId);

  useEffect(() => {
    if (!modeMenuOpen && !checkpointMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (modeMenuOpen && !modeMenuRef.current?.contains(event.target)) setModeMenuOpen(false);
      if (checkpointMenuOpen && !checkpointMenuRef.current?.contains(event.target)) setCheckpointMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (checkpointMenuOpen) {
          setCheckpointMenuOpen(false);
          checkpointMenuTriggerRef.current?.focus();
        } else if (modeMenuOpen) {
          setModeMenuOpen(false);
          modeMenuTriggerRef.current?.focus();
        }
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [checkpointMenuOpen, modeMenuOpen]);

  useEffect(() => {
    deviceIdRef.current = createDeviceId();
    const sync = () => {
      void syncOfflineCheckIns(deviceIdRef.current).then((synced) => {
        if (synced > 0) setQueuedCount(readOfflineQueue().length);
      });
    };
    window.addEventListener("online", sync);
    sync();
    return () => window.removeEventListener("online", sync);
  }, []);

  const checkIn = useCallback(async (rawValue: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setChecking(true);
    setResult(null);
    const toastId = showToast(activeCheckpointId ? "Claiming checkpoint..." : "Checking in...");

    try {
      const response = await validateCheckIn({
        eventId,
        token: extractToken(rawValue),
        deviceId: deviceIdRef.current,
        ...(activeCheckpointId ? { checkpointId: activeCheckpointId } : {}),
      });
      const payload = await response.json() as CheckInResult;
      setResult(payload);
      const succeeded = response.ok && (payload.result === "checked_in" || payload.result === "claimed");
      updateToast(toastId, payload.message ?? (succeeded ? "Check-in complete." : "This ticket could not be checked in."), succeeded ? "success" : "error");
      if (payload.result === "checked_in" || payload.result === "claimed") router.refresh();
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
      const token = extractToken(rawValue);
      if (activeCheckpointId) {
        const message = "Checkpoint claims require an online connection. No claim was recorded.";
        updateToast(toastId, message, "error");
        setResult({ result: "invalid_request", message });
      } else {
        queueOfflineCheckIn({
          eventId,
          token,
          deviceId: deviceIdRef.current,
          queuedAt: new Date().toISOString(),
        });
        setQueuedCount(readOfflineQueue().length);
        updateToast(toastId, "You’re offline. This scan was queued and will sync automatically.", "success");
        setResult({
          result: "invalid_request",
          message: "You’re offline. This scan was queued and will sync automatically.",
        });
      }
    } finally {
      setChecking(false);
      processingRef.current = false;
    }
  }, [activeCheckpointId, eventId, router]);

  const checkInRef = useRef(checkIn);
  useLayoutEffect(() => {
    checkInRef.current = checkIn;
  }, [checkIn]);

  const handleNfcToken = useCallback((token: string) => {
    setManualQuery("");
    setSearchResult(null);
    void checkIn(token);
  }, [checkIn]);

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;
    // Let Strict Mode's setup/cleanup probe cancel before a camera can start.
    const initTimer = window.setTimeout(() => {
      const container = document.getElementById("venuguestpass-qr-reader");
      if (!container) return;

      scanner = new Html5QrcodeScanner(
        "venuguestpass-qr-reader",
        { fps: 8, qrbox: { width: 220, height: 220 }, rememberLastUsedCamera: true },
        false,
      );
      scanner.render(
        (decodedText) => {
          if (scannedRef.current) return;
          scannedRef.current = true;
          void checkInRef.current(decodedText);
        },
        () => undefined,
      );
    }, 0);

    return () => {
      window.clearTimeout(initTimer);
      if (!scanner) return;
      void scanner.clear().catch((error: unknown) => {
        console.error("Could not stop the QR scanner cleanly:", error);
      });
    };
  }, []);

  useEffect(() => {
    const query = manualQuery.trim();
    if (query.length < 2) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await searchCheckIns(eventId, query, { signal: controller.signal });
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

  const resultTone = result?.result === "already_checked_in" ||
    result?.result === "already_claimed" ||
    result?.result === "checkpoint_full" ||
    result?.result === "main_checkin_required" ||
    result?.result === "ticket_unavailable" ||
    result?.result === "expired"
    ? "warning"
    : "error";
  const resultLabel = result?.result === "checkpoint_full"
    ? "Checkpoint full"
    : result?.result === "already_claimed"
      ? "Already claimed"
      : result?.result === "main_checkin_required"
        ? "Main check-in required"
        : resultTone === "warning" ? "Ticket needs attention" : "Unable to check in";
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
    <>
      <div className="page-heading-row">
        <div><div className="page-kicker">EVENT OPERATIONS</div><h1>Check-in</h1><p>Validate tickets and keep a live record of arrivals.</p></div>
        <div className="check-in-header-actions">
          {checkpoints.length > 0 && (
            <div className={`language-control checkin-mode-control${modeMenuOpen ? " is-open" : ""}`} ref={modeMenuRef}>
              <button
                aria-controls={modeMenuId}
                aria-expanded={modeMenuOpen}
                className="language-trigger"
                onClick={() => setModeMenuOpen((current) => !current)}
                ref={modeMenuTriggerRef}
                type="button"
              >
                <span aria-hidden="true" className="language-trigger-icon"><ScanLine size={15} /></span>
                <span className="language-trigger-name">{activeCheckpointId ? "Checkpoint claim" : "Entrance check-in"}</span>
                <ChevronDown aria-hidden="true" className="language-trigger-chevron" size={13} />
              </button>
              {modeMenuOpen && (
                <div aria-label="Check-in mode options" className="language-popover checkin-mode-popover" id={modeMenuId} role="group">
                  <button
                    aria-pressed={!activeCheckpointId}
                    className={`language-option${!activeCheckpointId ? " is-selected" : ""}`}
                    onClick={() => {
                      scannedRef.current = false;
                      setCheckpointId("");
                      setResult(null);
                      setCheckpointMenuOpen(false);
                      setModeMenuOpen(false);
                    }}
                    type="button"
                  >
                    <span className="language-option-name">Entrance check-in</span>
                    {!activeCheckpointId && <Check aria-hidden="true" className="language-option-check" size={15} />}
                  </button>
                  <button
                    aria-pressed={Boolean(activeCheckpointId)}
                    className={`language-option${activeCheckpointId ? " is-selected" : ""}`}
                    onClick={() => {
                      scannedRef.current = false;
                      setCheckpointId(activeCheckpointId || checkpoints[0].id);
                      setResult(null);
                      setCheckpointMenuOpen(false);
                      setModeMenuOpen(false);
                    }}
                    type="button"
                  >
                    <span className="language-option-name">Checkpoint claim</span>
                    {activeCheckpointId && <Check aria-hidden="true" className="language-option-check" size={15} />}
                  </button>
                </div>
              )}
            </div>
          )}
          {phoneScannerAccess}
          {nfcEnabled && <NfcCheckIn onToken={handleNfcToken} />}
          <CheckInEventSwitcher events={events} selectedEvent={selectedEvent} />
        </div>
      </div>
      {queuedCount > 0 && <div className="offline-checkin-status" role="status">Offline queue: {queuedCount} scan{queuedCount === 1 ? "" : "s"} waiting to sync.</div>}
      <div className="check-in-workspace">
        <div className="scanner-panel app-panel">
          <div className="panel-heading-row"><div><h2>{activeCheckpointId ? "Checkpoint claim" : "Entrance check-in"}</h2><p>{activeCheckpointId ? "Scan the same ticket QR after entrance check-in to record one claim for this checkpoint." : "Scan a guest’s ticket QR to record their entrance check-in."}</p></div><ScanLine size={16} /></div>
          {activeCheckpointId && (
            <div className="checkpoint-scan-select">
              <span>Checkpoint</span>
              <div className={`language-control${checkpointMenuOpen ? " is-open" : ""}`} ref={checkpointMenuRef}>
                <button
                  aria-controls={checkpointMenuId}
                  aria-expanded={checkpointMenuOpen}
                  aria-label={`Checkpoint: ${activeCheckpoint?.name ?? "Select checkpoint"}`}
                  className="language-trigger"
                  onClick={() => setCheckpointMenuOpen((current) => !current)}
                  ref={checkpointMenuTriggerRef}
                  type="button"
                >
                  <span aria-hidden="true" className="language-trigger-icon"><ScanLine size={15} /></span>
                  <span className="language-trigger-name">
                    {activeCheckpoint
                      ? `${activeCheckpoint.name} · ${activeCheckpoint.claimedCount}${activeCheckpoint.capacity === null ? "" : `/${activeCheckpoint.capacity}`}`
                      : "Select checkpoint"}
                  </span>
                  <ChevronDown aria-hidden="true" className="language-trigger-chevron" size={13} />
                </button>
                {checkpointMenuOpen && (
                  <div aria-label="Checkpoint options" className="language-popover checkin-mode-popover checkpoint-scan-popover" id={checkpointMenuId} role="group">
                    {checkpoints.map((checkpoint) => {
                      const selected = checkpoint.id === activeCheckpointId;
                      return (
                        <button
                          aria-pressed={selected}
                          className={`language-option${selected ? " is-selected" : ""}`}
                          key={checkpoint.id}
                          onClick={() => {
                            scannedRef.current = false;
                            setCheckpointId(checkpoint.id);
                            setResult(null);
                            setCheckpointMenuOpen(false);
                            checkpointMenuTriggerRef.current?.focus();
                          }}
                          type="button"
                        >
                          <span className="language-option-name">
                            {checkpoint.name} · {checkpoint.claimedCount}{checkpoint.capacity === null ? "" : `/${checkpoint.capacity}`}
                          </span>
                          {selected && <Check aria-hidden="true" className="language-option-check" size={15} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
          <div className="scanner-frame"><div id="venuguestpass-qr-reader" /></div>
          {checking && <div className="scanner-progress"><LoaderCircle className="spin" size={14} /> Validating ticket…</div>}
          {(result?.result === "checked_in" || result?.result === "claimed") && (
            <div aria-live="polite" className="scan-result scan-result-success">
              <span aria-hidden="true" className="scan-result-symbol"><Check size={19} /></span>
              <span className="scan-result-copy">
                <span className="scan-result-label">{result.result === "claimed" ? `${result.checkpointName ?? "Checkpoint"} claimed` : "Checked in"}</span>
                {result.attendeeName && <strong>{result.attendeeName}</strong>}
                {result.result === "checked_in" && result.certificateEmailStatus === "sent" && <small>Attendance certificate emailed.</small>}
                {result.result === "checked_in" && result.certificateEmailStatus === "failed" && <small>Certificate email failed. The guest can download it from their ticket page.</small>}
                {result.result === "checked_in" && result.certificateEmailStatus === "no_email" && <small>No email is saved. The guest can download the certificate from their ticket page.</small>}
                {result.result === "checked_in" && result.certificateEmailStatus === "unavailable" && <small>The certificate could not be generated for this name. Please contact the organizer.</small>}
              </span>
              <button className="scan-next-button" onClick={resetScanner} type="button">Scan next <ArrowRight aria-hidden="true" size={14} /></button>
            </div>
          )}
          {result && result.result !== "checked_in" && result.result !== "claimed" && (
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
          <div className="panel-heading-row"><div><h2>Find a guest</h2><p>Search by ticket ID, name or email to {activeCheckpointId ? "record a checkpoint claim" : "check in a guest"}.</p></div></div>
          <label className="dashboard-search-field manual-search"><Search aria-hidden="true" size={14} /><input aria-label="Ticket ID, name or email" autoComplete="off" onChange={(event) => setManualQuery(event.target.value)} placeholder="Enter ticket ID, name or email" value={manualQuery} /></label>
          {query.length >= 2 && currentSearch?.error && <p className="form-message form-error manual-search-error">{currentSearch.error}</p>}
          {query.length >= 2 && !currentSearch && <div className="manual-helper" role="status">Searching guests…</div>}
          {query.length >= 2 && currentSearch && !currentSearch.error && (
            <div className="manual-results">
              {currentSearch.attendees.map((attendee) => (
                <div className="manual-attendee" key={attendee.registrationId}>
                  <span className="manual-attendee-copy"><strong>{attendee.firstName} {attendee.lastName}</strong><small>{attendee.email || attendee.category.toLowerCase()}</small>{attendee.ticketId && <small>Ticket ID: {attendee.ticketId.toUpperCase()}</small>}</span>
                  {attendee.ticketToken && (activeCheckpointId ? attendee.ticketStatus === "USED" : attendee.ticketStatus === "ACTIVE")
                    ? <button data-toast-managed="true" disabled={checking} onClick={() => { if (attendee.ticketToken) void checkIn(attendee.ticketToken); }} type="button">{activeCheckpointId ? "Claim" : "Check in"}</button>
                    : <span className="manual-ticket-state">{attendee.ticketStatus.toLowerCase().replaceAll("_", " ")}</span>}
                </div>
              ))}
              {!currentSearch.attendees.length && <p className="no-manual-results">No matching guests found.</p>}
            </div>
          )}
          {query.length < 2 && <div className="manual-helper">Enter at least 2 characters, or the first 8 characters of a ticket ID. Results stay scoped to this event.</div>}
        </div>
      </div>
    </>
  ), locale);
}
