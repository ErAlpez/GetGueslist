"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  offlineVenuGuestPassCacheKey,
  offlineVenuGuestPassIdentityKey,
  type OfflineVenuGuestPassSnapshot,
  readOfflineGuestQueue,
  syncOfflineGuestQueue,
  type OfflineGuestRegistrationDraft,
} from "@/lib/offline-venuguestpass";
import { usePreferences } from "@/components/preferences-provider";

export function VenuGuestPassOfflineCache({ snapshot }: { snapshot: OfflineVenuGuestPassSnapshot }) {
  const { t } = usePreferences();
  const router = useRouter();
  const [queue, setQueue] = useState<OfflineGuestRegistrationDraft[]>([]);
  const [offline, setOffline] = useState(false);
  const [storageError, setStorageError] = useState("");

  useEffect(() => {
    const handleCacheError = (event: Event) => {
      setStorageError((event as CustomEvent<string>).detail);
    };
    window.addEventListener("venuguestpass-offline-cache-error", handleCacheError);
    try {
      window.localStorage.setItem(offlineVenuGuestPassCacheKey, JSON.stringify(snapshot));
      window.localStorage.setItem(offlineVenuGuestPassIdentityKey, JSON.stringify({
        userId: snapshot.userId,
        workspaceId: snapshot.workspaceId,
      }));
      window.dispatchEvent(new CustomEvent("venuguestpass-offline-cache-error", { detail: "" }));
    } catch (error) {
      console.error("Offline attendee snapshot could not be saved.", error);
      window.dispatchEvent(new CustomEvent("venuguestpass-offline-cache-error", {
        detail: t("The attendee snapshot could not be saved on this device."),
      }));
    }
    const updateStatus = () => setOffline(!navigator.onLine);
    const sync = async () => {
      try {
        setQueue(readOfflineGuestQueue());
        const result = await syncOfflineGuestQueue(snapshot.userId, snapshot.workspaceId);
        setQueue(result.queue);
        if (result.synced > 0) router.refresh();
      } catch (error) {
        console.error("Offline guest registration sync failed.", error);
        window.dispatchEvent(new CustomEvent("venuguestpass-offline-cache-error", {
          detail: t("Offline guest registrations could not be synced. The queue is still saved on this device."),
        }));
      }
    };

    updateStatus();
    void sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", updateStatus);
    return () => {
      window.removeEventListener("venuguestpass-offline-cache-error", handleCacheError);
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", updateStatus);
    };
  }, [router, snapshot, t]);

  const visibleQueue = queue.filter((item) =>
    item.userId === snapshot.userId && item.workspaceId === snapshot.workspaceId,
  );
  if (!offline && visibleQueue.length === 0 && !storageError) return null;

  return (
    <p aria-live="polite" className="event-attachment-success venuguestpass-offline-status" role="status">
      {storageError || (offline
        ? t("Offline. The last attendee list snapshot is saved on this device.")
        : t(`${visibleQueue.length} offline guest registration${visibleQueue.length === 1 ? "" : "s"} waiting to sync.`))}
    </p>
  );
}
