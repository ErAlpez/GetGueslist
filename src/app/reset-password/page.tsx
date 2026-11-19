import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { getPreferences } from "@/lib/preferences";
import { localizeNode } from "@/lib/localization";

type ResetPasswordPageProps = {
  searchParams: Promise<{ token?: string; error?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const [{ locale }, params] = await Promise.all([getPreferences(), searchParams]);

  return localizeNode((
    <main className="auth-page">
      <Link className="auth-back" href="/">← Back to VenuGuestPass</Link>
      <AuthForm
        authError={params.error ? "This password reset link is invalid or expired. Request a new link." : undefined}
        mode="reset-password"
        token={params.token}
      />
    </main>
  ), locale);
}
