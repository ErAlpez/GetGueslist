import { syncOfflineCheckIn } from "@/lib/api";

export type QueuedCheckIn = {
  eventId: string;
  token: string;
  deviceId: string;
  queuedAt: string;
};

const queueKey = "guestlist-offline-checkins";

export function queueOfflineCheckIn(item: QueuedCheckIn) {
  if (typeof window === "undefined") return;
  const queue = readOfflineQueue();
  queue.push(item);
  window.localStorage.setItem(queueKey, JSON.stringify(queue.slice(-500)));
}

export function readOfflineQueue(): QueuedCheckIn[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(queueKey) ?? "[]");
    return Array.isArray(value) ? value as QueuedCheckIn[] : [];
  } catch {
    return [];
  }
}

export async function syncOfflineCheckIns(deviceId: string): Promise<number> {
  if (typeof window === "undefined" || !navigator.onLine) return 0;
  const queue = readOfflineQueue();
  if (queue.length === 0) return 0;

  let synced = 0;
  const remaining: QueuedCheckIn[] = [];
  for (const item of queue) {
    try {
      const response = await syncOfflineCheckIn({
        eventId: item.eventId,
        token: item.token,
        deviceId: item.deviceId || deviceId,
      });
      if (response.ok || response.status === 404 || response.status === 409) {
        synced += 1;
      } else {
        remaining.push(item);
      }
    } catch {
      remaining.push(item);
    }
  }
  window.localStorage.setItem(queueKey, JSON.stringify(remaining));
  return synced;
}
