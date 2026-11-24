"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { WorkspaceRole } from "@prisma/client";
import {
  BarChart3,
  CalendarDays,
  CircleHelp,
  CreditCard,
  Files,
  LayoutDashboard,
  LockKeyhole,
  PanelLeftClose,
  PanelLeftOpen,
  ScanLine,
  Settings2,
  Ticket,
  UsersRound,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { usePreferences } from "@/components/preferences-provider";
import { FeedbackDialog } from "@/components/feedback-dialog";
import { workspaceRoleCanAccessSection } from "@/lib/workspace-roles";
import "./app-sidebar.css";

const navigation = [
  { label: "Overview", href: "/dashboard", section: "overview", icon: LayoutDashboard },
  { label: "My events", href: "/dashboard/events", section: "events", icon: CalendarDays },
  { label: "Attendees", href: "/dashboard/attendees", section: "attendees", icon: UsersRound },
  { label: "Tickets", href: "/dashboard/tickets", section: "tickets", icon: Ticket },
  { label: "Check-in", href: "/dashboard/check-in", section: "check-in", icon: ScanLine },
  { label: "Reports & analytics", href: "/dashboard/reports", section: "reports", icon: BarChart3 },
] as const;

const workspaceNavigation = [
  { label: "Workspace files", href: "/dashboard/files", section: "files", icon: Files },
  { label: "Subscription & billing", href: "/dashboard/billing", section: "billing", icon: CreditCard },
  { label: "Settings", href: "/dashboard/settings", section: "settings", icon: Settings2 },
] as const;

export function AppSidebar({
  canContactSupport,
  isSuperAdmin,
  isWorkspaceOwner,
  workspaceRole,
}: {
  canContactSupport: boolean;
  isSuperAdmin: boolean;
  isWorkspaceOwner: boolean;
  workspaceRole: WorkspaceRole;
}) {
  const pathname = usePathname();
  const { t } = usePreferences();
  const [collapsed, setCollapsed] = useState(false);
  const [prefetchedRoutes, setPrefetchedRoutes] = useState<Set<string>>(() => new Set());
  const navRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const collapseLabel = t(collapsed ? "Expand sidebar" : "Collapse sidebar");
  const visibleNavigation = navigation.filter(({ section }) => workspaceRoleCanAccessSection(workspaceRole, section));
  const visibleWorkspaceNavigation = workspaceNavigation.filter(({ section }) => workspaceRoleCanAccessSection(workspaceRole, section));

  function prefetchOnIntent(href: string) {
    setPrefetchedRoutes((current) => {
      if (current.has(href)) return current;
      const next = new Set(current);
      next.add(href);
      return next;
    });
  }

  useLayoutEffect(() => {
    const nav = navRef.current;
    const indicator = indicatorRef.current;
    if (!nav || !indicator) return;
    const navigationElement = nav;
    const indicatorElement = indicator;

    function updateIndicator() {
      const activeLink = navigationElement.querySelector<HTMLElement>(".app-nav-link.active");
      if (!activeLink) {
        indicatorElement.style.opacity = "0";
        return;
      }

      indicatorElement.style.transform = `translate(${activeLink.offsetLeft}px, ${activeLink.offsetTop}px)`;
      indicatorElement.style.width = `${activeLink.offsetWidth}px`;
      indicatorElement.style.height = `${activeLink.offsetHeight}px`;
      indicatorElement.style.opacity = "1";
    }

    updateIndicator();
    const readyFrame = requestAnimationFrame(() => { nav.dataset.indicatorReady = "true"; });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateIndicator);
    observer?.observe(nav);
    nav.querySelectorAll(".app-nav-link").forEach((link) => observer?.observe(link));
    window.addEventListener("resize", updateIndicator);
    return () => {
      cancelAnimationFrame(readyFrame);
      observer?.disconnect();
      window.removeEventListener("resize", updateIndicator);
    };
  }, [pathname, collapsed, t]);

  return (
    <aside className={`app-sidebar${collapsed ? " is-collapsed" : ""}`}>
      <div className="sidebar-brand-row">
        <Link
          aria-label="VenuGuestPass home"
          className="app-brand"
          data-tooltip={collapsed ? t("VenuGuestPass home") : undefined}
          href="/dashboard"
          onFocus={() => prefetchOnIntent("/dashboard")}
          onPointerEnter={() => prefetchOnIntent("/dashboard")}
          prefetch={prefetchedRoutes.has("/dashboard") ? true : "auto"}
        >
          <BrandMark /><span className="app-brand-name">VenuGuestPass</span>
        </Link>
        <button
          aria-expanded={!collapsed}
          aria-label={collapseLabel}
          className="sidebar-collapse-toggle"
          data-tooltip={collapsed ? collapseLabel : undefined}
          onClick={() => setCollapsed((value) => !value)}
          type="button"
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>
      <nav aria-label="Workspace navigation" className="app-nav" ref={navRef}>
        <span aria-hidden="true" className="app-nav-indicator" ref={indicatorRef} />
        {visibleNavigation.length > 0 && (
          <>
            <span className="app-nav-label">{t("WORKSPACE")}</span>
            {visibleNavigation.map(({ label, href, icon: Icon }) => {
              const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  aria-label={t(label)}
                  className={`app-nav-link${active ? " active" : ""}`}
                  data-tooltip={collapsed ? t(label) : undefined}
                  href={href}
                  key={href}
                  onFocus={() => prefetchOnIntent(href)}
                  onPointerEnter={() => prefetchOnIntent(href)}
                  prefetch={prefetchedRoutes.has(href) ? true : "auto"}
                >
                  <Icon size={16} strokeWidth={1.8} /><span>{t(label)}</span>
                </Link>
              );
            })}
          </>
        )}
        {visibleWorkspaceNavigation.length > 0 && (
          <>
            <span className="app-nav-label app-nav-label-spaced">{t("MANAGE")}</span>
            {visibleWorkspaceNavigation.map(({ label, href, icon: Icon }) => {
              const active = pathname === href;
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  aria-label={t(label)}
                  className={`app-nav-link${active ? " active" : ""}`}
                  data-tooltip={collapsed ? t(label) : undefined}
                  href={href}
                  key={href}
                  onFocus={() => prefetchOnIntent(href)}
                  onPointerEnter={() => prefetchOnIntent(href)}
                  prefetch={prefetchedRoutes.has(href) ? true : "auto"}
                >
                  <Icon size={16} strokeWidth={1.8} /><span>{t(label)}</span>
                </Link>
              );
            })}
          </>
        )}
        {isSuperAdmin && (
          <>
            <span className="app-nav-label app-nav-label-spaced">{t("PLATFORM")}</span>
            <Link
              aria-current={pathname.startsWith("/dashboard/admin/plans") ? "page" : undefined}
              aria-label={t("Plan management")}
              className={`app-nav-link${pathname.startsWith("/dashboard/admin/plans") ? " active" : ""}`}
              data-tooltip={collapsed ? t("Plan management") : undefined}
              href="/dashboard/admin/plans"
              onFocus={() => prefetchOnIntent("/dashboard/admin/plans")}
              onPointerEnter={() => prefetchOnIntent("/dashboard/admin/plans")}
              prefetch={prefetchedRoutes.has("/dashboard/admin/plans") ? true : "auto"}
            >
              <LockKeyhole size={16} strokeWidth={1.8} /><span>{t("Plan management")}</span>
            </Link>
          </>
        )}
        <FeedbackDialog collapsed={collapsed} isWorkspaceOwner={isWorkspaceOwner} />
      </nav>
      <div className="sidebar-bottom">
        <div className="plan-nudge" data-tooltip={collapsed ? t("Need a hand?") : undefined}>
          <span className="plan-nudge-icon"><CircleHelp size={15} /></span><strong>{t("Need a hand?")}</strong>
          <p>{canContactSupport ? t("We’re here to help you get your event going.") : t("Email support is available on Max.")}</p>
          {canContactSupport
            ? <a href="mailto:hello@guestlist.app">{t("Contact support")} <span>↗</span></a>
            : <span className="plan-nudge-locked">{t("Max plan")}</span>}
        </div>
        <div className="sidebar-footer">VenuGuestPass <span>{t("Phase 1 preview")}</span></div>
      </div>
    </aside>
  );
}
