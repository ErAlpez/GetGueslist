"use client";

import { dismissToast, showToast, updateToast } from "@/components/toast-provider";

export type SettingsMutationState = {
  error?: string;
  success?: string;
  unchanged?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function submitSettingsMutation(
  formData: FormData,
  loadingMessage: string,
  fallbackSuccess: string,
): Promise<SettingsMutationState> {
  const toastId = showToast(loadingMessage, "loading", { deduplicate: false });

  try {
    const response = await fetch("/api/settings", { method: "POST", body: formData });
    const result: unknown = await response.json();
    const error = isRecord(result) && typeof result.error === "string" ? result.error : undefined;

    if (!response.ok || error) {
      const message = error ?? "Could not complete the action.";
      updateToast(toastId, message, "error");
      return { error: message };
    }

    if (isRecord(result) && result.unchanged === true) {
      dismissToast(toastId);
      return { unchanged: true };
    }

    const success = isRecord(result) && typeof result.success === "string"
      ? result.success
      : fallbackSuccess;
    updateToast(toastId, success, "success");
    return { success };
  } catch {
    const message = "Could not complete the action. Please try again.";
    updateToast(toastId, message, "error");
    return { error: message };
  }
}
