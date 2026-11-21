"use client";

import { ArrowUpRight } from "lucide-react";
import { useActionState, useState } from "react";
import {
  upgradeStarterToMaxAction,
  type PaddleUpgradeActionState,
} from "./actions";

const initialState: PaddleUpgradeActionState = { status: "idle" };

export function PaddlePlanUpgradeForm({
  disabled = false,
  disabledLabel = "Upgrade unavailable",
}: {
  disabled?: boolean;
  disabledLabel?: string;
}) {
  const [state, action, pending] = useActionState(upgradeStarterToMaxAction, initialState);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="plan-upgrade-control">
      {state.message && (
        <p
          className={`plan-upgrade-message ${state.status}`}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </p>
      )}
      {!confirming || state.status === "success" ? (
        <button
          className="plan-upgrade-button"
          disabled={disabled || pending || state.status === "success"}
          onClick={() => setConfirming(true)}
          type="button"
        >
          {pending
            ? "Submitting upgrade…"
            : state.status === "success"
              ? "Upgrade submitted"
              : disabled
                ? disabledLabel
                : <>Upgrade to Max <ArrowUpRight size={12} /></>}
        </button>
      ) : (
        <form action={action} className="plan-upgrade-confirmation">
          <input name="confirmPlanUpgrade" type="hidden" value="yes" />
          <p>
            Paddle will charge the prorated difference immediately. Your current monthly or annual billing cycle stays the same.
          </p>
          <button className="plan-upgrade-button" disabled={pending || disabled} type="submit">
            {pending ? "Submitting upgrade…" : "Confirm upgrade"}
          </button>
          <button
            className="plan-upgrade-cancel"
            disabled={pending}
            onClick={() => setConfirming(false)}
            type="button"
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}
