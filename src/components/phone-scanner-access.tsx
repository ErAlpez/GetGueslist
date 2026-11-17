"use client";

import { useCallback, useEffect, useState } from "react";
import { QrCode, RefreshCw, ShieldCheck, Smartphone, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { usePreferences } from "@/components/preferences-provider";
import { localizeNode } from "@/lib/localization";
import "./phone-scanner-access.css";

type ScannerAccess = {
  id: string;
  deviceName: string;
  pairedAt: string | null;
  pairingExpiresAt: string;
  sessionExpiresAt: string | null;
  lastSeenAt: string | null;
};

type PairingCode = {
  id: string;
  deviceName: string;
  pairingToken: string;
  pairingExpiresAt: string;
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Phone scanner access could not be updated.";
}

async function readResponseJson<T>(response: Response, label: string): Promise<T> {
  const body = await response.text();
  if (!body.trim()) {
    throw new Error(`${label} returned an empty response (HTTP ${response.status}). Refresh the page and try again.`);
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`${label} returned an invalid response (HTTP ${response.status}). Refresh the page and try again.`);
  }
}

export function PhoneScannerAccess({ eventId }: { eventId: string }) {
  const { locale } = usePreferences();
  const [deviceName, setDeviceName] = useState("Front gate phone");
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [pairingUrl, setPairingUrl] = useState("");
  const [accesses, setAccesses] = useState<ScannerAccess[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyAccessId, setBusyAccessId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const fetchAccesses = useCallback(async () => {
    const response = await fetch(`/api/check-in/pairing?eventId=${encodeURIComponent(eventId)}`, {
      cache: "no-store",
    });
    const payload = await readResponseJson<{ accesses?: ScannerAccess[]; error?: string }>(
      response,
      "Phone scanner access",
    );
    if (!response.ok || !payload.accesses) {
      throw new Error(payload.error ?? "Phone scanner access could not be loaded.");
    }
    return payload.accesses;
  }, [eventId]);

  useEffect(() => {
    let active = true;
    void fetchAccesses().then((items) => {
      if (active) setAccesses(items);
    }).catch((loadError: unknown) => {
      if (active) setError(getErrorMessage(loadError));
    });
    return () => {
      active = false;
    };
  }, [fetchAccesses]);

  useEffect(() => {
    if (!pairing) return;

    const timer = window.setInterval(() => {
      void fetchAccesses().then((items) => {
        setAccesses(items);
        if (items.some((item) => item.id === pairing.id && item.pairedAt)) {
          setPairing(null);
          setPairingUrl("");
          setNotice(`${pairing.deviceName} connected.`);
        } else if (Date.now() >= new Date(pairing.pairingExpiresAt).getTime()) {
          setPairing(null);
          setPairingUrl("");
          setError("The pairing code expired. Create a new one.");
        }
      }).catch((loadError: unknown) => setError(getErrorMessage(loadError)));
    }, 2500);

    return () => window.clearInterval(timer);
  }, [pairing, fetchAccesses]);

  async function createPairing() {
    setBusy(true);
    setError("");
    setNotice("");
    setPairing(null);
    setPairingUrl("");

    try {
      const response = await fetch("/api/check-in/pairing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, deviceName }),
      });
      const payload = await readResponseJson<PairingCode & { error?: string }>(response, "Pairing request");
      if (!response.ok) throw new Error(payload.error ?? "A pairing code could not be created.");

      setPairing(payload);
      setPairingUrl(`${window.location.origin}/check-in/mobile#pair=${encodeURIComponent(payload.pairingToken)}`);
      setAccesses(await fetchAccesses());
    } catch (createError) {
      setError(getErrorMessage(createError));
    } finally {
      setBusy(false);
    }
  }

  async function revokeAccess(accessId: string) {
    setBusyAccessId(accessId);
    setError("");
    setNotice("");

    try {
      const response = await fetch("/api/check-in/pairing", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessId }),
      });
      const payload = await readResponseJson<{ error?: string }>(response, "Revocation request");
      if (!response.ok) throw new Error(payload.error ?? "Phone scanner access could not be revoked.");
      setNotice("Phone scanner access was revoked.");
      setAccesses(await fetchAccesses());
    } catch (revokeError) {
      setError(getErrorMessage(revokeError));
    } finally {
      setBusyAccessId(null);
    }
  }

  return localizeNode((
    <section aria-labelledby="phone-scanner-access-heading" className="phone-scanner-access app-panel">
      <div className="phone-scanner-access-heading">
        <div>
          <div className="phone-scanner-access-title-row">
            <h2 id="phone-scanner-access-heading">Pair a check-in phone</h2>
            <Smartphone aria-hidden="true" size={16} />
          </div>
          <p>Give a phone access to scan tickets for this event without signing in to the workspace dashboard.</p>
          <div className="phone-scanner-access-kicker"><ShieldCheck aria-hidden="true" size={13} /> EVENT-SCOPED ACCESS</div>
        </div>
      </div>

      <div className="phone-scanner-access-create">
        <label>
          Scanner name
          <input maxLength={60} onChange={(event) => setDeviceName(event.target.value)} value={deviceName} />
        </label>
        <button className="button button-dark app-primary-button" disabled={busy || !deviceName.trim()} onClick={createPairing} type="button">
          {busy ? <RefreshCw aria-hidden="true" className="spin" size={14} /> : <QrCode aria-hidden="true" size={14} />}
          Create pairing QR
        </button>
      </div>

      <p className="phone-scanner-access-note">
        The QR works once and expires in 5 minutes. Phone access expires after 12 hours and can be revoked here.
        Camera permission is granted on the phone.
      </p>

      {pairing && pairingUrl && (
        <div className="phone-scanner-pairing">
          <QRCodeSVG aria-label="One-time phone scanner pairing QR code" size={144} value={pairingUrl} />
          <div>
            <strong>Scan this QR with the phone</strong>
            <p>It opens a scanner-only page for {pairing.deviceName}. Keep this QR private until it is paired.</p>
            <time dateTime={pairing.pairingExpiresAt}>
              Expires at {new Date(pairing.pairingExpiresAt).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}
            </time>
          </div>
        </div>
      )}

      {error && <p aria-live="polite" className="form-message form-error">{error}</p>}
      {notice && <p aria-live="polite" className="phone-scanner-access-notice">{notice}</p>}

      <div className="phone-scanner-access-list-heading">
        <strong>Phone access for this event</strong>
        <button aria-label="Refresh phone scanner access" onClick={() => {
          setError("");
          void fetchAccesses().then(setAccesses).catch((loadError: unknown) => setError(getErrorMessage(loadError)));
        }} type="button">
          <RefreshCw aria-hidden="true" size={13} />
          Refresh
        </button>
      </div>
      {accesses.length ? (
        <ul className="phone-scanner-access-list">
          {accesses.map((access) => (
            <li key={access.id}>
              <span>
                <strong>{access.deviceName}</strong>
                <small>
                  {access.pairedAt
                    ? `Connected · expires ${new Date(access.sessionExpiresAt ?? access.pairingExpiresAt).toLocaleString(locale)}`
                    : `Pairing code expires ${new Date(access.pairingExpiresAt).toLocaleTimeString(locale)}`}
                </small>
              </span>
              <button
                aria-label={`${access.pairedAt ? "Revoke" : "Cancel"} ${access.deviceName}`}
                disabled={busyAccessId === access.id}
                onClick={() => void revokeAccess(access.id)}
                type="button"
              >
                <X aria-hidden="true" size={14} />
                {access.pairedAt ? "Revoke" : "Cancel"}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="phone-scanner-access-empty">No phone scanners are paired with this event.</p>
      )}
    </section>
  ), locale);
}
