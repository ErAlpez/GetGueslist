import { syncOfflineGuest } from "@/lib/api";

export const offlineVenuGuestPassCacheKey = "venguestpass-offline-guestlist-v1";
export const offlineVenuGuestPassQueueKey = "venguestpass-offline-guestlist-queue-v1";
export const offlineVenuGuestPassIdentityKey = "venguestpass-offline-identity-v1";

export type OfflineGuestRegistrationDraft = {
  id: string;
  userId: string;
  workspaceId: string;
  eventId: string;
  eventName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  age: string;
  gender: string;
  category: string;
  queuedAt: string;
  error?: string;
};

export type OfflineVenuGuestPassSnapshot = {
  userId: string;
  workspaceId: string;
  workspaceName: string;
  cachedAt: string;
  events: Array<{ id: string; name: string }>;
  registrations: Array<{
    id: string;
    eventName: string;
    firstName: string;
    lastName: string;
    email: string | null;
    category: string;
    rsvpStatus: string;
    registeredAt: string;
    ticketId: string | null;
    checkedInAt: string | null;
  }>;
};

function isOfflineDraft(value: unknown): value is OfflineGuestRegistrationDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<OfflineGuestRegistrationDraft>;
  return typeof draft.id === "string" &&
    typeof draft.userId === "string" &&
    typeof draft.workspaceId === "string" &&
    typeof draft.eventId === "string" &&
    typeof draft.eventName === "string" &&
    typeof draft.firstName === "string" &&
    typeof draft.lastName === "string" &&
    typeof draft.email === "string" &&
    typeof draft.phone === "string" &&
    typeof draft.age === "string" &&
    typeof draft.gender === "string" &&
    typeof draft.category === "string" &&
    typeof draft.queuedAt === "string";
}

export function readOfflineGuestQueue() {
  if (typeof window === "undefined") return [];
  const stored = window.localStorage.getItem(offlineVenuGuestPassQueueKey);
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      console.error("Offline guest registration queue is not an array.");
      return [];
    }
    return parsed.filter(isOfflineDraft);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    console.error("Offline guest registration queue could not be parsed.", error);
    return [];
  }
}

export function writeOfflineGuestQueue(queue: OfflineGuestRegistrationDraft[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(offlineVenuGuestPassQueueKey, JSON.stringify(queue));
}

const syncInFlight = new Map<string, Promise<{ synced: number; queue: OfflineGuestRegistrationDraft[] }>>();

export function syncOfflineGuestQueue(userId: string, workspaceId: string) {
  const key = `${userId}:${workspaceId}`;
  const inFlight = syncInFlight.get(key);
  if (inFlight) return inFlight;
  const request = syncQueue(userId, workspaceId).finally(() => {
    if (syncInFlight.get(key) === request) syncInFlight.delete(key);
  });
  syncInFlight.set(key, request);
  return request;
}

async function syncQueue(userId: string, workspaceId: string) {
  const queue = readOfflineGuestQueue();
  if (typeof window === "undefined" || !navigator.onLine || queue.length === 0) {
    return { synced: 0, queue };
  }

  const remaining = [...queue];
  let synced = 0;
  for (const draft of queue) {
    if (draft.userId !== userId || draft.workspaceId !== workspaceId) continue;

    let response: Response;
    try {
      response = await syncOfflineGuest({
        offlineSyncId: draft.id,
        workspaceId: draft.workspaceId,
        eventId: draft.eventId,
        firstName: draft.firstName,
        lastName: draft.lastName,
        email: draft.email,
        phone: draft.phone,
        age: draft.age,
        gender: draft.gender,
        category: draft.category,
      });
    } catch (error) {
      console.warn("Offline guest registration sync could not reach the server.", error);
      const index = remaining.findIndex((item) => item.id === draft.id);
      if (index >= 0) remaining[index] = { ...draft, error: "Waiting for a connection to sync this guest." };
      break;
    }

    if (response.ok) {
      const index = remaining.findIndex((item) => item.id === draft.id);
      if (index >= 0) remaining.splice(index, 1);
      synced += 1;
      continue;
    }

    let message = `Sync failed with HTTP ${response.status}.`;
    try {
      const body: unknown = await response.json();
      if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
        message = body.error;
      }
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      console.warn("Offline guest registration error response was not valid JSON.", error);
    }
    const index = remaining.findIndex((item) => item.id === draft.id);
    if (index >= 0) remaining[index] = { ...draft, error: message };
  }

  writeOfflineGuestQueue(remaining);
  return { synced, queue: remaining };
}
