"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isTrackedPublicPath } from "@/lib/website-analytics";
import { trackWebsiteAnalytics } from "@/lib/api";

export function WebsiteAnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!isTrackedPublicPath(pathname)) return;

    void trackWebsiteAnalytics(pathname).then((response) => {
      if (!response.ok) console.warn("Website analytics request was rejected:", response.status);
    }).catch((error: unknown) => {
      console.warn("Website analytics request failed:", error);
    });
  }, [pathname]);

  return null;
}
