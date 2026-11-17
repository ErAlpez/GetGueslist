import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { getPreferences } from "@/lib/preferences";
import { localizeNode } from "@/lib/localization";

export default async function DemoAccountLoginPage() {
  const { locale } = await getPreferences();
  return localizeNode((
    <main className="auth-page">
      <Link className="auth-back" href="/">← Back to Guestlist</Link>
      <AuthForm mode="sign-in" showDemoAccount />
    </main>
  ), locale);
}
