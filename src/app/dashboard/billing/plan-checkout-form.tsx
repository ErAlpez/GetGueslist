"use client";

import { ExternalLink } from "lucide-react";
import { useBillingPeriod } from "@/components/plan-pricing-period";
import { startPlanCheckoutAction } from "./actions";

export function PlanCheckoutForm({
  planCode,
  disabled = false,
  disabledLabel = "Manage current subscription first",
  buttonLabel,
}: {
  planCode: string;
  disabled?: boolean;
  disabledLabel?: string;
  buttonLabel?: string;
}) {
  const billingPeriod = useBillingPeriod();

  return (
    <form action={startPlanCheckoutAction}>
      <input type="hidden" name="planCode" value={planCode} />
      <input type="hidden" name="billingPeriod" value={billingPeriod} />
      <button className="plan-upgrade-button" disabled={disabled} type="submit">
        {disabled
          ? disabledLabel
          : <>{buttonLabel ?? "Pay with Paddle"} <ExternalLink size={12} /></>}
      </button>
    </form>
  );
}
