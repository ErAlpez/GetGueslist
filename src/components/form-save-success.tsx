"use client";

import { useEffect, useState } from "react";
import { CircleCheck } from "lucide-react";

export function FormSaveSuccess({
  message,
  className = "",
  autoDismiss = true,
}: {
  message: string;
  className?: string;
  autoDismiss?: boolean;
}) {
  const [dismissal, setDismissal] = useState<{ message: string; dismissed: boolean } | null>(null);

  useEffect(() => {
    if (!autoDismiss) return;
    const dismissTimeout = window.setTimeout(() => setDismissal({ message, dismissed: true }), 3_400);
    return () => window.clearTimeout(dismissTimeout);
  }, [autoDismiss, message]);

  if (autoDismiss && dismissal?.message === message && dismissal.dismissed) return null;

  return (
    <p key={message} className={`form-message form-success form-save-success${className ? ` ${className}` : ""}`} role="status">
      <CircleCheck aria-hidden="true" size={16} />
      <span>{message}</span>
    </p>
  );
}
