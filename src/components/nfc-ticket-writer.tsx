"use client";

import { useState, useSyncExternalStore } from "react";
import { LoaderCircle, Nfc } from "lucide-react";

type NdefWriteRecord = {
  recordType: "url";
  data: string;
};

type NdefReader = {
  write: (
    message: { records: NdefWriteRecord[] },
    options?: { overwrite?: boolean; signal?: AbortSignal },
  ) => Promise<void>;
};

function subscribeToNfcSupport() {
  return () => {};
}

function getNfcSupport() {
  return "NDEFReader" in window;
}

function getServerNfcSupport() {
  return null;
}

export function NfcTicketWriter({ ticketUrl }: { ticketUrl: string }) {
  const supported = useSyncExternalStore(
    subscribeToNfcSupport,
    getNfcSupport,
    getServerNfcSupport,
  );
  const [writing, setWriting] = useState(false);
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

  async function writeTicket() {
    setWriting(true);
    setStatus(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);

    try {
      const Reader = (window as unknown as { NDEFReader?: new () => NdefReader }).NDEFReader;
      if (!Reader) throw new Error("NFC writing is not available in this browser.");

      const reader = new Reader();
      await reader.write(
        { records: [{ recordType: "url", data: ticketUrl }] },
        { overwrite: false, signal: controller.signal },
      );
      setStatus({ type: "success", message: "Ticket written to the NFC tag. Keep it with this ticket." });
    } catch (error) {
      const message = error instanceof DOMException && error.name === "AbortError"
        ? "No writable NFC tag was detected. Hold a blank NFC tag near the phone and try again."
        : error instanceof Error
          ? error.message
          : "The NFC tag could not be written. Try a blank, writable tag.";
      setStatus({ type: "error", message });
    } finally {
      window.clearTimeout(timeout);
      setWriting(false);
    }
  }

  return (
    <div className="public-ticket-nfc">
      {supported === true ? (
        <>
          <small>Hold a blank, writable NFC tag near the phone.</small>
          <button disabled={writing} onClick={() => void writeTicket()} type="button">
            {writing ? <LoaderCircle aria-hidden="true" className="spin" size={15} /> : <Nfc aria-hidden="true" size={15} />}
            {writing ? "Hold near phone…" : "Write to NFC tag"}
          </button>
        </>
      ) : (
        <small>
          {supported === null
            ? "Checking NFC support…"
            : "To write an NFC tag, open this ticket on a supported Android phone. The QR code works on this device."}
        </small>
      )}
      {status && <small className={`public-ticket-nfc-status ${status.type}`} role={status.type === "error" ? "alert" : "status"}>{status.message}</small>}
    </div>
  );
}
