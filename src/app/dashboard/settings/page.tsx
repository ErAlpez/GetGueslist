import { Building2, ShieldCheck, UserRound } from "lucide-react";
import { WorkspaceSettingsForm } from "@/components/workspace-settings-form";
import { ProfilePictureForm } from "@/components/profile-picture-form";
import { AccountSettingsForm } from "@/components/account-settings-form";
import { WorkspaceMembers } from "@/components/workspace-members";
import { requireWorkspaceSection } from "@/lib/workspace";
import { workspaceRoleDetails, workspaceRoleHasPermission } from "@/lib/workspace-roles";
import { workspaceHasFeature } from "@/lib/plan-features";
import { getPrisma } from "@/lib/prisma";
import { getPreferences } from "@/lib/preferences";
import { localizeNode } from "@/lib/localization";
import "../plain-heading.css";

export default async function SettingsPage() {
  const { locale } = await getPreferences();
  const context = await requireWorkspaceSection("settings");
  const canManageWorkspace = workspaceRoleHasPermission(context.membership.role, "workspace.manage");
  const canEditWorkspaceSettings = canManageWorkspace && workspaceHasFeature(context.subscription, "workspace_settings");
  const prisma = getPrisma();
  const [members, invitations] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: context.workspace.id },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    }),
    prisma.workspaceInvitation.findMany({
      where: { workspaceId: context.workspace.id, acceptedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, role: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return localizeNode((
    <div className="settings-page">
      <div className="page-heading-row"><div><div className="page-kicker">WORKSPACE</div><h1>Settings</h1><p>Manage your workspace details and account access.</p></div></div>
      <div className="settings-primary-grid">
        <section className="app-panel settings-panel profile-settings-panel">
          <div className="settings-panel-heading"><span className="settings-panel-icon lilac-settings"><UserRound size={16} /></span><span><h2>Profile picture</h2><p>Upload a custom photo for your account.</p></span></div>
          <ProfilePictureForm image={context.user.image ?? null} name={context.user.name} />
        </section>
        <section className="app-panel settings-panel workspace-settings-panel">
          <div className="settings-panel-heading"><span className="settings-panel-icon"><Building2 size={16} /></span><span><h2>Workspace details</h2><p>Contact and location information for your workspace.</p></span></div>
          {canEditWorkspaceSettings
            ? <WorkspaceSettingsForm workspace={context.workspace} />
            : <div className="workspace-settings-locked"><strong>{canManageWorkspace ? "Workspace details require Max." : "Workspace details are managed by an Owner or Admin."}</strong><p>{canManageWorkspace ? "Workspace contact, organization, address, and timezone settings are available on the Max plan." : "You can view these details, but only an Owner or Admin can change them."}</p></div>}
        </section>
      </div>
      <div className="settings-secondary-grid account-settings-grid">
        <section className="app-panel settings-panel settings-account-panel">
          <div className="settings-panel-heading"><span className="settings-panel-icon lilac-settings"><UserRound size={16} /></span><span><h2>Your account</h2><p>Update your profile and account security.</p></span></div>
          <AccountSettingsForm email={context.user.email} emailVerified={context.user.emailVerified} name={context.user.name} />
        </section>
        <div className="settings-access-column">
          <section className="app-panel settings-info-panel">
            <div className="settings-panel-heading"><span className="settings-panel-icon peach-settings"><ShieldCheck size={16} /></span><span><h2>Workspace access</h2><p>Your role and tenant access.</p></span></div>
            <div className="settings-info-row"><span>Your role</span><strong>{workspaceRoleDetails[context.membership.role].label}</strong></div>
            <p className="settings-role-description">{workspaceRoleDetails[context.membership.role].description}</p>
            <div className="settings-info-row"><span>Workspace owner</span><strong>{context.workspace.ownerId === context.user.id ? "You" : "Workspace owner"}</strong></div>
            <div className="settings-info-row"><span>Created</span><strong>{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(context.workspace.createdAt)}</strong></div>
          </section>
          <section className="app-panel settings-panel workspace-members-panel">
            <div className="settings-panel-heading"><span className="settings-panel-icon lilac-settings"><UserRound size={16} /></span><span><h2>Workspace members</h2><p>Invite teammates and manage workspace access.</p></span></div>
            <WorkspaceMembers
              canManage={canManageWorkspace}
              invitations={invitations.map((invitation) => ({ ...invitation, expiresAt: invitation.expiresAt.toISOString() }))}
              members={members}
              ownerId={context.workspace.ownerId}
            />
          </section>
        </div>
      </div>
      <p className="settings-security-note"><ShieldCheck size={14} /> Workspace records and event data are scoped server-side to your membership.</p>
    </div>
  ), locale);
}
