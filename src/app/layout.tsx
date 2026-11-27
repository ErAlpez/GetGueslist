import type { Metadata } from "next";
import { Noto_Sans_Arabic, Outfit } from "next/font/google";
import { PwaRuntime } from "@/components/pwa-runtime";
import { WebsiteAnalyticsTracker } from "@/components/website-analytics-tracker";
import { AnalyticsConsent } from "@/components/analytics-consent";
import { PreferencesProvider } from "@/components/preferences-provider";
import { ToastProvider } from "@/components/toast-provider";
import { getPreferences } from "@/lib/preferences";
import "./globals.css";
import "./toast.css";

const arabic = Noto_Sans_Arabic({ subsets: ["arabic"], variable: "--font-arabic", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "VenuGuestPass — Every guest. Every event. Under control.",
    template: "%s | VenuGuestPass",
  },
  description:
    "Manage registrations, invitations, guestlists, tickets, and attendance in one powerful event management workspace.",
  referrer: "no-referrer",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { locale, theme } = await getPreferences();
  const direction = locale === "ar" ? "rtl" : "ltr";

  return (
    <html className="h-full antialiased" data-scroll-behavior="smooth" data-theme={theme} dir={direction} lang={locale} suppressHydrationWarning>
      <body className={`${arabic.variable} ${outfit.variable} min-h-full`} suppressHydrationWarning>
        <PreferencesProvider initialLocale={locale} initialTheme={theme}>
          <ToastProvider>
            <PwaRuntime />
            <WebsiteAnalyticsTracker />
            <AnalyticsConsent />
            {children}
          </ToastProvider>
        </PreferencesProvider>
      </body>
    </html>
  );
}
