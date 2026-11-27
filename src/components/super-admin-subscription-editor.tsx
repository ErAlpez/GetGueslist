"use client";

import { useActionState, useEffect, useState } from "react";
import { useActionToastFeedback } from "@/components/toast-provider";
import { LoaderCircle, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { updateWorkspacePlanAction, type AdminActionState } from "@/app/dashboard/admin/plans/actions";
import { usePreferences } from "@/components/preferences-provider";

type SelectablePlan = { id: string; code: string; name: string; isActive: boolean };

const subscriptionStatuses = ["ACTIVE", "TRIALING", "PAST_DUE", "PAUSED", "CANCELLED", "EXPIRED"] as const;
const initialState: AdminActionState = {};

export function SuperAdminSubscriptionEditor({
  workspaceId,
  planId,
  status,
  plans,
}: {
  workspaceId: string;
  planId: string | null;
  status: string | null;
  plans: SelectablePlan[];
}) {
  const { t } = usePreferences();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updateWorkspacePlanAction, initialState);
  useActionToastFeedback(pending, state);
  const [selectedPlanId, setSelectedPlanId] = useState(planId ?? "");
  const [selectedStatus, setSelectedStatus] = useState(status ?? "ACTIVE");

  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state]);

  return (
    <form action={formAction} className="super-admin-subscription-form">
      <input name="workspaceId" type="hidden" value={workspaceId} />
      <label>
        <span className="sr-only">{t("Plan")}</span>
        <select name="planId" onChange={(event) => setSelectedPlanId(event.target.value)} required value={selectedPlanId}>
          <option disabled value="">{t("Choose a plan")}</option>
          {plans.map((plan) => (
            <option disabled={!plan.isActive && plan.id !== planId} key={plan.id} value={plan.id}>
              {plan.name} ({plan.code}){plan.isActive ? "" : ` · ${t("inactive")}`}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="sr-only">{t("Subscription status")}</span>
        <select name="status" onChange={(event) => setSelectedStatus(event.target.value)} required value={selectedStatus}>
          {subscriptionStatuses.map((item) => <option key={item} value={item}>{t(item.replaceAll("_", " ").toLowerCase())}</option>)}
        </select>
      </label>
      <button aria-label={t("Save workspace plan")} className="button button-dark app-primary-button" disabled={pending} title={t("Save workspace plan")} type="submit">
        {pending ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : <Save aria-hidden="true" size={14} />}
      </button>
      {state.error && <p aria-live="polite" className="form-message form-error">{t(state.error)}</p>}
      {state.success && <p aria-live="polite" className="super-admin-success">{t(state.success)}</p>}
    </form>
  );
}
