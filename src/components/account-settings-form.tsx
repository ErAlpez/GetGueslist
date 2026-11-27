"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LockKeyhole, Save, UserRound } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { localizeNode } from "@/lib/localization";
import { usePreferences } from "@/components/preferences-provider";
import { showToast, updateToast } from "@/components/toast-provider";

type FormMessage = {
  tone: "error";
  text: string;
};

export function AccountSettingsForm({
  name,
  email,
  emailVerified,
}: {
  name: string;
  email: string;
  emailVerified: boolean;
}) {
  const { locale, t } = usePreferences();
  const router = useRouter();
  const [profileMessage, setProfileMessage] = useState<FormMessage | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<FormMessage | null>(null);
  const [profilePending, setProfilePending] = useState(false);
  const [passwordPending, setPasswordPending] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const nextName = String(formData.get("name") ?? "").trim();
    const nextEmail = String(formData.get("email") ?? "").trim();
    const nameChanged = nextName !== name;
    const emailChanged = nextEmail.toLowerCase() !== email.toLowerCase();

    setProfileMessage(null);
    if (nextName.length < 2) {
      setProfileMessage({ tone: "error", text: t("Name must have at least 2 characters.") });
      return;
    }

    if (!nameChanged && !emailChanged) {
      return;
    }

    setProfilePending(true);
    const toastId = showToast("Saving profile...", "loading", { deduplicate: false });
    let nameSaved = false;
    try {
      if (nameChanged) {
        const result = await authClient.updateUser({ name: nextName });
        if (result.error) {
          const message = t(result.error.message ?? "We couldn’t save your profile.");
          setProfileMessage({ tone: "error", text: message });
          updateToast(toastId, message, "error");
          return;
        }
        nameSaved = true;
      }

      if (emailChanged) {
        const result = await authClient.changeEmail({
          newEmail: nextEmail,
          callbackURL: "/dashboard/settings",
        });
        if (result.error) {
          if (mounted.current && nameSaved) router.refresh();
          const message = t(nameSaved
            ? `Your name was saved, but the email change failed: ${result.error.message ?? "Try again."}`
            : result.error.message ?? "We couldn’t change your email.");
          setProfileMessage({ tone: "error", text: message });
          updateToast(toastId, message, "error");
          return;
        }
      }

      if (mounted.current) router.refresh();
      updateToast(
        toastId,
        emailChanged ? "Profile updated. Check your email to confirm the change." : "Profile updated.",
        "success",
      );
    } catch {
      if (mounted.current && nameSaved) router.refresh();
      const message = t("We couldn’t save your profile. Please try again.");
      setProfileMessage({ tone: "error", text: message });
      updateToast(toastId, message, "error");
    } finally {
      if (mounted.current) setProfilePending(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const currentPassword = String(formData.get("currentPassword") ?? "");
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    setPasswordMessage(null);
    if (newPassword.length < 8) {
      setPasswordMessage({ tone: "error", text: t("Use a password with at least 8 characters.") });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ tone: "error", text: t("Your new passwords do not match.") });
      return;
    }

    setPasswordPending(true);
    const toastId = showToast("Updating password...", "loading", { deduplicate: false });
    try {
      const result = await authClient.changePassword({ currentPassword, newPassword });
      if (result.error) {
        const message = t(result.error.message ?? "We couldn’t change your password.");
        setPasswordMessage({ tone: "error", text: message });
        updateToast(toastId, message, "error");
        return;
      }

      form.reset();
      updateToast(toastId, "Password updated.", "success");
    } catch {
      const message = t("We couldn’t change your password. Please try again.");
      setPasswordMessage({ tone: "error", text: message });
      updateToast(toastId, message, "error");
    } finally {
      if (mounted.current) setPasswordPending(false);
    }
  }

  return localizeNode((
    <div className="account-settings-forms">
      <form className="settings-form account-settings-form" data-toast-managed onChange={() => setProfileMessage(null)} onSubmit={saveProfile}>
        <div className="account-form-heading">
          <UserRound aria-hidden="true" size={16} />
          <div><h3>Profile details</h3><p>Keep your account name and email current.</p></div>
        </div>
        {profileMessage?.tone === "error" && <p aria-live="polite" className="form-message form-error">{profileMessage.text}</p>}
        <div className="form-grid">
          <label className="form-field">Name
            <input autoComplete="name" defaultValue={name} maxLength={100} minLength={2} name="name" required />
          </label>
          <label className="form-field">Email
            <input autoComplete="email" defaultValue={email} name="email" required type="email" />
          </label>
        </div>
        <div className="account-email-status">
          <span className={`account-verification-dot${emailVerified ? " is-verified" : ""}`} />
          {emailVerified ? "Email verified" : "Email verification pending"}
        </div>
        <div className="settings-form-footer">
          <span>Email changes take effect after confirmation.</span>
          <div className="form-save-actions">
            <button className="button button-dark app-primary-button" disabled={profilePending} type="submit">
              {profilePending ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}
              Save profile
            </button>
          </div>
        </div>
      </form>

      <form className="settings-form account-settings-form account-password-form" data-toast-managed onChange={() => setPasswordMessage(null)} onSubmit={changePassword}>
        <div className="account-form-heading">
          <LockKeyhole aria-hidden="true" size={16} />
          <div><h3>Password</h3><p>Enter your current password to set a new one.</p></div>
        </div>
        {passwordMessage?.tone === "error" && <p aria-live="polite" className="form-message form-error">{passwordMessage.text}</p>}
        <label className="form-field">Current password
          <input autoComplete="current-password" name="currentPassword" required type="password" />
        </label>
        <div className="form-grid">
          <label className="form-field">New password
            <input autoComplete="new-password" minLength={8} name="newPassword" required type="password" />
          </label>
          <label className="form-field">Confirm new password
            <input autoComplete="new-password" minLength={8} name="confirmPassword" required type="password" />
          </label>
        </div>
        <div className="settings-form-footer">
          <span>Use at least 8 characters.</span>
          <div className="form-save-actions">
            <button className="button button-dark app-primary-button" disabled={passwordPending} type="submit">
              {passwordPending ? <LoaderCircle className="spin" size={14} /> : <LockKeyhole size={14} />}
              Update password
            </button>
          </div>
        </div>
      </form>
    </div>
  ), locale);
}
