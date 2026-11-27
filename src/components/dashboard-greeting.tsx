"use client";

import { useEffect, useState } from "react";
import { usePreferences } from "@/components/preferences-provider";

type DashboardGreetingText = "Good morning," | "Good afternoon," | "Good evening,";

export function getDashboardGreeting(hour: number): DashboardGreetingText {
  if (hour < 12) return "Good morning,";
  if (hour < 18) return "Good afternoon,";
  return "Good evening,";
}

export function DashboardGreeting({ firstName }: { firstName: string }) {
  const { t } = usePreferences();
  const [greeting, setGreeting] = useState<DashboardGreetingText>("Good morning,");

  useEffect(() => {
    const updateGreeting = () => setGreeting(getDashboardGreeting(new Date().getHours()));
    updateGreeting();
    const intervalId = window.setInterval(updateGreeting, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  return <h1>{t(greeting)} {firstName}</h1>;
}
