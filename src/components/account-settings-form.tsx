"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LockKeyhole, Save, UserRound } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { localizeNode } from "@/lib/localization";
import { usePreferences } from "@/components/preferences-provider";
import { FormSaveSuccess } from "@/components/form-save-success";

type FormMessage = {
  tone: "error" | "success";
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
      setProfileMessage({ tone: "success", text: t("Your profile is already up to date.") });
      return;
    }

    setProfilePending(true);
    let nameSaved = false;
    try {
      if (nameChanged) {
        const result = await authClient.updateUser({ name: nextName });
        if (result.error) {
          setProfileMessage({ tone: "error", text: t(result.error.message ?? "We couldn’t save your profile.") });
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
          router.refresh();
          setProfileMessage({
            tone: "error",
            text: t(nameSaved
              ? `Your name was saved, but the email change failed: ${result.error.message ?? "Try again."}`
              : result.error.message ?? "We couldn’t change your email."),
          });
          return;
        }
        setProfileMessage({ tone: "success", text: t("Profile saved. Check your email to confirm the address change.") });
      } else {
        setProfileMessage({ tone: "success", text: t("Profile details saved.") });
      }

      router.refresh();
    } catch {
      if (nameSaved) router.refresh();
      setProfileMessage({ tone: "error", text: t("We couldn’t save your profile. Please try again.") });
    } finally {
      setProfilePending(false);
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
    try {
      const result = await authClient.changePassword({ currentPassword, newPassword });
      if (result.error) {
        setPasswordMessage({ tone: "error", text: t(result.error.message ?? "We couldn’t change your password.") });
        return;
      }

      form.reset();
      setPasswordMessage({ tone: "success", text: t("Your password has been updated.") });
    } catch {
      setPasswordMessage({ tone: "error", text: t("We couldn’t change your password. Please try again.") });
    } finally {
      setPasswordPending(false);
    }
  }

  return localizeNode((
    <div className="account-settings-forms">
      <form className="settings-form account-settings-form" onChange={() => setProfileMessage((current) => current?.tone === "success" ? null : current)} onSubmit={saveProfile}>
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
            {profileMessage?.tone === "success" && !profilePending && <FormSaveSuccess message={profileMessage.text} />}
            <button className="button button-dark app-primary-button" disabled={profilePending} type="submit">
              {profilePending ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}
              Save profile
            </button>
          </div>
        </div>
      </form>

      <form className="settings-form account-settings-form account-password-form" onChange={() => setPasswordMessage((current) => current?.tone === "success" ? null : current)} onSubmit={changePassword}>
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
            {passwordMessage?.tone === "success" && !passwordPending && <FormSaveSuccess message={passwordMessage.text} />}
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
