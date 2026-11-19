"use client";

import { useEffect } from "react";
import { offlineVenuGuestPassIdentityKey } from "@/lib/offline-venuguestpass";

export function OfflineWorkspaceContext({ userId, workspaceId }: { userId: string; workspaceId: string }) {
  useEffect(() => {
    window.localStorage.setItem(offlineVenuGuestPassIdentityKey, JSON.stringify({ userId, workspaceId }));
  }, [userId, workspaceId]);

  return null;
}
