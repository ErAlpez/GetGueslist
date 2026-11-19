import Link from "next/link";
import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { acceptWorkspaceInvitationAction } from "@/app/dashboard/settings/actions";
import { getCurrentSession } from "@/lib/auth";
import { getPrisma } from "@/lib/prisma";

export default async function WorkspaceInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await getCurrentSession();
  if (!session) redirect(`/login?next=/invite/${encodeURIComponent(token)}`);

  const invitation = await getPrisma().workspaceInvitation.findUnique({
    where: { tokenHash: createHash("sha256").update(token).digest("hex") },
    include: { workspace: { select: { name: true } } },
  });
  if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
    return (
      <main className="auth-page">
        <section className="auth-card"><h1>Invitation unavailable</h1><p>This invitation is invalid, expired, or has already been accepted.</p><Link className="button button-dark" href="/dashboard">Go to dashboard</Link></section>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <h1>Join {invitation.workspace.name}</h1>
        <p>Accept this invitation as {session.user.email}. Your assigned role will be {invitation.role.toLowerCase()}.</p>
        <form action={acceptWorkspaceInvitationAction}>
          <input name="token" type="hidden" value={token} />
          <button className="button button-dark" type="submit">Accept invitation</button>
        </form>
      </section>
    </main>
  );
}
