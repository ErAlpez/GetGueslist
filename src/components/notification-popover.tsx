"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Check, Inbox, LoaderCircle, RefreshCw, UserRoundPlus, X } from "lucide-react";
import { usePreferences } from "@/components/preferences-provider";
import { showToast, updateToast } from "@/components/toast-provider";
import { getNotifications, markNotificationsSeen } from "@/lib/api";
import "./notification-popover.css";

type NotificationKind = "registration" | "check_in";

type GuestNotification = {
  id: string;
  kind: NotificationKind;
  attendeeName: string;
  eventId: string;
  eventName: string;
  createdAt: string;
  seenAt: string | null;
};

function isGuestNotification(value: unknown): value is GuestNotification {
  if (typeof value !== "object" || value === null) return false;
  if (
    !("id" in value) ||
    !("kind" in value) ||
    !("attendeeName" in value) ||
    !("eventId" in value) ||
    !("eventName" in value) ||
    !("createdAt" in value) ||
    !("seenAt" in value)
  ) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    (value.kind === "registration" || value.kind === "check_in") &&
    typeof value.attendeeName === "string" &&
    typeof value.eventId === "string" &&
    typeof value.eventName === "string" &&
    typeof value.createdAt === "string" &&
    !Number.isNaN(Date.parse(value.createdAt)) &&
    (value.seenAt === null || (typeof value.seenAt === "string" && !Number.isNaN(Date.parse(value.seenAt))))
  );
}

function isNotificationResponse(value: unknown): value is { notifications: GuestNotification[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    "notifications" in value &&
    Array.isArray(value.notifications) &&
    value.notifications.every(isGuestNotification)
  );
}

function isSeenResponse(value: unknown): value is { seen: { id: string; seenAt: string }[] } {
  return (
    typeof value === "object" && value !== null && "seen" in value &&
    Array.isArray(value.seen) && value.seen.every((entry: unknown) =>
      typeof entry === "object" && entry !== null && "id" in entry && typeof entry.id === "string" &&
      "seenAt" in entry && typeof entry.seenAt === "string" && !Number.isNaN(Date.parse(entry.seenAt)),
    )
  );
}

export function NotificationPopover() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<GuestNotification[]>([]);
  const [clock, setClock] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [notificationPulse, setNotificationPulse] = useState(0);
  const [streamConnected, setStreamConnected] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const notificationsRef = useRef<GuestNotification[]>([]);
  const notificationsInitializedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const markingRef = useRef(new Set<string>());
  const mountedRef = useRef(false);
  const { locale, t } = usePreferences();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const audioContext = audioContextRef.current;
      if (audioContext && audioContext.state !== "closed") {
        void audioContext.close().catch((audioError: unknown) => {
          console.error("Could not close the notification audio context:", audioError);
        });
      }
    };
  }, []);

  useEffect(() => {
    function unlockNotificationSound() {
      const AudioContextConstructor = window.AudioContext;
      if (!AudioContextConstructor) return;

      const audioContext = audioContextRef.current ?? new AudioContextConstructor();
      audioContextRef.current = audioContext;
      if (audioContext.state === "suspended") {
        void audioContext.resume().catch((audioError: unknown) => {
          console.error("Could not enable dashboard notification sound:", audioError);
        });
      }
    }

    document.addEventListener("pointerdown", unlockNotificationSound);
    document.addEventListener("keydown", unlockNotificationSound);
    return () => {
      document.removeEventListener("pointerdown", unlockNotificationSound);
      document.removeEventListener("keydown", unlockNotificationSound);
    };
  }, []);

  function playNotificationSound() {
    const audioContext = audioContextRef.current;
    if (!audioContext || audioContext.state !== "running") return;

    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(784, now);
    oscillator.frequency.setValueAtTime(988, now + 0.1);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.06, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.25);
  }

  useEffect(() => {
    let active = true;
    let inFlight = false;

    async function loadNotifications() {
      if (inFlight) return;
      inFlight = true;

      try {
        const response = await getNotifications();
        if (!response.ok) throw new Error(t("Could not load notifications."));
        const payload: unknown = await response.json();
        if (!isNotificationResponse(payload)) throw new Error(t("Could not load notifications."));

        if (!active) return;
        const previous = new Map(notificationsRef.current.map((notification) => [notification.id, notification.seenAt]));
        const hasNewNotification = notificationsInitializedRef.current && payload.notifications.some(
          (notification) => !previous.has(notification.id),
        );
        const updated = payload.notifications.map((notification) => ({
          ...notification,
          seenAt: notification.seenAt ?? previous.get(notification.id) ?? null,
        }));
        notificationsRef.current = updated;
        notificationsInitializedRef.current = true;
        setNotifications(updated);
        setClock(Date.now());
        setError("");
        if (hasNewNotification) {
          setNotificationPulse((current) => current + 1);
          playNotificationSound();
        }
      } catch {
        if (active) setError(t("Could not load notifications."));
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    }

    void loadNotifications();
    const intervalId = streamConnected
      ? undefined
      : window.setInterval(() => {
          void loadNotifications();
        }, 15_000);

    return () => {
      active = false;
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
  }, [refreshKey, streamConnected, t]);

  useEffect(() => {
    if (!open) return;
    const ids = notifications.filter((notification) => !notification.seenAt && !markingRef.current.has(notification.id)).map((notification) => notification.id);
    if (!ids.length) return;
    ids.forEach((id) => markingRef.current.add(id));
    const toastId = showToast(t("Marking notifications as seen..."));
    async function markSeen() {
      try {
        const response = await markNotificationsSeen(ids);
        if (!response.ok) throw new Error(t("Could not mark notifications as seen."));
        const payload: unknown = await response.json();
        if (!isSeenResponse(payload) || ids.some((id) => !payload.seen.some((item) => item.id === id))) {
          throw new Error(t("Could not mark notifications as seen."));
        }
        if (!mountedRef.current) return;
        const seen = new Map(payload.seen.map((item) => [item.id, item.seenAt]));
        const updated = notificationsRef.current.map((notification) => ({
          ...notification,
          seenAt: seen.get(notification.id) ?? notification.seenAt,
        }));
        notificationsRef.current = updated;
        setNotifications(updated);
        setClock(Date.now());
        setError("");
        updateToast(toastId, t("Notifications marked as seen."), "success");
      } catch {
        if (mountedRef.current) setError(t("Could not mark notifications as seen."));
        updateToast(toastId, t("Could not mark notifications as seen."), "error");
      } finally {
        ids.forEach((id) => markingRef.current.delete(id));
      }
    }

    void markSeen();
  }, [open, notifications, t]);

  useEffect(() => {
    const now = Date.now();
    const expirations = notifications
      .flatMap((notification) => notification.seenAt ? [Date.parse(notification.seenAt) + 10_000] : [])
      .filter((expiry) => expiry > now);
    if (!expirations.length) return;
    const timer = window.setTimeout(() => setClock(Date.now()), Math.min(...expirations) - now);
    return () => window.clearTimeout(timer);
  }, [notifications, clock]);

  useEffect(() => {
    const source = new EventSource("/api/notifications/stream");
    const refresh = () => setRefreshKey((current) => current + 1);
    const refreshDashboard = () => {
      refresh();
      window.dispatchEvent(new Event("venuguestpass:activity"));
    };
    const handleStreamError = () => setError(t("Live notification updates are temporarily unavailable."));

    source.addEventListener("sync", refresh);
    source.addEventListener("registration", refreshDashboard);
    source.addEventListener("check-in", refreshDashboard);
    source.addEventListener("stream-error", handleStreamError);
    source.onopen = () => setStreamConnected(true);
    source.onerror = () => setStreamConnected(false);

    return () => {
      source.close();
    };
  }, [t]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function toggleOpen() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) {
      setError("");
      if (notifications.length === 0) setLoading(true);
      setRefreshKey((current) => current + 1);
    }
  }

  function retryLoading() {
    setLoading(true);
    setError("");
    setRefreshKey((current) => current + 1);
  }

  const unreadCount = notifications.filter((notification) => notification.seenAt === null).length;

  return (
    <div className="notification-menu" ref={containerRef}>
      <button
        aria-controls="notification-panel"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${t(unreadCount > 0 ? "Notifications, new activity" : "Notifications")}${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
        className={`notification-trigger${open ? " is-open" : ""}`}
        onClick={toggleOpen}
        ref={triggerRef}
        title={t("Notifications")}
        type="button"
      >
        <Bell
          aria-hidden="true"
          className={notificationPulse > 0 ? "notification-bell-notifying" : undefined}
          key={notificationPulse}
          size={16}
        />
        {unreadCount > 0 && (
          <span aria-hidden="true" className="notification-badge">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div
          aria-label={t("Notifications")}
          className="notification-panel"
          id="notification-panel"
          role="dialog"
        >
          <div className="notification-panel-heading">
            <div>
              <h2>{t("Notifications")}</h2>
            </div>
            <button
              aria-label={t("Close notifications")}
              className="notification-close"
              onClick={close}
              type="button"
            >
              <X aria-hidden="true" size={15} />
            </button>
          </div>
          {error && (
            <div className="notification-error" role="alert">
              <p>{error}</p>
              <button className="notification-retry" onClick={retryLoading} type="button">
                <RefreshCw aria-hidden="true" size={13} />
                {t("Try again")}
              </button>
            </div>
          )}
          {loading && notifications.length === 0 ? (
            <div className="notification-loading" role="status">
              <LoaderCircle aria-hidden="true" className="spin" size={18} />
              <span>{t("Loading notifications...")}</span>
            </div>
          ) : notifications.length > 0 ? (
            <ul aria-label={t("New guest registrations")} className="notification-list">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <Link
                    className={`notification-item${notification.seenAt === null || Date.parse(notification.seenAt) + 10_000 > clock ? " is-highlighted" : ""}`}
                    href={`/dashboard/events/${encodeURIComponent(notification.eventId)}`}
                  >
                    <span className="notification-item-icon">
                      {notification.kind === "check_in"
                        ? <Check aria-hidden="true" size={16} />
                        : <UserRoundPlus aria-hidden="true" size={16} />}
                    </span>
                    <span className="notification-item-copy">
                      <strong>{t(notification.kind === "check_in" ? "Check-in" : "New guest registration")}</strong>
                      <span>{notification.kind === "check_in"
                        ? `${notification.attendeeName} · ${notification.eventName}`
                        : `${notification.attendeeName} ${t("registered for")} ${notification.eventName}`}
                      </span>
                      <time dateTime={notification.createdAt}>
                        {new Intl.DateTimeFormat(locale, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(notification.createdAt))}
                      </time>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : !error && !loading ? (
            <div className="notification-empty" role="status">
              <span className="notification-empty-icon">
                <Inbox aria-hidden="true" size={19} />
              </span>
              <strong>{t("You're all caught up")}</strong>
              <p>{t("Your new notifications will appear here.")}</p>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
