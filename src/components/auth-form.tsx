"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, LockKeyhole, UserRound } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { BrandMark } from "@/components/brand-mark";
import { usePreferences } from "@/components/preferences-provider";
import { getSignInErrorMessage } from "@/lib/auth-errors";
import { localizeNode } from "@/lib/localization";

type AuthMode = "sign-in" | "sign-up" | "forgot-password" | "reset-password";

type AuthFormProps = {
  mode: AuthMode;
  token?: string;
  authError?: string;
  onModeChange?: (mode: "sign-in" | "sign-up") => void;
  showDemoAccount?: boolean;
};

const headings: Record<AuthMode, { title: string; description: string }> = {
  "sign-in": {
    title: "Welcome back",
    description: "Sign in to pick up where your next event left off.",
  },
  "sign-up": {
    title: "Make every event count",
    description: "Create your free VenuGuestPass workspace in a few moments.",
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

function isTwoFactorRedirect(data: unknown): data is { twoFactorRedirect: true } {
  return typeof data === "object"
    && data !== null
    && "twoFactorRedirect" in data
    && data.twoFactorRedirect === true;
}

function isInvalidOtpError(code: string | undefined, message: string) {
  const error = `${code ?? ""} ${message}`.toLowerCase();
  return error.includes("invalid") && (error.includes("otp") || error.includes("code"));
}

export function AuthForm({
  mode,
  token,
  authError,
  onModeChange,
  showDemoAccount = false,
}: AuthFormProps) {
  const router = useRouter();
  const { locale, t } = usePreferences();
  const [message, setMessage] = useState(authError ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [resendingVerification, setResendingVerification] = useState(false);
  const [otpRequired, setOtpRequired] = useState(false);
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpInvalid, setOtpInvalid] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const isSignUp = mode === "sign-up";
  const isPrimaryAuth = mode === "sign-in" || isSignUp;
  const isReset = mode === "reset-password";
  const isForgot = mode === "forgot-password";
  const { title, description } = headings[mode];

  async function signIn(email: string, password: string) {
    const result = await authClient.signIn.email({ email, password, callbackURL: "/dashboard" });
    if (result.error) {
      setMessage(t(getSignInErrorMessage(result.error.message)));
      return;
    }

    if (isTwoFactorRedirect(result.data)) {
      setOtpEmail(email);
      setOtpRequired(true);
      const otpResult = await authClient.twoFactor.sendOtp();
      if (otpResult.error) {
        setMessage(t(otpResult.error.message ?? "We couldn’t send your sign-in code."));
      }
      return;
    }

    router.push("/dashboard");
  }

  async function handleOtpSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    if (mode === "sign-up") setVerificationEmail("");
    setOtpInvalid(false);

    const code = otpCode.trim();
    if (!/^\d{6}$/.test(code)) {
      setMessage(t("Enter the six-digit code from your email."));
      setOtpInvalid(true);
      return;
    }

    setSubmitting(true);
    setOtpVerifying(true);
    try {
      const result = await authClient.twoFactor.verifyOtp({ code });
      if (result.error) {
        const errorMessage = result.error.message ?? "We couldn’t verify that code.";
        setMessage(t(errorMessage));
        setOtpInvalid(isInvalidOtpError(result.error.code, errorMessage));
      } else {
        setOtpCode("");
        setOtpVerified(true);
        router.push("/dashboard");
      }
    } catch {
      setMessage(t("Something went wrong. Please try again."));
    } finally {
      setOtpVerifying(false);
      setSubmitting(false);
    }
  }

  async function resendOtp() {
    setMessage("");
    setOtpInvalid(false);
    setSubmitting(true);
    try {
      const result = await authClient.twoFactor.sendOtp();
      if (result.error) {
        setMessage(t(result.error.message ?? "We couldn’t send your sign-in code."));
      } else {
        setOtpCode("");
      }
    } catch {
      setMessage(t("Something went wrong. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  function requestVerificationEmail(email: string) {
    return authClient.$fetch<{ status: boolean }>("/send-verification-email", {
      method: "POST",
      body: { email, callbackURL: "/dashboard" },
    });
  }

  async function resendVerificationEmail() {
    if (!verificationEmail) return;

    setMessage("");
    setResendingVerification(true);
    try {
      const result = await requestVerificationEmail(verificationEmail);
      if (result.error) {
        setMessage(t(result.error.message ?? "Something went wrong. Please try again."));
      }
    } catch {
      setMessage(t("Something went wrong. Please try again."));
    } finally {
      setResendingVerification(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

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
          setVerificationEmail(email);
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
        }
      } else if (isReset) {
        if (!token) {
          setMessage("This reset link is missing a token. Request a new one to continue.");
        } else {
          const result = await authClient.resetPassword({ newPassword: password, token });
          if (result.error) {
            setMessage(result.error.message ?? "This reset link is invalid or expired.");
          } else {
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
    setSubmitting(true);
    try {
      await signIn("demo@venuguestpass.local", "VenuGuestPassDemo123!");
    } catch {
      setMessage(t("Demo sign-in could not reach the authentication service. Check the local database setup and seed the demo account."));
    } finally {
      setSubmitting(false);
    }
  }

  return localizeNode((
    <div className={`auth-card${isPrimaryAuth ? ` auth-card--framed${isSignUp ? " is-sign-up" : ""}` : ""}`}>
      <section className="auth-form-panel">
        <Link aria-label="VenuGuestPass home" className="brand brand-dark" href="/">
          <BrandMark />
          <span>VenuGuestPass</span>
        </Link>
        <div className="auth-heading">
          <div className="auth-icon"><LockKeyhole size={19} /></div>
          <h1 aria-live="polite">
            {otpVerified
              ? t("Access granted")
              : otpVerifying
                ? t("Verifying...")
                : otpRequired
                  ? t("Check your email")
                  : t(title)}
          </h1>
          <p>
            {otpVerified
              ? t("Verified. Opening your workspace...")
              : otpVerifying
                ? t("Securely checking your code.")
                : otpRequired
                  ? `${t("We sent a six-digit code to")} ${otpEmail}.`
                  : t(description)}
          </p>
        </div>
        {otpVerified ? (
          <div aria-live="polite" className="auth-otp-transition auth-otp-transition--verified" role="status">
            <span aria-hidden="true" className="auth-otp-success-mark"><Check size={29} /></span>
            <span className="auth-otp-success-badge">{t("Verified")}</span>
          </div>
        ) : otpVerifying ? (
          <div aria-hidden="true" className="auth-otp-transition auth-otp-transition--loading">
            <span aria-hidden="true" className="auth-otp-loading-mark">
              <LoaderCircle className="spin" size={29} />
            </span>
          </div>
        ) : (
          <form className="auth-form" onSubmit={otpRequired ? handleOtpSubmit : handleSubmit} suppressHydrationWarning>
            {isSignUp && (
              <label>
                {t("Full name")}
                <input autoComplete="name" name="name" placeholder="Alex Morgan" required suppressHydrationWarning />
              </label>
            )}
            {!isReset && !otpRequired && (
              <label>
                {t("Email address")}
                <input autoComplete="email" name="email" placeholder="you@company.com" required suppressHydrationWarning type="email" />
              </label>
            )}
            {otpRequired && (
              <label className={otpInvalid && message ? "auth-otp-invalid" : undefined}>
                {t("Verification code")}
                <input
                  autoComplete="one-time-code"
                  autoFocus
                  className="auth-otp-input"
                  inputMode="numeric"
                  maxLength={6}
                  name="otp"
                  onChange={(event) => {
                    setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                    if (otpInvalid) {
                      setOtpInvalid(false);
                      setMessage("");
                    }
                  }}
                  pattern="[0-9]{6}"
                  placeholder="000000"
                  required
                  suppressHydrationWarning
                  value={otpCode}
                  aria-describedby={otpInvalid && message ? "auth-otp-error" : undefined}
                  aria-invalid={otpInvalid || undefined}
                />
                {otpInvalid && message && (
                  <span className="auth-otp-error-bubble" id="auth-otp-error" role="alert">{message}</span>
                )}
              </label>
            )}
            {!isForgot && !otpRequired && (
              <label>
                {t("Password")}
                <input
                  autoComplete={isSignUp ? "new-password" : "current-password"}
                  minLength={8}
                  name="password"
                  placeholder="At least 8 characters"
                  required
                  suppressHydrationWarning
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
                  suppressHydrationWarning
                  type="password"
                />
              </label>
            )}
            {mode === "sign-in" && !otpRequired && (
              <div className="auth-inline-link">
                <Link href="/forgot-password">{t("Forgot password?")}</Link>
              </div>
            )}
            {otpRequired && (
              <div className="auth-inline-link">
                <button disabled={submitting} onClick={resendOtp} type="button">{t("Resend code")}</button>
              </div>
            )}
            {message && !otpInvalid && (
              <p aria-live="polite" className={`form-message form-error${otpRequired ? " auth-otp-alert" : ""}`}>
                {message}
              </p>
            )}
            {isSignUp && verificationEmail && (
              <div className="auth-inline-link">
                <button disabled={submitting || resendingVerification} onClick={resendVerificationEmail} type="button">
                  {resendingVerification ? t("Sending...") : t("Resend verification email")}
                </button>
              </div>
            )}
            <button className="button button-dark auth-submit" disabled={submitting || resendingVerification || (isReset && !token)} type="submit">
              {submitting ? <LoaderCircle className="spin" size={17} /> : null}
              {submitting
                ? t("Please wait")
                : otpRequired
                  ? t("Verify code")
                  : isSignUp
                    ? t("Create free account")
                    : isForgot
                      ? t("Send reset link")
                      : isReset
                        ? t("Update password")
                        : t("Sign in")}
              {!submitting && <ArrowRight size={17} />}
            </button>
            {mode === "sign-in" && showDemoAccount && process.env.NODE_ENV === "development" && (
              <button className="button button-light demo-sign-in" disabled={submitting} onClick={signInToDemo} type="button">
                {t("Use demo account")}
              </button>
            )}
          </form>
        )}
        {isForgot || isReset ? (
          <p className="auth-switch">
            <Link className="back-link" href="/login"><ArrowLeft size={15} /> {t("Back to sign in")}</Link>
          </p>
        ) : null}
        <p className="auth-legal">{t("By continuing, you agree to our")} <Link href="/terms">{t("Terms")}</Link> {t("and")} <Link href="/privacy">{t("Privacy Policy")}</Link>.</p>
      </section>
      {isPrimaryAuth && (
        <aside className="auth-welcome-panel">
          <div aria-hidden="true" className="auth-welcome-orbit auth-welcome-orbit-one" />
          <div aria-hidden="true" className="auth-welcome-orbit auth-welcome-orbit-two" />
          <div className="auth-welcome-content">
            <span aria-hidden="true" className="auth-welcome-icon"><UserRound size={20} /></span>
            <p className="auth-welcome-eyebrow">{isSignUp ? t("WELCOME BACK") : t("A CALMER WAY TO RUN EVENTS")}</p>
            <h2>{isSignUp ? t("Good to see you again.") : t("Hello, friend!")}</h2>
            <p className="auth-welcome-description">
              {isSignUp
                ? t("Sign in to pick up where your next event left off.")
                : t("Bring your guests, tickets, and event details together in one welcoming workspace.")}
            </p>
            {onModeChange ? (
              <button
                aria-label={t(isSignUp ? "Switch to sign in" : "Switch to sign up")}
                className="auth-welcome-link"
                onClick={() => onModeChange(isSignUp ? "sign-in" : "sign-up")}
                type="button"
              >
                {isSignUp ? t("Sign in") : t("Create your account")} <ArrowRight aria-hidden="true" size={16} />
              </button>
            ) : (
              <Link className="auth-welcome-link" href={isSignUp ? "/login" : "/sign-up"}>
                {isSignUp ? t("Sign in") : t("Create your account")} <ArrowRight aria-hidden="true" size={16} />
              </Link>
            )}
          </div>
        </aside>
      )}
    </div>
  ), locale);
}
