import { ArrowRight, LogIn } from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import { LandingAuthTrigger } from "@/components/landing-auth-modal";
import { LanguageControl, ThemeToggle } from "@/components/preference-controls";
import type { getCurrentSession } from "@/lib/auth";
import { translate, type Locale } from "@/lib/localization";
import "@/app/home-header.css";

type Session = Awaited<ReturnType<typeof getCurrentSession>>;

export function LandingFrameHeader({ locale, session }: { locale: Locale; session: Session }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <span className="landing-frame-mark">GUESTLIST</span>
        <div className={`header-actions${session ? " header-actions-authenticated" : ""}`}>
          <LanguageControl />
          <ThemeToggle />
          {session ? (
            <AccountMenu email={session.user.email} image={session.user.image ?? null} name={session.user.name} showOverview />
          ) : (
            <>
              <LandingAuthTrigger className="sign-in-link" mode="sign-in"><LogIn aria-hidden="true" size={14} /><span>{translate(locale, "Sign in")}</span></LandingAuthTrigger>
              <LandingAuthTrigger className="button button-dark header-cta" mode="sign-up">{translate(locale, "Get started")} <ArrowRight size={15} /></LandingAuthTrigger>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
