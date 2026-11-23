import { Suspense, type ReactNode } from "react";
import { AccountMenu } from "@/components/account-menu";
import { AppSidebar } from "@/components/app-sidebar";
import { DashboardActivityRefresh } from "@/components/dashboard-activity-refresh";
import { DashboardLoadingContent } from "@/components/dashboard-loading-content";
import { DashboardMotion } from "@/components/dashboard-motion";
import { NotificationPopover } from "@/components/notification-popover";
import { TopbarEventSearch } from "@/components/topbar-event-search";
import { PreferenceControls } from "@/components/preference-controls";
import { OfflineWorkspaceContext } from "@/components/offline-workspace-context";
import { getPreferences } from "@/lib/preferences";
import { requireWorkspaceContext } from "@/lib/workspace";
import { workspaceHasFeature } from "@/lib/plan-features";
import { workspaceRoleCanAccessSection } from "@/lib/workspace-roles";
import { isSuperAdminEmail } from "@/lib/super-admin";
import "./page-kicker.css";
import "./stat-circles.css";
import "./loading.css";

export const dynamic = "force-dynamic";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<DashboardShellLoading />}>
      <DashboardShell>{children}</DashboardShell>
    </Suspense>
  );
}

async function DashboardShell({ children }: { children: ReactNode }) {
  const [{ locale }, context] = await Promise.all([getPreferences(), requireWorkspaceContext()]);
  const isLocalDemo =
    process.env.NODE_ENV === "development" &&
    context.user.id === "guestlist-demo-user" &&
    context.workspace.id === "guestlist-demo-workspace";
  const canAccessOverview = workspaceRoleCanAccessSection(context.membership.role, "overview");
  const canAccessEvents = workspaceRoleCanAccessSection(context.membership.role, "events");

  return (
    <div className="app-shell" lang={locale}>
      <OfflineWorkspaceContext userId={context.user.id} workspaceId={context.workspace.id} />
      <DashboardMotion />
      <DashboardActivityRefresh />
      <AppSidebar
        canContactSupport={workspaceHasFeature(context.subscription, "support")}
        isSuperAdmin={isSuperAdminEmail(context.user.email, context.user.emailVerified)}
        isWorkspaceOwner={context.membership.role === "OWNER"}
        workspaceRole={context.membership.role}
      />
      <div className="app-main">
        <header className="app-topbar">
          <div className="topbar-right">
            {canAccessEvents && <TopbarEventSearch />}
            <PreferenceControls />
            {canAccessOverview && <NotificationPopover />}
            <AccountMenu
              key={context.membership.role}
              demoPlanCode={isLocalDemo ? context.subscription?.plan.code ?? "FREE" : null}
              demoRole={isLocalDemo ? context.membership.role : null}
              email={context.user.email}
              image={context.user.image ?? null}
              name={context.user.name}
              workspaces={context.memberships.map((item) => ({
                id: item.workspace.id,
                name: item.workspace.name,
                role: item.role,
                active: item.workspace.id === context.workspace.id,
              }))}
            />
          </div>
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}

function DashboardShellLoading() {
  return (
    <div aria-busy="true" className="app-shell">
      <aside aria-hidden="true" className="app-sidebar">
        <div className="sidebar-brand-row">
          <span className="dashboard-loading-block dashboard-shell-loading-brand" />
        </div>
        <div className="app-nav dashboard-shell-loading-nav">
          {Array.from({ length: 8 }, (_, index) => (
            <span className="dashboard-loading-block dashboard-shell-loading-link" key={index} />
          ))}
        </div>
        <div className="sidebar-bottom">
          <span className="dashboard-loading-block dashboard-shell-loading-bottom" />
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <span className="dashboard-loading-block dashboard-shell-loading-topbar" />
        </header>
        <main className="app-content">
          <DashboardLoadingContent />
        </main>
      </div>
    </div>
  );
}
