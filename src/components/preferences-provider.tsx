"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { locales, translate, type Locale, type Theme } from "@/lib/localization";

type PreferencesContextValue = {
  locale: Locale;
  theme: Theme;
  setLocale: (locale: Locale) => void;
  toggleTheme: () => void;
  t: (text: string) => string;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function savePreference(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

export function PreferencesProvider({
  children,
  initialLocale,
  initialTheme,
}: {
  children: ReactNode;
  initialLocale: Locale;
  initialTheme: Theme;
}) {
  const [locale, setCurrentLocale] = useState(initialLocale);
  const [theme, setCurrentTheme] = useState(initialTheme);
  const router = useRouter();

  const setLocale = useCallback((value: Locale) => {
    setCurrentLocale(value);
    savePreference("guestlist-locale", value);
    document.documentElement.lang = value;
    document.documentElement.dir = locales.find((item) => item.code === value)?.direction ?? "ltr";
    router.refresh();
  }, [router]);

  const toggleTheme = useCallback(() => {
    setCurrentTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      savePreference("guestlist-theme", next);
      document.documentElement.dataset.theme = next;
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ locale, theme, setLocale, toggleTheme, t: (text: string) => translate(locale, text) }),
    [locale, setLocale, theme, toggleTheme],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error("usePreferences must be used within PreferencesProvider.");
  return context;
}
