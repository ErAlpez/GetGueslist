"use client";

import { useActionState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { savePlanAction, type AdminActionState } from "@/app/dashboard/admin/plans/actions";
import { usePreferences } from "@/components/preferences-provider";
import { planFeatureOptions } from "@/lib/plan-features";

type PlanEditorValue = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  monthlyPriceCents: number | null;
  yearlyPriceCents: number | null;
  activeEventLimit: number | null;
  attendeePerEventLimit: number | null;
  features: unknown;
  isActive: boolean;
};

const initialState: AdminActionState = {};

function selectedFeatures(features: unknown) {
  return Array.isArray(features)
    ? new Set(features.filter((feature): feature is string => typeof feature === "string"))
    : new Set<string>();
}

export function SuperAdminPlanEditor({ plan }: { plan?: PlanEditorValue }) {
  const { t } = usePreferences();
  const [state, formAction, pending] = useActionState(savePlanAction, initialState);
  const activeFeatures = selectedFeatures(plan?.features);

  return (
    <form action={formAction} className="super-admin-plan-form">
      {plan && <input name="id" type="hidden" value={plan.id} />}
      <div className="super-admin-plan-fields">
        <label>
          <span>{t("Plan code")}</span>
          <input defaultValue={plan?.code ?? ""} maxLength={40} name="code" pattern="[A-Za-z][A-Za-z0-9_]{1,39}" required readOnly={Boolean(plan)} />
        </label>
        <label>
          <span>{t("Plan name")}</span>
          <input defaultValue={plan?.name ?? ""} maxLength={60} name="name" required />
        </label>
        <label className="super-admin-plan-description">
          <span>{t("Description")}</span>
          <input defaultValue={plan?.description ?? ""} maxLength={240} name="description" />
        </label>
        <label>
          <span>{t("Monthly price ($)")}</span>
          <input
            defaultValue={plan?.monthlyPriceCents == null ? "" : (plan.monthlyPriceCents / 100).toFixed(2)}
            min={0}
            name="monthlyPriceDollars"
            step="0.01"
            type="number"
          />
        </label>
        <label>
          <span>{t("Yearly price ($)")}</span>
          <input
            defaultValue={plan?.yearlyPriceCents == null ? "" : (plan.yearlyPriceCents / 100).toFixed(2)}
            min={0}
            name="yearlyPriceDollars"
            step="0.01"
            type="number"
          />
        </label>
        <label>
          <span>{t("Active event limit")}</span>
          <input defaultValue={plan?.activeEventLimit ?? ""} min={0} name="activeEventLimit" type="number" />
          <small>{t("Leave blank for unlimited.")}</small>
        </label>
        <label>
          <span>{t("Attendees per event")}</span>
          <input defaultValue={plan?.attendeePerEventLimit ?? ""} min={0} name="attendeePerEventLimit" type="number" />
          <small>{t("Leave blank for unlimited.")}</small>
        </label>
        <label className="super-admin-plan-active">
          <input defaultChecked={plan?.isActive ?? true} name="isActive" type="checkbox" value="true" />
          <span>{t("Available for new subscriptions")}</span>
        </label>
      </div>

      <fieldset className="super-admin-feature-list">
        <legend>{t("Included features")}</legend>
        {planFeatureOptions.map(({ code, label }) => (
          <label key={code}>
            <input defaultChecked={activeFeatures.has(code)} name="features" type="checkbox" value={code} />
            <span>{t(label)}</span>
            <code>{code}</code>
          </label>
        ))}
      </fieldset>

      <div className="super-admin-plan-submit">
        <button className="button button-dark app-primary-button" disabled={pending} type="submit">
          {pending ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : <Save aria-hidden="true" size={14} />}
          {t(plan ? "Save plan" : "Create plan")}
        </button>
        {state.error && <p aria-live="polite" className="form-message form-error">{t(state.error)}</p>}
        {state.success && <p aria-live="polite" className="super-admin-success">{t(state.success)}</p>}
      </div>
    </form>
  );
}
