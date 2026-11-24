import Link from "next/link";
import type { ReactNode } from "react";
import { LandingAuthModal } from "@/components/landing-auth-modal";
import { LandingFrameHeader } from "@/components/landing-frame-header";
import type { getCurrentSession } from "@/lib/auth";
import { landingNavigationItems } from "@/lib/landing-navigation";
import { translate, type Locale } from "@/lib/localization";
import "@/app/landing-experience.css";
import "./legal-document.css";

type Session = Awaited<ReturnType<typeof getCurrentSession>>;

export function LegalDocument({
  title,
  children,
  locale,
  session,
}: {
  title: string;
  children: ReactNode;
  locale: Locale;
  session: Session;
}) {
  const companion = title === "Privacy Policy"
    ? { href: "/terms", label: "Terms of Service" }
    : { href: "/privacy", label: "Privacy Policy" };

  return (
    <main className="landing-page legal-page" dir={locale === "ar" ? "rtl" : "ltr"}>
      <LandingAuthModal authenticated={Boolean(session)}>
        <div className="landing-frame">
          <LandingFrameHeader locale={locale} session={session} />

          <div className="legal-main">
            <article className="legal-document" lang="en">
              <p className="legal-eyebrow">VENUGUESTPASS · LEGAL</p>
              <h1>{title}</h1>
              <p className="legal-updated">Last updated: November 17, 2026</p>

              <div className="legal-copy">{children}</div>

              <section aria-labelledby="legal-contact-heading" className="legal-contact">
                <h2 id="legal-contact-heading">Contact</h2>
                <p>
                  For questions about VenuGuestPass or your information, email{" "}
                  <a href="mailto:hello@guestlist.app">hello@guestlist.app</a>.
                </p>
                <Link href={companion.href}>{companion.label}</Link>
              </section>
            </article>
          </div>

          <nav aria-label="Main navigation" className="landing-navigation">
            {landingNavigationItems.map(({ id, label }) => (
              <Link href={`/#${id}`} key={id}>{translate(locale, label)}</Link>
            ))}
          </nav>
        </div>
      </LandingAuthModal>
    </main>
  );
}
