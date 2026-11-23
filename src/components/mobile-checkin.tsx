"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Html5Qrcode } from "html5-qrcode";
import { Camera, Check, LoaderCircle, LogOut, Pause, ShieldCheck, X } from "lucide-react";
import { localizeNode } from "@/lib/localization";
import { queueOfflineCheckIn, readOfflineQueue, syncOfflineCheckIns } from "@/lib/offline-checkin";
import { endMobileCheckIn, pairMobileCheckIn, validateCheckIn } from "@/lib/api";
import { BrandMark } from "@/components/brand-mark";
import "./mobile-checkin.css";

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
  certificateEmailStatus?: "sent" | "failed" | "no_email" | "unavailable";
};

type CheckpointOption = {
  id: string;
  name: string;
  claimedCount: number;
  capacity: number | null;
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

function responseMessage(payload: CheckInResult) {
  if (payload.result === "claimed") {
    return `${payload.checkpointName ?? "Checkpoint"} claimed${payload.attendeeName ? ` for ${payload.attendeeName}` : "."}`;
  }
  if (payload.result === "checked_in") {
    const checkedIn = `Checked in${payload.attendeeName ? `: ${payload.attendeeName}` : "."}`;
    if (payload.certificateEmailStatus === "failed") return `${checkedIn} Certificate email failed; the guest can download it from their ticket page.`;
    if (payload.certificateEmailStatus === "no_email") return `${checkedIn} No email is saved; the guest can download the certificate from their ticket page.`;
    if (payload.certificateEmailStatus === "unavailable") return `${checkedIn} A certificate could not be generated for this name; please contact the organizer.`;
    if (payload.certificateEmailStatus === "sent") return `${checkedIn} Certificate emailed.`;
    return checkedIn;
  }
  if (payload.result === "already_checked_in") return `${payload.attendeeName ?? "This guest"} is already checked in.`;
  return payload.message ?? "This ticket could not be checked in.";
}

function MobileCheckinScanner({ eventId, checkpoints }: { eventId: string; checkpoints: CheckpointOption[] }) {
  const router = useRouter();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  const resumeTimerRef = useRef<number | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkpointId, setCheckpointId] = useState("");
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  const [queuedCount, setQueuedCount] = useState(() => typeof window === "undefined" ? 0 : readOfflineQueue().length);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const activeCheckpointId = checkpoints.some((checkpoint) => checkpoint.id === checkpointId) ? checkpointId : "";
  const cameraStartingRef = useRef(false);
  const mountedRef = useRef(false);

  const finishScan = useCallback((message: string, success: boolean, shouldResume: boolean) => {
    setChecking(false);
    setResult({ success, message });
    if (success && "vibrate" in navigator) navigator.vibrate(70);
    if (!shouldResume) return;

    resumeTimerRef.current = window.setTimeout(() => {
      resumeTimerRef.current = null;
      const scanner = scannerRef.current;
      if (scanner?.isScanning) {
        scanner.resume();
        processingRef.current = false;
        setResult(null);
      }
    }, success ? 900 : 1700);
  }, []);

  const handleScan = useCallback(async (decodedText: string) => {
    if (processingRef.current) return;
    processingRef.current = true;
    scannerRef.current?.pause(true);
    setError("");
    setChecking(true);

    try {
      const response = await validateCheckIn({
        eventId,
        token: extractToken(decodedText),
        ...(activeCheckpointId ? { checkpointId: activeCheckpointId } : {}),
      });
      const payload = await response.json() as CheckInResult;
      if (payload.result === "checked_in" || payload.result === "claimed") router.refresh();
      if (response.status === 401 || response.status === 403) {
        setBlocked(true);
        finishScan(payload.message ?? "This phone no longer has access to check in.", false, false);
        const scanner = scannerRef.current;
        if (scanner?.isScanning) {
          await scanner.stop();
          setCameraActive(false);
        }
        return;
      }

      finishScan(responseMessage(payload), response.ok && (payload.result === "checked_in" || payload.result === "claimed"), true);
    } catch {
      if (activeCheckpointId) {
        finishScan("Checkpoint claims require an online connection. No claim was recorded.", false, true);
      } else {
        const token = extractToken(decodedText);
        const deviceId = `mobile-${eventId}`;
        queueOfflineCheckIn({ eventId, token, deviceId, queuedAt: new Date().toISOString() });
        finishScan("You’re offline. This scan was queued and will sync automatically.", false, true);
      }
    }
  }, [activeCheckpointId, eventId, finishScan, router]);

  useEffect(() => {
    mountedRef.current = true;

    const stopWhenHidden = () => {
      const scanner = scannerRef.current;
      if (document.visibilityState !== "hidden" || !scanner?.isScanning) return;
      if (resumeTimerRef.current !== null) {
        window.clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
      processingRef.current = false;
      void scanner.stop().then(() => {
        setCameraActive(false);
      }).catch((stopError: unknown) => {
        console.error("Could not stop the phone scanner while hidden:", stopError);
      });
    };
    document.addEventListener("visibilitychange", stopWhenHidden);

    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", stopWhenHidden);
      if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
      const scanner = scannerRef.current;
      if (!scanner) return;
      if (scanner.isScanning) {
        void scanner.stop().then(() => scanner.clear()).catch((stopError: unknown) => {
          console.error("Could not stop the phone scanner cleanly:", stopError);
        });
      } else {
        scanner.clear();
      }
    };
  }, []);

  useEffect(() => {
    const deviceId = `mobile-${eventId}`;
    const sync = () => {
      void syncOfflineCheckIns(deviceId).then((synced) => {
        if (synced > 0) setQueuedCount(readOfflineQueue().length);
      });
    };
    window.addEventListener("online", sync);
    sync();
    return () => window.removeEventListener("online", sync);
  }, [eventId]);

  async function startCamera() {
    if (cameraStartingRef.current || cameraActive || blocked) return;

    cameraStartingRef.current = true;
    setCameraStarting(true);
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
    processingRef.current = false;
    setError("");
    try {
      let scanner = scannerRef.current;
      if (!scanner) {
        let scannerLibrary: typeof import("html5-qrcode");
        try {
          scannerLibrary = await import("html5-qrcode");
        } catch (loadError) {
          const detail = loadError instanceof Error ? ` ${loadError.message}` : "";
          if (mountedRef.current) {
            setError(`Could not load the phone scanner. Check your connection and try again.${detail}`);
          }
          return;
        }
        if (!mountedRef.current || document.visibilityState === "hidden") return;
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = scannerLibrary;
        scanner = new Html5Qrcode("mobile-checkin-reader", {
          verbose: false,
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        });
        scannerRef.current = scanner;
      }

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 3,
          qrbox: { width: 180, height: 180 },
          aspectRatio: 1,
          disableFlip: true,
          videoConstraints: {
            facingMode: "environment",
            width: { ideal: 960, max: 960 },
            height: { ideal: 540, max: 540 },
            frameRate: { ideal: 12, max: 15 },
          },
        },
        (decodedText) => void handleScan(decodedText),
        () => undefined,
      );
      if (!mountedRef.current || document.visibilityState === "hidden") {
        if (scanner.isScanning) await scanner.stop();
        return;
      }
      setCameraActive(true);
    } catch (cameraError) {
      const detail = cameraError instanceof Error ? ` ${cameraError.message}` : "";
      if (mountedRef.current) {
        setError(`Could not open the phone camera. Allow camera access and use a secure HTTPS connection.${detail}`);
      }
    } finally {
      cameraStartingRef.current = false;
      if (mountedRef.current) setCameraStarting(false);
    }
  }

  async function pauseCamera() {
    const scanner = scannerRef.current;
    if (!scanner?.isScanning) return;

    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
    processingRef.current = false;

    try {
      await scanner.stop();
      setCameraActive(false);
      setResult(null);
    } catch (cameraError) {
      const detail = cameraError instanceof Error ? ` ${cameraError.message}` : "";
      setError(`Could not pause the phone camera.${detail}`);
    }
  }

  return (
    <div className="mobile-checkin-scanner">
      {checkpoints.length > 0 && (
        <>
          <div aria-label="Check-in mode" className="mobile-checkin-mode-switch" role="group">
            <button
              aria-pressed={!activeCheckpointId}
              className={!activeCheckpointId ? "active" : ""}
              disabled={cameraActive || checking}
              onClick={() => { setCheckpointId(""); setResult(null); }}
              type="button"
            >
              Entrance check-in
            </button>
            <button
              aria-pressed={Boolean(activeCheckpointId)}
              className={activeCheckpointId ? "active" : ""}
              disabled={cameraActive || checking}
              onClick={() => { setCheckpointId(activeCheckpointId || checkpoints[0].id); setResult(null); }}
              type="button"
            >
              Checkpoint claim
            </button>
          </div>
          {activeCheckpointId && (
            <label className="mobile-checkpoint-select">
              Checkpoint to claim
              <select
                disabled={cameraActive || checking}
                onChange={(event) => { setCheckpointId(event.target.value); setResult(null); }}
                value={activeCheckpointId}
              >
            {checkpoints.map((checkpoint) => (
              <option key={checkpoint.id} value={checkpoint.id}>
                {checkpoint.name} · {checkpoint.claimedCount}{checkpoint.capacity === null ? "" : `/${checkpoint.capacity}`}
              </option>
            ))}
              </select>
            </label>
          )}
          {cameraActive && <p className="mobile-checkin-mode-hint">Pause the camera before changing scan mode or checkpoint.</p>}
        </>
      )}
      <div className="mobile-checkin-camera" id="mobile-checkin-reader" />
      {error && <p aria-live="polite" className="mobile-checkin-message mobile-checkin-error">{error}</p>}
      {result && (
        <p aria-live="polite" className={`mobile-checkin-message ${result.success ? "mobile-checkin-success" : "mobile-checkin-warning"}`}>
          {result.success ? <Check aria-hidden="true" size={18} /> : <X aria-hidden="true" size={18} />}
          {result.message}
        </p>
      )}
      {queuedCount > 0 && <p aria-live="polite" className="mobile-checkin-message mobile-checkin-warning">Offline queue: {queuedCount} scan{queuedCount === 1 ? "" : "s"} waiting to sync.</p>}
      {checking && <p className="mobile-checkin-progress"><LoaderCircle aria-hidden="true" className="spin" size={16} /> Checking ticket…</p>}
      {blocked ? (
        <p className="mobile-checkin-message mobile-checkin-error">Ask the event admin to pair this phone again.</p>
      ) : (
        <button className="mobile-checkin-primary" disabled={checking || cameraStarting} onClick={() => void (cameraActive ? pauseCamera() : startCamera())} type="button">
          {cameraStarting ? <LoaderCircle aria-hidden="true" className="spin" size={17} /> : cameraActive ? <Pause aria-hidden="true" size={17} /> : <Camera aria-hidden="true" size={17} />}
          {cameraStarting ? "Preparing camera…" : cameraActive ? "Pause camera" : "Start camera"}
        </button>
      )}
      <p className="mobile-checkin-hint">Use the rear camera and hold the ticket QR code inside the frame. Pause the camera between check-ins to save battery and reduce heat.</p>
    </div>
  );
}

export function MobileCheckinPairing() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    const pairingToken = new URLSearchParams(window.location.hash.slice(1)).get("pair");
    if (!pairingToken) return;

    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}`);
    void pairMobileCheckIn(pairingToken).then(async (response) => {
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "This pairing code could not be used.");
      router.refresh();
    }).catch((pairingError: unknown) => {
      setError(pairingError instanceof Error ? pairingError.message : "This pairing code could not be used.");
    });
  }, [router]);

  return localizeNode((
    <main className="mobile-checkin-page">
      <section className="mobile-checkin-card">
        <div className="mobile-checkin-brand"><BrandMark className="mobile-checkin-brand-mark" /> VenuGuestPass</div>
        <div className="mobile-checkin-symbol"><ShieldCheck aria-hidden="true" size={23} /></div>
        <h1>Phone check-in</h1>
        <p className="mobile-checkin-intro">This phone can scan tickets for one event without opening the workspace dashboard.</p>
        <p className="mobile-checkin-hint">Open the one-time pairing QR provided by your event admin on this phone.</p>
        {error && <p aria-live="polite" className="mobile-checkin-message mobile-checkin-error">{error}</p>}
      </section>
    </main>
  ), "en");
}

export function MobileCheckinSession({
  checkpoints,
  deviceName,
  eventId,
  eventName,
  expiresAt,
}: {
  checkpoints: CheckpointOption[];
  deviceName: string;
  eventId: string;
  eventName: string;
  expiresAt: string;
}) {
  const router = useRouter();
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState("");

  async function endAccess() {
    setEnding(true);
    setError("");
    try {
      const response = await endMobileCheckIn();
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Phone access could not be ended.");
      router.refresh();
    } catch (endError) {
      setError(endError instanceof Error ? endError.message : "Phone access could not be ended.");
    } finally {
      setEnding(false);
    }
  }

  return localizeNode((
    <main className="mobile-checkin-page">
      <section className="mobile-checkin-card">
        <div className="mobile-checkin-brand"><BrandMark className="mobile-checkin-brand-mark" /> VenuGuestPass</div>
        <div className="mobile-checkin-session-heading">
          <div>
            <p className="mobile-checkin-label">SCANNER-ONLY ACCESS</p>
            <h1>{eventName}</h1>
            <p>{deviceName}</p>
          </div>
          <button aria-label="End phone access" className="mobile-checkin-end" disabled={ending} onClick={() => void endAccess()} type="button">
            {ending ? <LoaderCircle aria-hidden="true" className="spin" size={16} /> : <LogOut aria-hidden="true" size={16} />}
          </button>
        </div>
        <p className="mobile-checkin-expiry"><time dateTime={expiresAt}>Temporary access · valid for up to 12 hours</time></p>
        {error && <p aria-live="polite" className="mobile-checkin-message mobile-checkin-error">{error}</p>}
        <MobileCheckinScanner checkpoints={checkpoints} eventId={eventId} />
      </section>
    </main>
  ), "en");
}
