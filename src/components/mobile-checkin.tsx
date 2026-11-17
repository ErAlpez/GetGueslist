"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Camera, Check, LoaderCircle, LogOut, Pause, ShieldCheck, X } from "lucide-react";
import { localizeNode } from "@/lib/localization";
import "./mobile-checkin.css";

type CheckInResult = {
  result: "checked_in" | "already_checked_in" | "invalid_ticket" | "ticket_unavailable" | "expired" | "invalid_request" | "unauthorized" | "forbidden";
  message?: string;
  attendeeName?: string;
  eventName?: string;
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
  if (payload.result === "checked_in") return `Checked in${payload.attendeeName ? `: ${payload.attendeeName}` : "."}`;
  if (payload.result === "already_checked_in") return `${payload.attendeeName ?? "This guest"} is already checked in.`;
  return payload.message ?? "This ticket could not be checked in.";
}

function MobileCheckinScanner({ eventId }: { eventId: string }) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  const resumeTimerRef = useRef<number | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [checking, setChecking] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

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
      const response = await fetch("/api/check-in/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, token: extractToken(decodedText) }),
      });
      const payload = await response.json() as CheckInResult;
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

      finishScan(responseMessage(payload), response.ok && payload.result === "checked_in", true);
    } catch {
      finishScan("Could not reach the server. Check your connection and scan again.", false, true);
    }
  }, [eventId, finishScan]);

  useEffect(() => {
    const scanner = new Html5Qrcode("mobile-checkin-reader", {
      verbose: false,
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
    });
    scannerRef.current = scanner;

    const stopWhenHidden = () => {
      if (document.visibilityState !== "hidden" || !scanner.isScanning) return;
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
      document.removeEventListener("visibilitychange", stopWhenHidden);
      if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
      if (scanner.isScanning) {
        void scanner.stop().then(() => scanner.clear()).catch((stopError: unknown) => {
          console.error("Could not stop the phone scanner cleanly:", stopError);
        });
      } else {
        scanner.clear();
      }
    };
  }, []);

  async function startCamera() {
    const scanner = scannerRef.current;
    if (!scanner || cameraActive || blocked) return;

    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
    processingRef.current = false;
    setError("");
    try {
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
      if (document.visibilityState === "hidden") {
        if (scanner.isScanning) await scanner.stop();
        return;
      }
      setCameraActive(true);
    } catch (cameraError) {
      const detail = cameraError instanceof Error ? ` ${cameraError.message}` : "";
      setError(`Could not open the phone camera. Allow camera access and use a secure HTTPS connection.${detail}`);
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
      <div className="mobile-checkin-camera" id="mobile-checkin-reader" />
      {error && <p aria-live="polite" className="mobile-checkin-message mobile-checkin-error">{error}</p>}
      {result && (
        <p aria-live="polite" className={`mobile-checkin-message ${result.success ? "mobile-checkin-success" : "mobile-checkin-warning"}`}>
          {result.success ? <Check aria-hidden="true" size={18} /> : <X aria-hidden="true" size={18} />}
          {result.message}
        </p>
      )}
      {checking && <p className="mobile-checkin-progress"><LoaderCircle aria-hidden="true" className="spin" size={16} /> Checking ticket…</p>}
      {blocked ? (
        <p className="mobile-checkin-message mobile-checkin-error">Ask the event admin to pair this phone again.</p>
      ) : (
        <button className="mobile-checkin-primary" disabled={checking} onClick={() => void (cameraActive ? pauseCamera() : startCamera())} type="button">
          {cameraActive ? <Pause aria-hidden="true" size={17} /> : <Camera aria-hidden="true" size={17} />}
          {cameraActive ? "Pause camera" : "Start camera"}
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
    void fetch("/api/check-in/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pairingToken }),
    }).then(async (response) => {
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
        <div className="mobile-checkin-brand"><span>G</span> GUESTLIST</div>
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
  deviceName,
  eventId,
  eventName,
  expiresAt,
}: {
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
      const response = await fetch("/api/check-in/mobile-session", { method: "DELETE" });
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
        <div className="mobile-checkin-brand"><span>G</span> GUESTLIST</div>
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
        <MobileCheckinScanner eventId={eventId} />
      </section>
    </main>
  ), "en");
}
