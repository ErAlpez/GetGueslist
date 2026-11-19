"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import type { WorkspaceRole } from "@prisma/client";
import { ChevronRight, LayoutDashboard, LogOut, Settings } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { usePreferences } from "@/components/preferences-provider";
import { switchDemoRoleAction } from "@/app/dashboard/demo-role/actions";
import { switchDemoPlanAction } from "@/app/dashboard/demo-plan/actions";
import { switchWorkspaceAction } from "@/app/dashboard/workspaces/actions";
import {
  offlineVenuGuestPassCacheKey,
  offlineVenuGuestPassIdentityKey,
  offlineVenuGuestPassQueueKey,
  readOfflineGuestQueue,
} from "@/lib/offline-venuguestpass";
import { workspaceRoleDetails } from "@/lib/workspace-roles";
import "./account-tooltip.css";

const demoRoles: WorkspaceRole[] = ["OWNER", "ADMIN", "MANAGER", "CHECKIN", "VIEWER"];

export function AccountMenu({
  demoPlanCode = null,
  demoRole = null,
  name,
  email,
  image,
  showOverview = false,
  workspaces = [],
}: {
  demoPlanCode?: string | null;
  demoRole?: WorkspaceRole | null;
  name: string;
  email: string;
  image: string | null;
  showOverview?: boolean;
  workspaces?: Array<{ id: string; name: string; role: string; active: boolean }>;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [selectedDemoRole, setSelectedDemoRole] = useState<WorkspaceRole | null>(demoRole);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const popoverId = useId();
  const nameId = useId();
  const demoPlanId = useId();
  const demoRoleId = useId();
  const pathname = usePathname();
  const router = useRouter();
  const { t } = usePreferences();

  useEffect(() => {
    if (!open) return;

    firstLinkRef.current?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function signOut() {
    setError("");
    let pendingOfflineGuests: number;
    try {
      pendingOfflineGuests = readOfflineGuestQueue().length;
    } catch (error) {
      console.error("Offline guest registration queue could not be checked before sign out.", error);
      setError(t("Could not verify the offline guest queue. Reconnect and sync before signing out."));
      return;
    }
    if (
      pendingOfflineGuests > 0 &&
      !window.confirm(`There are ${pendingOfflineGuests} guest registration(s) waiting to sync. Signing out will remove them from this device. Continue?`)
    ) {
      return;
    }
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError(t("Sign out failed. Please try again."));
        return;
      }
      try {
        window.localStorage.removeItem(offlineVenuGuestPassCacheKey);
        window.localStorage.removeItem(offlineVenuGuestPassIdentityKey);
        window.localStorage.removeItem(offlineVenuGuestPassQueueKey);
      } catch (storageError) {
        console.error("Offline guest data could not be cleared during sign out.", storageError);
        setError(t("Signed out, but offline guest data could not be cleared from this device."));
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError(t("Sign out failed. Please try again."));
    }
  }

  return (
    <div className={`account-menu${open ? " is-open" : ""}`} ref={containerRef}>
      <button
        aria-label={`${name}, ${email}`}
        aria-controls={popoverId}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`account-trigger${open ? " is-open" : ""}`}
        onClick={() => setOpen((current) => !current)}
        ref={triggerRef}
        type="button"
      >
        <span aria-hidden="true" className="account-avatar">
          {image ? <Image alt="" className="account-photo" height={29} src={image} unoptimized width={29} /> : name.charAt(0).toUpperCase()}
        </span>
        <span aria-hidden="true" className="account-tooltip">
          <span className="account-tooltip-avatar">
            {image ? <Image alt="" className="account-photo" height={40} src={image} unoptimized width={40} /> : name.charAt(0).toUpperCase()}
          </span>
          <span className="account-tooltip-copy">
            <strong>{name}</strong>
            <small>{email}</small>
          </span>
        </span>
      </button>
      {open && (
        <div
          aria-labelledby={nameId}
          aria-modal="false"
          className="account-popover"
          id={popoverId}
          role="dialog"
        >
          <div className="account-popover-user">
            <span aria-hidden="true" className="account-popover-avatar">
              {image ? <Image alt="" className="account-photo" height={39} src={image} unoptimized width={39} /> : name.charAt(0).toUpperCase()}
            </span>
            <span className="account-popover-copy">
              <strong id={nameId}>{name}</strong>
              <small>{email}</small>
            </span>
          </div>
          <div aria-orientation="horizontal" className="account-popover-divider" role="separator" />
          {showOverview && (
            <Link className="account-popover-link" href="/dashboard" onClick={() => setOpen(false)} ref={firstLinkRef}>
              <span className="account-menu-icon"><LayoutDashboard aria-hidden="true" size={15} /></span>
              <span>{t("Overview")}</span>
              <ChevronRight aria-hidden="true" className="account-signout-chevron" size={14} />
            </Link>
          )}
          {workspaces.length > 1 && (
            <div className="account-workspaces">
              <span className="account-workspace-label">Workspaces</span>
              {workspaces.map((workspace) => (
                <form action={switchWorkspaceAction} key={workspace.id}>
                  <input name="workspaceId" type="hidden" value={workspace.id} />
                  <button
                    className={`account-workspace-button${workspace.active ? " active" : ""}`}
                    disabled={workspace.active}
                    type="submit"
                  >
                    <span>{workspace.name}</span>
                    <small>{workspace.role.toLowerCase()}</small>
                  </button>
                </form>
              ))}
            </div>
          )}
          {(demoRole || demoPlanCode) && (
            <div aria-orientation="horizontal" className="account-popover-divider" role="separator" />
          )}
          {demoRole && (
            <form action={switchDemoRoleAction} className="account-demo-control" onSubmit={() => setOpen(false)}>
              <label htmlFor={demoRoleId}>Demo role</label>
              <div className="account-demo-control-fields">
                <select
                  id={demoRoleId}
                  name="role"
                  onChange={(event) => {
                    const role = demoRoles.find((candidate) => candidate === event.currentTarget.value);
                    if (role) setSelectedDemoRole(role);
                  }}
                  value={selectedDemoRole ?? demoRole}
                >
                  {demoRoles.map((role) => <option key={role} value={role}>{workspaceRoleDetails[role].label}</option>)}
                </select>
                <input name="returnTo" type="hidden" value={pathname} />
                <button type="submit">Apply</button>
              </div>
              <small>{workspaceRoleDetails[selectedDemoRole ?? demoRole].description}</small>
            </form>
          )}
          {demoPlanCode && (
            <>
              <form action={switchDemoPlanAction} className="account-demo-control" onSubmit={() => setOpen(false)}>
                <label htmlFor={demoPlanId}>Demo plan</label>
                <div className="account-demo-control-fields">
                  <select defaultValue={demoPlanCode} id={demoPlanId} name="planCode">
                    <option value="FREE">Free</option>
                    <option value="STARTER">Starter</option>
                    <option value="PROFESSIONAL">Max</option>
                  </select>
                  <input name="returnTo" type="hidden" value={pathname} />
                  <button type="submit">Apply</button>
                </div>
                <small>Preview plan limits, features, and layouts.</small>
              </form>
            </>
          )}
          <Link
            className="account-popover-link"
            href="/dashboard/settings"
            onClick={() => setOpen(false)}
            ref={showOverview ? undefined : firstLinkRef}
          >
            <span className="account-menu-icon"><Settings aria-hidden="true" size={15} /></span>
            <span>{t("Settings")}</span>
            <ChevronRight aria-hidden="true" className="account-signout-chevron" size={14} />
          </Link>
          {error && <p className="account-error" role="alert">{error}</p>}
          <div aria-orientation="horizontal" className="account-popover-divider account-popover-divider-bottom" role="separator" />
          <button
            className="account-popover-sign-out"
            onClick={signOut}
            type="button"
          >
            <span className="account-signout-icon"><LogOut aria-hidden="true" size={15} /></span>
            <span>{t("Sign out")}</span>
            <ChevronRight aria-hidden="true" className="account-signout-chevron" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
