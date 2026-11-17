import "server-only";

import { cookies } from "next/headers";
import { defaultLocale, defaultTheme, isLocale, type Locale, type Theme } from "@/lib/localization";

export async function getPreferences(): Promise<{ locale: Locale; theme: Theme }> {
  const cookieStore = await cookies();
  const localeValue = cookieStore.get("guestlist-locale")?.value;
  const themeValue = cookieStore.get("guestlist-theme")?.value;

  return {
    locale: isLocale(localeValue) ? localeValue : defaultLocale,
    theme: themeValue === "light" || themeValue === "dark" ? themeValue : defaultTheme,
  };
}
