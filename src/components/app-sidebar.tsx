"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  CircleHelp,
  CreditCard,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  ScanLine,
  Settings2,
  Ticket,
  UsersRound,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { usePreferences } from "@/components/preferences-provider";
import { FeedbackDialog } from "@/components/feedback-dialog";
import "./app-sidebar.css";

const navigation = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "My events", href: "/dashboard/events", icon: CalendarDays },
  { label: "Guestlist", href: "/dashboard/guestlist", icon: UsersRound },
  { label: "Tickets", href: "/dashboard/tickets", icon: Ticket },
  { label: "Check-in", href: "/dashboard/check-in", icon: ScanLine },
  { label: "Reports & analytics", href: "/dashboard/reports", icon: BarChart3 },
];

const workspaceNavigation = [
  { label: "Subscription & billing", href: "/dashboard/billing", icon: CreditCard },
  { label: "Settings", href: "/dashboard/settings", icon: Settings2 },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { t } = usePreferences();
  const [collapsed, setCollapsed] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const collapseLabel = t(collapsed ? "Expand sidebar" : "Collapse sidebar");

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
        <Link aria-label="Guestlist home" className="app-brand" data-tooltip={collapsed ? t("Guestlist home") : undefined} href="/dashboard">
          <span className="brand-mark"><span /></span><span className="app-brand-name">Guestlist</span>
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
        <span className="app-nav-label">{t("WORKSPACE")}</span>
        {navigation.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
          return (
            <Link aria-current={active ? "page" : undefined} aria-label={t(label)} className={`app-nav-link${active ? " active" : ""}`} data-tooltip={collapsed ? t(label) : undefined} href={href} key={href}>
              <Icon size={16} strokeWidth={1.8} /><span>{t(label)}</span>
            </Link>
          );
        })}
        <span className="app-nav-label app-nav-label-spaced">{t("MANAGE")}</span>
        {workspaceNavigation.map(({ label, href, icon: Icon }) => {
          const active = pathname === href;
          return <Link aria-current={active ? "page" : undefined} aria-label={t(label)} className={`app-nav-link${active ? " active" : ""}`} data-tooltip={collapsed ? t(label) : undefined} href={href} key={href}><Icon size={16} strokeWidth={1.8} /><span>{t(label)}</span></Link>;
        })}
        <FeedbackDialog collapsed={collapsed} />
      </nav>
      <div className="sidebar-bottom">
        <div className="plan-nudge" data-tooltip={collapsed ? t("Need a hand?") : undefined}><span className="plan-nudge-icon"><CircleHelp size={15} /></span><strong>{t("Need a hand?")}</strong><p>{t("We’re here to help you get your event going.")}</p><a href="mailto:hello@guestlist.app">{t("Contact support")} <span>↗</span></a></div>
        <div className="sidebar-footer">Guestlist <span>{t("Phase 1 preview")}</span></div>
      </div>
    </aside>
  );
}
