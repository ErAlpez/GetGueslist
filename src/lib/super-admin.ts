import "server-only";

import { notFound, redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";

export function isSuperAdminEmail(email: string, emailVerified: boolean): boolean {
  if (!emailVerified) return false;
  const allowedEmails = new Set(
    (process.env.SUPER_ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  return allowedEmails.has(email.trim().toLowerCase());
}

export async function requireSuperAdmin() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (!isSuperAdminEmail(session.user.email, session.user.emailVerified)) notFound();
  return session;
}
