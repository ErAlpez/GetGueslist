"use client";

import { useEffect, useState } from "react";

export function PwaRuntime() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const updateConnection = () => setOffline(!navigator.onLine);
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch((error: unknown) => {
          console.error("PWA service worker registration failed:", error);
        });
    }

    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="pwa-offline-banner" role="status">
      You’re offline. Most workspace pages need a connection. Queued check-in scans will sync when you’re back online.
      {process.env.NODE_ENV === "production" && (
        <> <a href="/dashboard/attendees">Open the saved attendee list</a>.</>
      )}
    </div>
  );
}
