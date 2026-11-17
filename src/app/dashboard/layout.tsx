import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { AccountMenu } from "@/components/account-menu";
import { AppSidebar } from "@/components/app-sidebar";
import { DashboardActivityRefresh } from "@/components/dashboard-activity-refresh";
import { DashboardMotion } from "@/components/dashboard-motion";
import { NotificationPopover } from "@/components/notification-popover";
import { PreferenceControls } from "@/components/preference-controls";
import { getPreferences } from "@/lib/preferences";
import { translate } from "@/lib/localization";
import { requireWorkspaceContext } from "@/lib/workspace";
import "./page-kicker.css";
import "./stat-circles.css";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const { locale } = await getPreferences();
  const context = await requireWorkspaceContext();

  return (
    <div className="app-shell" lang={locale}>
      <DashboardMotion />
      <DashboardActivityRefresh />
      <AppSidebar />
      <div className="app-main">
        <header className="app-topbar">
          <form action="/dashboard/events" className="topbar-search">
            <Search size={15} />
            <input aria-label={translate(locale, "Search events")} name="q" placeholder={translate(locale, "Search events...")} />
            <button aria-label={translate(locale, "Submit event search")} type="submit"><kbd>⌘ ↵</kbd></button>
          </form>
          <div className="topbar-right">
            <PreferenceControls />
            <NotificationPopover />
            <AccountMenu email={context.user.email} image={context.user.image ?? null} name={context.user.name} />
          </div>
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
