"use client";

import { useId, useRef, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { ShieldAlert } from "lucide-react";
import { usePreferences } from "@/components/preferences-provider";
import "./confirm-button.css";

export function ConfirmButton({
  children,
  message,
  onClick,
  type = "submit",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  message: string;
}) {
  const { t } = usePreferences();
  const titleId = useId();
  const messageId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmed = useRef(false);

  function requestConfirmation(event: MouseEvent<HTMLButtonElement>) {
    if (confirmed.current) {
      onClick?.(event);
      return;
    }
    event.preventDefault();
    dialogRef.current?.showModal();
    cancelRef.current?.focus();
  }

  function confirm() {
    dialogRef.current?.close();
    const trigger = triggerRef.current;
    if (!trigger || trigger.disabled) return;
    confirmed.current = true;
    try {
      trigger.click();
    } finally {
      confirmed.current = false;
    }
  }

  return (
    <>
      <button {...props} onClick={requestConfirmation} ref={triggerRef} type={type}>{children}</button>
      <dialog
        aria-describedby={messageId}
        aria-labelledby={titleId}
        className="confirm-dialog"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            dialogRef.current?.close();
          }
        }}
        ref={dialogRef}
      >
        <span aria-hidden="true" className="confirm-dialog-icon"><ShieldAlert size={20} /></span>
        <h2 id={titleId}>{t("Confirm action")}</h2>
        <p id={messageId}>{t(message)}</p>
        <div className="confirm-dialog-actions">
          <button className="confirm-dialog-cancel" onClick={() => dialogRef.current?.close()} ref={cancelRef} type="button">{t("Cancel")}</button>
          <button className="confirm-dialog-confirm" onClick={confirm} type="button">{t("Confirm")}</button>
        </div>
      </dialog>
    </>
  );
}
