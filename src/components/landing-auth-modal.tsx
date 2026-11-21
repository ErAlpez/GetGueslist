"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { AuthForm } from "@/components/auth-form";

type AuthMode = "sign-in" | "sign-up";
type OpenAuthModal = (mode: AuthMode) => void;
type LandingAuthContextValue = { authenticated: boolean; openModal: OpenAuthModal };

const OpenAuthModalContext = createContext<LandingAuthContextValue | null>(null);

type LandingAuthModalProps = {
  children: ReactNode;
  authenticated: boolean;
  initialMode?: AuthMode;
  openInitially?: boolean;
  showDemoAccount?: boolean;
};

export function LandingAuthModal({
  children,
  authenticated,
  initialMode = "sign-in",
  openInitially = false,
  showDemoAccount = false,
}: LandingAuthModalProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [isSwitchingMode, setIsSwitchingMode] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const modeChangeTimeout = useRef<number | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const dialog = dialogRef.current;
      if (event.key === "Escape" && dialog?.open) {
        event.preventDefault();
        dialog.close();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      if (modeChangeTimeout.current !== null) {
        window.clearTimeout(modeChangeTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!openInitially || authenticated) {
      return;
    }

    const dialog = dialogRef.current;
    if (!dialog) {
      throw new Error("The landing auth dialog is not available.");
    }

    if (!dialog.open) {
      dialog.showModal();
    }
  }, [authenticated, openInitially]);

  function handleModeChange(nextMode: AuthMode) {
    if (nextMode === mode || modeChangeTimeout.current !== null) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMode(nextMode);
      return;
    }

    setIsSwitchingMode(true);
    modeChangeTimeout.current = window.setTimeout(() => {
      modeChangeTimeout.current = null;
      setMode(nextMode);
      setIsSwitchingMode(false);
    }, 200);
  }

  function cancelModeChange() {
    if (modeChangeTimeout.current === null) return;
    window.clearTimeout(modeChangeTimeout.current);
    modeChangeTimeout.current = null;
    setIsSwitchingMode(false);
  }

  function openModal(nextMode: AuthMode) {
    if (authenticated) return;
    cancelModeChange();
    setMode(nextMode);

    const dialog = dialogRef.current;
    if (!dialog) {
      throw new Error("The landing auth dialog is not available.");
    }

    if (!dialog.open) {
      dialog.showModal();
    }
  }

  function closeModal() {
    cancelModeChange();
    const dialog = dialogRef.current;
    if (dialog?.open) {
      dialog.close();
    }
  }

  return (
    <OpenAuthModalContext.Provider value={{ authenticated, openModal }}>
      {children}
      {!authenticated && (
        <dialog
          aria-label="Sign in or create a VenuGuestPass account"
          className="landing-auth-dialog"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeModal();
            }
          }}
          onCancel={(event) => {
            event.preventDefault();
            closeModal();
          }}
          ref={dialogRef}
        >
          <div className="landing-auth-modal-content">
            <button
              aria-label="Close dialog"
              className="landing-auth-close"
              onClick={closeModal}
              type="button"
            >
              <X aria-hidden="true" size={18} />
            </button>
            <div className={`landing-auth-experience${isSwitchingMode ? " is-switching-mode" : ""}`}>
              <AuthForm key={mode} mode={mode} onModeChange={handleModeChange} showDemoAccount={showDemoAccount} />
            </div>
          </div>
        </dialog>
      )}
    </OpenAuthModalContext.Provider>
  );
}

type LandingAuthTriggerProps = {
  children: ReactNode;
  className: string;
  mode: AuthMode;
};

export function LandingAuthTrigger({ children, className, mode }: LandingAuthTriggerProps) {
  const authContext = useContext(OpenAuthModalContext);
  if (!authContext) {
    throw new Error("LandingAuthTrigger must be rendered inside LandingAuthModal.");
  }

  if (authContext.authenticated) {
    return <Link className={className} href="/dashboard">{children}</Link>;
  }

  return (
    <button
      aria-haspopup="dialog"
      className={className}
      onClick={() => authContext.openModal(mode)}
      type="button"
    >
      {children}
    </button>
  );
}
