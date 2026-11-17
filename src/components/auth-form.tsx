"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { usePreferences } from "@/components/preferences-provider";
import { localizeNode } from "@/lib/localization";

type AuthMode = "sign-in" | "sign-up" | "forgot-password" | "reset-password";

type AuthFormProps = {
  mode: AuthMode;
  token?: string;
  authError?: string;
};

const headings: Record<AuthMode, { title: string; description: string }> = {
  "sign-in": {
    title: "Welcome back",
    description: "Sign in to pick up where your next event left off.",
  },
  "sign-up": {
    title: "Make every event count",
    description: "Create your free Guestlist workspace in a few moments.",
  },
  "forgot-password": {
    title: "Reset your password",
    description: "We’ll send a secure link if an account exists for that email.",
  },
  "reset-password": {
    title: "Choose a new password",
    description: "Use at least 8 characters and avoid reusing an old password.",
  },
};

export function AuthForm({ mode, token, authError }: AuthFormProps) {
  const router = useRouter();
  const { locale, t } = usePreferences();
  const [message, setMessage] = useState(authError ?? "");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isSignUp = mode === "sign-up";
  const isReset = mode === "reset-password";
  const isForgot = mode === "forgot-password";
  const { title, description } = headings[mode];

  async function signIn(email: string, password: string) {
    const result = await authClient.signIn.email({ email, password, callbackURL: "/dashboard" });
    if (result.error) {
      setMessage(t(result.error.message ?? "We couldn’t sign you in."));
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setSuccess("");

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim();
    const password = String(formData.get("password") ?? "");

    if ((isSignUp || isReset) && password.length < 8) {
      setMessage("Use a password with at least 8 characters.");
      return;
    }

    if (isSignUp || isReset) {
      const confirmation = String(formData.get("confirmPassword") ?? "");
      if (password !== confirmation) {
        setMessage("Your passwords do not match.");
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === "sign-up") {
        const name = String(formData.get("name") ?? "").trim();
        const result = await authClient.signUp.email({
          name,
          email,
          password,
          callbackURL: "/dashboard",
        });
        if (result.error) {
          setMessage(result.error.message ?? "We couldn’t create your account.");
        } else {
          setSuccess("Check your inbox for a verification link to finish setting up your account.");
        }
      } else if (mode === "sign-in") {
        await signIn(email, password);
      } else if (isForgot) {
        const result = await authClient.requestPasswordReset({
          email,
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (result.error) {
          setMessage(result.error.message ?? "We couldn’t process that request.");
        } else {
          setSuccess("If an account exists for that email, a password reset link is on its way.");
        }
      } else if (isReset) {
        if (!token) {
          setMessage("This reset link is missing a token. Request a new one to continue.");
        } else {
          const result = await authClient.resetPassword({ newPassword: password, token });
          if (result.error) {
            setMessage(result.error.message ?? "This reset link is invalid or expired.");
          } else {
            setSuccess("Your password has been updated. You can now sign in.");
            router.replace("/login");
          }
        }
      }
    } catch {
      setMessage("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function signInToDemo() {
    setMessage("");
    setSuccess("");
    setSubmitting(true);
    try {
      await signIn("demo@guestlist.local", "GuestlistDemo123!");
    } catch {
      setMessage(t("Demo sign-in could not reach the authentication service. Check the local database setup and seed the demo account."));
    } finally {
      setSubmitting(false);
    }
  }

  return localizeNode((
    <div className="auth-card">
      <Link aria-label="Guestlist home" className="brand brand-dark" href="/">
        <span className="brand-mark"><span /></span>
        <span><span>G</span><span>uestlist</span></span>
      </Link>
      <div className="auth-heading">
        <div className="auth-icon"><LockKeyhole size={19} /></div>
        <h1>{t(title)}</h1>
        <p>{t(description)}</p>
      </div>
      <form className="auth-form" onSubmit={handleSubmit}>
        {isSignUp && (
          <label>
            {t("Full name")}
            <input autoComplete="name" name="name" placeholder="Alex Morgan" required />
          </label>
        )}
        {!isReset && (
          <label>
            {t("Email address")}
            <input autoComplete="email" name="email" placeholder="you@company.com" required type="email" />
          </label>
        )}
        {!isForgot && (
          <label>
            {t("Password")}
            <input
              autoComplete={isSignUp ? "new-password" : "current-password"}
              minLength={8}
              name="password"
              placeholder="At least 8 characters"
              required
              type="password"
            />
          </label>
        )}
        {(isSignUp || isReset) && (
          <label>
            {t("Confirm password")}
            <input
              autoComplete="new-password"
              minLength={8}
              name="confirmPassword"
              placeholder="Enter your password again"
              required
              type="password"
            />
          </label>
        )}
        {mode === "sign-in" && (
          <div className="auth-inline-link">
            <Link href="/forgot-password">{t("Forgot password?")}</Link>
          </div>
        )}
        {message && <p aria-live="polite" className="form-message form-error">{message}</p>}
        {success && <p aria-live="polite" className="form-message form-success">{success}</p>}
        <button className="button button-dark auth-submit" disabled={submitting || (isReset && !token)} type="submit">
          {submitting ? <LoaderCircle className="spin" size={17} /> : null}
          {submitting ? t("Please wait") : isSignUp ? t("Create free account") : isForgot ? t("Send reset link") : isReset ? t("Update password") : t("Sign in")}
          {!submitting && <ArrowRight size={17} />}
        </button>
        {mode === "sign-in" && process.env.NODE_ENV === "development" && (
          <button className="button button-light demo-sign-in" disabled={submitting} onClick={signInToDemo} type="button">
            {t("Use demo account")}
          </button>
        )}
      </form>
      <p className="auth-switch">
        {isSignUp ? (
          <>{t("Already have an account?")} <Link href="/login">{t("Sign in")}</Link></>
        ) : isForgot || isReset ? (
          <Link className="back-link" href="/login"><ArrowLeft size={15} /> {t("Back to sign in")}</Link>
        ) : (
          <>{t("New to Guestlist?")} <Link href="/sign-up">{t("Create an account")}</Link></>
        )}
      </p>
      <p className="auth-legal">{t("By continuing, you agree to our")} <Link href="/#terms">{t("Terms")}</Link> {t("and")} <Link href="/#privacy">{t("Privacy Policy")}</Link>.</p>
    </div>
  ), locale);
}
