"use client";

import { useEffect, useRef, useState } from "react";
import { Download, LoaderCircle, Square } from "lucide-react";
import { usePreferences } from "@/components/preferences-provider";
import { downloadResource } from "@/lib/api";
import { beginBackgroundJobToast, watchBackgroundJob } from "@/components/background-job-toast";
import { dismissToast, updateToast } from "@/components/toast-provider";

class DownloadError extends Error {}

export function DownloadButton({
  href,
  label,
  useFormFilters = false,
  backgroundJob = false,
  contentType = "text/csv",
  filename = "attendees-export.csv",
  className,
}: {
  href: string;
  label: string;
  useFormFilters?: boolean;
  backgroundJob?: boolean;
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
      if (backgroundJob && state === "loading") return;
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
    const toastId = backgroundJob ? beginBackgroundJobToast("Preparing attendee export...") : null;

    try {
      const url = new URL(href, window.location.origin);
      if (useFormFilters) {
        if (!button.form) throw new DownloadError(t("Download filters are unavailable."));
        for (const [name, value] of new FormData(button.form)) {
          if (typeof value !== "string") throw new DownloadError(t("Download filters are invalid."));
          url.searchParams.set(name, value);
        }
      }

      let response: Response;
      if (backgroundJob) {
        response = await downloadResource(url, { method: "POST", signal: controller.signal });
        if (!response.ok) {
          throw new DownloadError(await readResponseError(response, t("Export request failed.")));
        }
        const queued: unknown = await response.json();
        if (!isRecord(queued) || typeof queued.jobId !== "string") {
          throw new DownloadError(t("The export job could not be started."));
        }

        setStatus(t("Waiting for export..."));
        if (!toastId) throw new DownloadError(t("The export job could not be tracked."));
        const job = await watchBackgroundJob(queued.jobId, toastId, () => t("Export is ready. Downloading..."));
        if (job.status !== "COMPLETED") {
          throw new DownloadError(job.error || t("The export could not be completed."));
        }
        response = await downloadResource(
          `/api/background-jobs/${encodeURIComponent(queued.jobId)}/download`,
          { signal: controller.signal },
        );
      } else {
        response = await downloadResource(url, { signal: controller.signal });
      }

      if (!response.ok) {
        throw new DownloadError(await readResponseError(response, t("Download failed.")));
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
      if (toastId) updateToast(toastId, t("CSV export downloaded."), "success");
      resetTimerRef.current = setTimeout(() => {
        setState("idle");
        setStatus("");
        resetTimerRef.current = null;
      }, 2_500);
    } catch (caught) {
      if (controller.signal.aborted) {
        if (toastId) {
          dismissToast(toastId);
        }
        return;
      }
      setState("idle");
      setStatus("");
      const message = caught instanceof DownloadError ? caught.message : t("Could not download the file. Please try again.");
      if (toastId) updateToast(toastId, message, "error");
      setError(message);
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }

  return (
    <div className={`download-action-wrap${className ? ` ${className}` : ""}`}>
      <button
        aria-label={state === "loading" ? t(backgroundJob ? "Preparing export..." : "Cancel download") : t(label)}
        className={`download-action is-${state}`}
        data-toast-managed={backgroundJob ? "true" : undefined}
        disabled={backgroundJob && state === "loading"}
        onClick={(event) => void handleClick(event.currentTarget)}
        title={state === "loading" && !backgroundJob ? t("Cancel download") : undefined}
        type="button"
      >
        {state === "loading" ? (
          <span
            aria-hidden="true"
            className={`download-action-progress${progress === null ? " is-indeterminate" : ""}`}
            style={progress === null ? undefined : { background: `conic-gradient(var(--green, #277b68) ${progress}%, transparent ${progress}%)` }}
          >
            <span>{backgroundJob ? <LoaderCircle className="app-toast-spinner" size={15} /> : <Square fill="currentColor" size={12} />}</span>
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readResponseError(response: Response, fallback: string) {
  const responseType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (responseType.includes("application/json")) {
    const payload: unknown = await response.json();
    if (isRecord(payload) && typeof payload.error === "string") return payload.error;
  } else {
    const responseMessage = await response.text();
    if (responseMessage.trim()) return responseMessage.trim();
  }
  return `${fallback} (${response.status})`;
}
