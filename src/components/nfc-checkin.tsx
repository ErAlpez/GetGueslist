"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { LoaderCircle, Nfc } from "lucide-react";

type NfcRecordReader = {
  scan: () => Promise<void>;
};

const nfcUriPrefixes = [
  "",
  "http://www.",
  "https://www.",
  "http://",
  "https://",
  "tel:",
  "mailto:",
  "ftp://anonymous:anonymous@",
  "ftp://ftp.",
  "ftps://",
  "sftp://",
  "smb://",
  "nfs://",
  "ftp://",
  "dav://",
  "news:",
  "telnet://",
  "imap:",
  "rtsp://",
  "urn:",
  "pop:",
  "sip:",
  "sips:",
  "tftp:",
  "btspp://",
  "btl2cap://",
  "btgoep://",
  "tcpobex://",
  "irdaobex://",
  "file://",
  "urn:epc:id:",
  "urn:epc:tag:",
  "urn:epc:pat:",
  "urn:epc:raw:",
  "urn:epc:",
  "urn:nfc:",
];

function decodeNfcRecord(record: { recordType: string; data?: DataView }) {
  if (!record.data) return "";
  const bytes = new Uint8Array(
    record.data.buffer,
    record.data.byteOffset,
    record.data.byteLength,
  );

  if (record.recordType === "url") {
    const prefix = nfcUriPrefixes[bytes[0]];
    if (prefix === undefined) return "";
    return prefix + new TextDecoder().decode(bytes.subarray(1));
  }

  if (record.recordType === "text") {
    if (!bytes.length) return "";
    const status = bytes[0];
    const languageLength = status & 0x3f;
    if (bytes.length < languageLength + 1) return "";
    const encoding = status & 0x80 ? "utf-16" : "utf-8";
    return new TextDecoder(encoding).decode(bytes.subarray(languageLength + 1));
  }

  return "";
}

function isVenuGuestPassTicket(value: string) {
  let token = value.trim();
  try {
    const url = new URL(token);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 2 || segments[0] !== "t") return false;
    token = decodeURIComponent(segments[1]);
  } catch {
    // Raw ticket tokens are valid keyboard-reader output too.
  }

  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\.[a-z0-9_-]{43}$/i.test(token);
}

function subscribeToNfcSupport() {
  return () => {};
}

function getNfcSupport() {
  return "NDEFReader" in window;
}

function getServerNfcSupport() {
  return null;
}

export function NfcCheckIn({ onToken }: { onToken: (token: string) => void }) {
  const supported = useSyncExternalStore(
    subscribeToNfcSupport,
    getNfcSupport,
    getServerNfcSupport,
  );
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState("");
  const [keyboardReaderOpen, setKeyboardReaderOpen] = useState(false);
  const keyboardReaderInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let buffer = "";
    let firstKeyAt = 0;
    let lastKeyAt = 0;

    function resetBuffer() {
      buffer = "";
      firstKeyAt = 0;
      lastKeyAt = 0;
    }

    function detectKeyboardReader(event: KeyboardEvent) {
      const target = event.target;
      const isManualGuestSearch = target instanceof HTMLInputElement &&
        target.getAttribute("aria-label") === "Ticket ID, name or email";
      if (
        target === keyboardReaderInput.current ||
        (target instanceof HTMLInputElement && !isManualGuestSearch) ||
        (target instanceof HTMLElement && (target.isContentEditable || target.closest("textarea, select, [contenteditable='true']")))
      ) {
        resetBuffer();
        return;
      }

      const now = performance.now();
      if (event.key === "Enter") {
        const scan = buffer.trim();
        const scanDuration = firstKeyAt ? now - firstKeyAt : Number.POSITIVE_INFINITY;
        resetBuffer();
        if (scanDuration <= 5000 && isVenuGuestPassTicket(scan)) {
          event.preventDefault();
          onToken(scan);
          setMessage("NFC reader detected a ticket. Check-in is being validated.");
        }
        return;
      }

      if (["Shift", "CapsLock"].includes(event.key)) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1 || event.isComposing) {
        resetBuffer();
        return;
      }

      if (lastKeyAt && now - lastKeyAt > 250) resetBuffer();
      if (!buffer) firstKeyAt = now;
      buffer += event.key;
      lastKeyAt = now;
      if (buffer.length > 512) resetBuffer();
    }

    window.addEventListener("keydown", detectKeyboardReader);
    return () => window.removeEventListener("keydown", detectKeyboardReader);
  }, [onToken]);

  async function start() {
    setMessage("");
    try {
      const NDEFReader = (window as unknown as { NDEFReader: new () => NfcRecordReader & EventTarget }).NDEFReader;
      const reader = new NDEFReader();
      reader.addEventListener("reading", ((event: Event) => {
        const reading = event as Event & { message: { records: Array<{ recordType: string; data?: DataView }> } };
        for (const record of reading.message.records) {
          if (record.recordType !== "text" && record.recordType !== "url") continue;
          const text = decodeNfcRecord(record);
          if (!text) continue;
          try {
            const url = new URL(text);
            const segments = url.pathname.split("/").filter(Boolean);
            if (segments.length === 2 && segments[0] === "t") {
              onToken(segments[1]);
              setMessage("NFC ticket detected.");
              return;
            }
          } catch {
            if (text.trim()) onToken(text.trim());
          }
        }
        setMessage("The NFC tag did not contain a VenuGuestPass ticket.");
      }) as EventListener);
      await reader.scan();
      setActive(true);
      setMessage("Hold a supported NFC ticket near this device.");
    } catch (error) {
      setActive(false);
      setMessage(error instanceof Error ? error.message : "NFC check-in could not start.");
    }
  }

  function submitKeyboardReaderScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = keyboardReaderInput.current?.value.trim();
    if (!value) return;

    onToken(value);
    event.currentTarget.reset();
    setKeyboardReaderOpen(false);
    setMessage("NFC ticket sent to check-in. Review the result in the scanner panel.");
  }

  const triggerLabel = supported === false
    ? keyboardReaderOpen ? "Reader input" : "NFC auto-scan"
    : active ? "Listening…" : "NFC check-in";

  return (
    <div className={`language-control nfc-checkin-control${keyboardReaderOpen ? " is-open" : ""}`}>
      <button
        aria-expanded={supported === false ? keyboardReaderOpen : undefined}
        aria-label={supported === false ? keyboardReaderOpen ? "NFC reader input ready" : "NFC auto-scan enabled; open manual reader input" : active ? "NFC check-in listening" : "Start NFC check-in"}
        className="language-trigger"
        disabled={supported === null || (supported === true && active)}
        onClick={() => {
          if (supported === false) {
            setMessage("");
            setKeyboardReaderOpen((open) => !open);
            return;
          }
          void start();
        }}
        title={supported === false ? "Keyboard-mode NFC scans are detected automatically. Click for manual reader input." : undefined}
        type="button"
      >
        <span aria-hidden="true" className="language-trigger-icon"><Nfc size={15} /></span>
        <span className="language-trigger-name">{triggerLabel}</span>
        {supported === null && <LoaderCircle aria-hidden="true" className="spin" size={14} />}
      </button>
      {keyboardReaderOpen && (
        <div className="language-popover nfc-checkin-status nfc-keyboard-reader">
          <p>Connect a USB or Bluetooth NFC reader in keyboard mode. It must type the ticket URL or token, not just the tag UID.</p>
          <form onSubmit={submitKeyboardReaderScan}>
            <input
              aria-label="NFC ticket URL or token"
              autoComplete="off"
              autoFocus
              placeholder="Scan NFC ticket"
              ref={keyboardReaderInput}
              type="text"
            />
            <button type="submit">Check in</button>
          </form>
        </div>
      )}
      {!keyboardReaderOpen && message && <div className="language-popover nfc-checkin-status" role="status">{message}</div>}
    </div>
  );
}
