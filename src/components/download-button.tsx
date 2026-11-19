"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Square } from "lucide-react";
import { usePreferences } from "@/components/preferences-provider";
import { downloadResource } from "@/lib/api";

class DownloadError extends Error {}

export function DownloadButton({
  href,
  label,
  useFormFilters = false,
  contentType = "text/csv",
  filename = "attendees-export.csv",
  className,
}: {
  href: string;
  label: string;
  useFormFilters?: boolean;
  contentType?: string;
  filename?: string;
  className?: string;
}) {
  const { t } = usePreferences();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    controllerRef.current?.abort();
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, []);

  async function handleClick(button: HTMLButtonElement) {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
      setState("idle");
      setProgress(null);
      setStatus(t("Download canceled."));
      return;
    }

    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    const controller = new AbortController();
    controllerRef.current = controller;
    setState("loading");
    setProgress(null);
    setStatus(t("Preparing download..."));
    setError("");

    try {
      const url = new URL(href, window.location.origin);
      if (useFormFilters) {
        if (!button.form) throw new DownloadError(t("Download filters are unavailable."));
        for (const [name, value] of new FormData(button.form)) {
          if (typeof value !== "string") throw new DownloadError(t("Download filters are invalid."));
          url.searchParams.set(name, value);
        }
      }

      const response = await downloadResource(url, { signal: controller.signal });
      if (!response.ok) {
        let message = `${t("Download failed.")} (${response.status})`;
        const responseType = response.headers.get("content-type")?.toLowerCase() ?? "";
        if (responseType.includes("application/json")) {
          const payload: unknown = await response.json();
          if (typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string") {
            message = t(payload.error);
          }
        } else {
          const responseMessage = await response.text();
          if (responseMessage.trim()) message = t(responseMessage.trim());
        }
        throw new DownloadError(message);
      }
      const responseType = response.headers.get("content-type")?.toLowerCase() ?? "";
      if (!responseType.startsWith(contentType.toLowerCase())) {
        const fileType = contentType.split("/").at(-1)?.toUpperCase() ?? "file";
        throw new DownloadError(t(`The server did not return a ${fileType} file.`));
      }

      const contentLength = Number(response.headers.get("content-length"));
      const encoding = response.headers.get("content-encoding");
      const total = Number.isSafeInteger(contentLength) && contentLength > 0 && (!encoding || encoding === "identity")
        ? contentLength
        : null;
      const chunks: BlobPart[] = [];
      if (response.body) {
        const reader = response.body.getReader();
        let received = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (controller.signal.aborted) return;
          if (done) break;
          chunks.push(Uint8Array.from(value));
          received += value.byteLength;
          if (total) setProgress(Math.min(99, Math.floor((received / total) * 100)));
        }
      } else {
        chunks.push(await response.blob());
      }

      if (controller.signal.aborted) return;
      const objectUrl = URL.createObjectURL(new Blob(chunks, { type: responseType }));
      try {
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = filename;
        document.body.append(link);
        try {
          link.click();
        } finally {
          link.remove();
        }
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }

      setState("done");
      setStatus(t("Download started."));
      resetTimerRef.current = setTimeout(() => {
        setState("idle");
        setStatus("");
        resetTimerRef.current = null;
      }, 2_500);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setState("idle");
      setStatus("");
      setError(caught instanceof DownloadError ? caught.message : t("Could not download the file. Please try again."));
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  return (
    <div className={`download-action-wrap${className ? ` ${className}` : ""}`}>
      <button
        aria-label={state === "loading" ? t("Cancel download") : t(label)}
        className={`download-action is-${state}`}
        onClick={(event) => void handleClick(event.currentTarget)}
        title={state === "loading" ? t("Cancel download") : undefined}
        type="button"
      >
        {state === "loading" ? (
          <span
            aria-hidden="true"
            className={`download-action-progress${progress === null ? " is-indeterminate" : ""}`}
            style={progress === null ? undefined : { background: `conic-gradient(var(--green, #277b68) ${progress}%, transparent ${progress}%)` }}
          >
            <span><Square fill="currentColor" size={12} /></span>
          </span>
        ) : state === "done" ? (
          <span>{t("Done!")}</span>
        ) : (
          <>
            <span aria-hidden="true" className="download-action-icon"><Download size={16} /></span>
            <span>{t(label)}</span>
          </>
        )}
      </button>
      <span className="download-action-status" role="status">
        {state === "loading" && progress !== null ? `${t("Downloading...")} ${progress}%` : status}
      </span>
      {error && <span className="download-action-error" role="alert">{error}</span>}
    </div>
  );
}
