import type { Metadata } from "next";
import { Noto_Sans_Arabic, Outfit } from "next/font/google";
import { MotionEnhancements } from "@/components/motion-enhancements";
import { PreferencesProvider } from "@/components/preferences-provider";
import { getPreferences } from "@/lib/preferences";
import "./globals.css";

const arabic = Noto_Sans_Arabic({ subsets: ["arabic"], variable: "--font-arabic", display: "swap" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "Guestlist — Every guest. Every event. Under control.",
    template: "%s | Guestlist",
  },
  description:
    "Manage registrations, invitations, guestlists, tickets, and attendance in one powerful event management workspace.",
  referrer: "no-referrer",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { locale, theme } = await getPreferences();
  const direction = locale === "ar" ? "rtl" : "ltr";

  return (
    <html className="h-full antialiased" data-theme={theme} dir={direction} lang={locale} suppressHydrationWarning>
      <body className={`${arabic.variable} ${outfit.variable} min-h-full`}>
        <PreferencesProvider initialLocale={locale} initialTheme={theme}>
          {children}
          <MotionEnhancements />
        </PreferencesProvider>
      </body>
    </html>
  );
}
