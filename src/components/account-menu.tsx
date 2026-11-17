"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ChevronRight, LayoutDashboard, LogOut, Settings } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { usePreferences } from "@/components/preferences-provider";
import "./account-tooltip.css";

export function AccountMenu({ name, email, image, showOverview = false }: { name: string; email: string; image: string | null; showOverview?: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const popoverId = useId();
  const nameId = useId();
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
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError(t("Sign out failed. Please try again."));
        return;
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
