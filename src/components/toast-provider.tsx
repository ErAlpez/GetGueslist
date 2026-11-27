"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle, X } from "lucide-react";
import { usePreferences } from "@/components/preferences-provider";

type ToastKind = "loading" | "success" | "error";
type ToastItem = { id: string; kind: ToastKind; message: string };
type ActionToastMessages = { loading: string; success: string; error: string };

let toastItems: ToastItem[] = [];
let nextToastId = 0;
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const emptyToasts: ToastItem[] = [];

function subscribeToToasts(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publishToasts() {
  for (const listener of listeners) listener();
}

function scheduleToastDismiss(id: string, delay: number) {
  const previous = timers.get(id);
  if (previous !== undefined) clearTimeout(previous);
  timers.set(id, setTimeout(() => dismissToast(id), delay));
}

export function showToast(
  message: string,
  kind: ToastKind = "loading",
  options: { deduplicate?: boolean } = {},
) {
  if (kind === "loading" && options.deduplicate !== false) {
    const existing = toastItems.find((toast) => toast.kind === kind && toast.message === message);
    if (existing) return existing.id;
  }

  const id = `toast-${++nextToastId}`;
  toastItems = [...toastItems, { id, kind, message }].slice(-4);
  publishToasts();
  scheduleToastDismiss(id, kind === "loading" ? 60_000 : 4_000);
  return id;
}

export function updateToast(id: string, message: string, kind: ToastKind) {
  toastItems = toastItems.some((toast) => toast.id === id)
    ? toastItems.map((toast) => toast.id === id ? { ...toast, message, kind } : toast)
    : [...toastItems, { id, message, kind }].slice(-4);
  publishToasts();
  scheduleToastDismiss(id, kind === "loading" ? 60_000 : 4_000);
}

export function dismissToast(id: string) {
  const timer = timers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(id);
  toastItems = toastItems.filter((toast) => toast.id !== id);
  publishToasts();
}

export function showPageErrorToast(message: string) {
  showToast(message, "error");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function resolveActionToastResult(state: unknown, messages: ActionToastMessages) {
  if (!isRecord(state)) return { kind: "success" as const, message: messages.success };

  if (state.error) {
    const errorMessage = typeof state.error === "string"
      ? state.error
      : isRecord(state.error) && typeof state.error.message === "string"
        ? state.error.message
        : "";
    return { kind: "error" as const, message: errorMessage || messages.error };
  }
  if (state.status === "error" || state.success === false) {
    return {
      kind: "error" as const,
      message: typeof state.message === "string" ? state.message : messages.error,
    };
  }
  if (typeof state.success === "string" && state.success) {
    return { kind: "success" as const, message: state.success };
  }
  if (state.success === true && typeof state.message === "string") {
    return { kind: "success" as const, message: state.message };
  }

  return { kind: "success" as const, message: messages.success };
}

export async function runWithToast<Result>(
  action: () => Promise<Result>,
  messages: Partial<ActionToastMessages> = {},
): Promise<Result> {
  const resolvedMessages: ActionToastMessages = {
    loading: messages.loading ?? "Working...",
    success: messages.success ?? "Completed.",
    error: messages.error ?? "Could not complete the action.",
  };
  const id = showToast(resolvedMessages.loading);

  try {
    const result = await action();
    const feedback = resolveActionToastResult(result, resolvedMessages);
    updateToast(id, feedback.message, feedback.kind);
    return result;
  } catch (error) {
    updateToast(
      id,
      error instanceof Error && error.message ? error.message : resolvedMessages.error,
      "error",
    );
    throw error;
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = usePreferences();
  const toasts = useSyncExternalStore(subscribeToToasts, () => toastItems, () => emptyToasts);

  return (
    <>
      {children}
      <ToastInteractionObserver />
      <div aria-label={t("Notifications")} className="toast-stack">
        {toasts.map((toast) => (
          <div className={`app-toast app-toast-${toast.kind}`} key={toast.id} role={toast.kind === "error" ? "alert" : "status"}>
            <span aria-hidden="true" className="app-toast-icon">
              {toast.kind === "loading" ? <LoaderCircle className="app-toast-spinner" size={17} /> : null}
              {toast.kind === "success" ? <CheckCircle2 size={17} /> : null}
              {toast.kind === "error" ? <AlertCircle size={17} /> : null}
            </span>
            <span className="app-toast-message">{t(toast.message)}</span>
            <button aria-label={t("Dismiss notification")} className="app-toast-dismiss" onClick={() => dismissToast(toast.id)} type="button">
              <X aria-hidden="true" size={15} />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

function isInteractionBusy(root: Element, control: HTMLElement) {
  const pendingText = /(?:\.{3}|…)\s*$/.test(control.textContent?.trim() ?? "");
  const pendingStatus = root.querySelector(".notification-loading, [aria-busy='true']");
  return control.matches(":disabled, [aria-busy='true']")
    || Boolean(control.querySelector(".spin, [data-loading='true'], [aria-label='Loading']"))
    || root.matches("[aria-busy='true']")
    || Boolean(pendingStatus)
    || pendingText;
}

export function shouldObserveGlobalToast(control: Pick<HTMLElement, "closest">) {
  return !control.closest("[data-toast-managed]");
}

function readInteractionResult(root: Element) {
  const errorText = root.querySelector("[role='alert'], .form-error, .feedback-error, .error-message")?.textContent?.trim();
  if (errorText) return { kind: "error" as const, message: errorText };

  const successText = root.querySelector(
    ".public-feedback-success, .feedback-success, .event-checkpoint-save-feedback[role='status'], .notification-empty, [data-action-success]",
  )?.textContent?.trim() ?? [...root.querySelectorAll("[role='status']")]
    .map((status) => status.textContent?.trim())
    .find((text) => text && !/\b(loading|searching|saving|sending|uploading|processing)\b/i.test(text));
  if (successText) return { kind: "success" as const, message: successText };
  return null;
}

function ToastInteractionObserver() {
  useEffect(() => {
    const activeRoots = new WeakSet<Element>();
    const observeInteraction = (root: Element, control: HTMLElement, immediate: boolean) => {
      if (activeRoots.has(root)) return;
      activeRoots.add(root);

      let toastId = immediate ? showToast("Working...") : null;
      let sawBusy = false;
      let settled = false;
      const initialResult = readInteractionResult(root);
      let startTimer: number | undefined;
      let timeout: number | undefined;

      const cleanup = () => {
        if (settled) return;
        settled = true;
        observer.disconnect();
        if (startTimer !== undefined) window.clearTimeout(startTimer);
        if (timeout !== undefined) window.clearTimeout(timeout);
        activeRoots.delete(root);
      };

      const finish = () => {
        if (!toastId) {
          cleanup();
          return;
        }
        const result = readInteractionResult(root);
        const toastIsLoading = toastItems.some((toast) => toast.id === toastId && toast.kind === "loading");
        if (toastIsLoading) updateToast(toastId, result?.message ?? "Completed.", result?.kind ?? "success");
        cleanup();
      };

      const check = () => {
        if (!root.isConnected) {
          finish();
          return;
        }

        const result = readInteractionResult(root);
        const resultChanged = result && (
          result.kind !== initialResult?.kind || result.message !== initialResult?.message
        );
        if (toastId && resultChanged) {
          const toastIsLoading = toastItems.some((toast) => toast.id === toastId && toast.kind === "loading");
          if (toastIsLoading) updateToast(toastId, result.message, result.kind);
          cleanup();
          return;
        }

        const busy = isInteractionBusy(root, control);
        if (busy) {
          sawBusy = true;
          if (startTimer !== undefined) {
            window.clearTimeout(startTimer);
            startTimer = undefined;
          }
          if (!toastId) toastId = showToast("Working...");
          return;
        }

        if (toastId && sawBusy) {
          finish();
          return;
        }
        if (!immediate && !toastId && !sawBusy) cleanup();
      };

      const observer = new MutationObserver(check);
      observer.observe(document.body, {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true,
      });

      if (immediate) {
        timeout = window.setTimeout(() => {
          if (toastId) updateToast(toastId, "Could not complete the action.", "error");
          cleanup();
        }, 60_000);
      } else {
        startTimer = window.setTimeout(cleanup, 1_500);
      }
    };

    const onSubmit = (event: SubmitEvent) => {
      if (!(event.target instanceof HTMLFormElement)) return;
      const form = event.target;
      const submitter = event.submitter instanceof HTMLElement
        ? event.submitter
        : form.querySelector<HTMLElement>("button[type='submit'], input[type='submit']");
      if (!submitter) return;
      if (!shouldObserveGlobalToast(submitter)) return;
      observeInteraction(form, submitter, true);
    };

    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest<HTMLElement>("button, [role='button']");
      if (!control || !shouldObserveGlobalToast(control) || control.matches("button:disabled, [role='button'][aria-disabled='true']")) return;
      const isFormSubmit = control instanceof HTMLButtonElement
        && control.type === "submit"
        && control.form !== null;
      if (isFormSubmit) return;
      const root = control.closest("form, [role='dialog'], section, .notification-menu, .phone-scanner-access-control")
        ?? control.parentElement;
      if (root) observeInteraction(root, control, false);
    };

    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("click", onClick, true);
    };
  }, []);

  return null;
}

export function useActionToastFeedback(
  pending: boolean,
  state: unknown,
  messages: Partial<ActionToastMessages> = {},
) {
  const pendingRef = useRef(false);
  const toastId = useRef<string | null>(null);
  const loading = messages.loading ?? "Working...";
  const success = messages.success ?? "Completed.";
  const error = messages.error ?? "Could not complete the action.";

  useEffect(() => {
    if (pending) {
      if (!pendingRef.current) toastId.current = showToast(loading);
      pendingRef.current = true;
      return;
    }

    if (!pendingRef.current || !toastId.current) return;
    if (isRecord(state) && state.unchanged === true) {
      dismissToast(toastId.current);
      pendingRef.current = false;
      toastId.current = null;
      return;
    }

    const result = resolveActionToastResult(state, { loading, success, error });
    updateToast(toastId.current, result.message, result.kind);
    pendingRef.current = false;
    toastId.current = null;
  }, [error, loading, pending, state, success]);
}
