import { Building2, ShieldCheck, UserRound } from "lucide-react";
import { WorkspaceSettingsForm } from "@/components/workspace-settings-form";
import { ProfilePictureForm } from "@/components/profile-picture-form";
import { AccountSettingsForm } from "@/components/account-settings-form";
import { requireWorkspaceContext } from "@/lib/workspace";
import { getPreferences } from "@/lib/preferences";
import { localizeNode } from "@/lib/localization";
import "../plain-heading.css";

export default async function SettingsPage() {
  const { locale } = await getPreferences();
  const context = await requireWorkspaceContext();

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
          <WorkspaceSettingsForm workspace={context.workspace} />
        </section>
      </div>
      <div className="settings-secondary-grid account-settings-grid">
        <section className="app-panel settings-panel settings-account-panel">
          <div className="settings-panel-heading"><span className="settings-panel-icon lilac-settings"><UserRound size={16} /></span><span><h2>Your account</h2><p>Update your profile and account security.</p></span></div>
          <AccountSettingsForm email={context.user.email} emailVerified={context.user.emailVerified} name={context.user.name} />
        </section>
        <section className="app-panel settings-info-panel">
          <div className="settings-panel-heading"><span className="settings-panel-icon peach-settings"><ShieldCheck size={16} /></span><span><h2>Workspace access</h2><p>Your role and tenant access.</p></span></div>
          <div className="settings-info-row"><span>Your role</span><strong>{context.membership.role.toLowerCase()}</strong></div>
          <div className="settings-info-row"><span>Workspace owner</span><strong>{context.workspace.ownerId === context.user.id ? "You" : "Workspace owner"}</strong></div>
          <div className="settings-info-row"><span>Created</span><strong>{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(context.workspace.createdAt)}</strong></div>
        </section>
      </div>
      <p className="settings-security-note"><ShieldCheck size={14} /> Workspace records and event data are scoped server-side to your membership.</p>
    </div>
  ), locale);
}
