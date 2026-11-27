"use client";

import { useActionState, useState } from "react";
import { useActionToastFeedback } from "@/components/toast-provider";
import {
  disablePaddleSubscriptionRenewalAction,
  type PaddleRenewalActionState,
} from "./actions";

const initialState: PaddleRenewalActionState = { status: "idle" };

function formatDate(dateString: string, locale: string) {
  const date = new Date(dateString);
  return Number.isNaN(date.getTime())
    ? "the end of the current billing period"
    : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

export function PaddleSubscriptionRenewalControl({
  scheduledCancellationAt,
  renewalDate,
  locale,
}: {
  scheduledCancellationAt: string | null;
  renewalDate: string | null;
  locale: string;
}) {
  const [disableState, disableAction, disabling] = useActionState(
    disablePaddleSubscriptionRenewalAction,
    initialState,
  );
  useActionToastFeedback(disabling, disableState);
  const [confirming, setConfirming] = useState(false);

  if (scheduledCancellationAt) {
    return (
      <div className="billing-renewal-control">
        <p className="billing-renewal-status" role="status">
          Auto-renew is off. Your plan remains active until <strong>{formatDate(scheduledCancellationAt, locale)}</strong>. Pay manually on or after that date to keep access.
        </p>
      </div>
    );
  }

  return (
    <div className="billing-renewal-control">
      <p className="billing-renewal-status" role="status">
        This existing subscription renews automatically
        {renewalDate
          ? <> on <strong>{formatDate(renewalDate, locale)}</strong>.</>
          : ", but Paddle has not provided the next billing date yet."}
        {" Turn off auto-renew below to prevent another charge."}
      </p>
      {disableState.status === "error" && <p className="billing-renewal-error" role="alert">{disableState.message}</p>}
      {!confirming ? (
        <button className="billing-renewal-disable" onClick={() => setConfirming(true)} type="button">
          Turn off auto-renew
        </button>
      ) : (
        <form
          action={disableAction}
          className="billing-renewal-confirmation"
          onSubmit={() => setConfirming(false)}
        >
          <input name="confirmAutoRenewOff" type="hidden" value="yes" />
          <p>Your plan stays active through the current billing period, then ends without another renewal charge.</p>
          <div className="billing-renewal-controls">
            <button className="billing-renewal-confirm" disabled={disabling} type="submit">
              {disabling ? "Turning auto-renew off…" : "Confirm"}
            </button>
            <button className="billing-renewal-keep" disabled={disabling} onClick={() => setConfirming(false)} type="button">
              Keep auto-renew on
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
