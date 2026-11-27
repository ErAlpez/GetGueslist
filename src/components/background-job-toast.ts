"use client";

import { showToast, updateToast } from "@/components/toast-provider";

export type BackgroundJobResponse = {
  id: string;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  progress: number;
  result: unknown;
  error: string | null;
};

export function beginBackgroundJobToast(message: string) {
  return showToast(message, "loading", { deduplicate: false });
}

export async function watchBackgroundJob(
  jobId: string,
  toastId: string,
  successMessage: (job: BackgroundJobResponse) => string,
) {
  let lastToastRefresh = Date.now();
  let consecutiveFailures = 0;

  while (true) {
    let response: Response;
    try {
      response = await fetch(`/api/background-jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
      consecutiveFailures = 0;
    } catch {
      consecutiveFailures += 1;
      if (consecutiveFailures >= 5) {
        updateToast(toastId, "Could not check the job status. Refresh this page and try again.", "error");
        throw new Error("Could not check the job status.");
      }
      await delay(2_000);
      continue;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      updateToast(toastId, "Could not read the job status.", "error");
      throw new Error("Could not read the job status.");
    }

    if (!response.ok) {
      const error = isRecord(body) && typeof body.error === "string"
        ? body.error
        : "Could not check the job status.";
      updateToast(toastId, error, "error");
      throw new Error(error);
    }
    if (!isBackgroundJobResponse(body)) {
      updateToast(toastId, "The job status response was invalid.", "error");
      throw new Error("The job status response was invalid.");
    }

    if (body.status === "COMPLETED") {
      updateToast(toastId, successMessage(body), "success");
      return body;
    }
    if (body.status === "FAILED") {
      updateToast(toastId, body.error || "The job could not be completed. Please try again.", "error");
      return body;
    }

    if (Date.now() - lastToastRefresh >= 45_000) {
      updateToast(toastId, `Working... ${Math.min(99, body.progress)}%`, "loading");
      lastToastRefresh = Date.now();
    }
    await delay(2_000);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isBackgroundJobResponse(value: unknown): value is BackgroundJobResponse {
  return isRecord(value)
    && typeof value.id === "string"
    && (value.status === "PENDING" || value.status === "PROCESSING" || value.status === "COMPLETED" || value.status === "FAILED")
    && typeof value.progress === "number"
    && "result" in value
    && (typeof value.error === "string" || value.error === null);
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
