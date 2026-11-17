"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function DashboardActivityRefresh() {
  const router = useRouter();

  useEffect(() => {
    let timer: number | undefined;
    const refresh = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = undefined;
        router.refresh();
      }, 120);
    };

    window.addEventListener("guestlist:activity", refresh);
    return () => {
      window.removeEventListener("guestlist:activity", refresh);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [router]);

  return null;
}
