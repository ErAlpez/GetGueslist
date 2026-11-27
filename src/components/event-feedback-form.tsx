"use client";

import { useActionState } from "react";
import { useActionToastFeedback } from "@/components/toast-provider";
import { submitEventFeedbackAction } from "@/app/feedback/[token]/actions";

type EventFeedbackFormProps = {
  token: string;
};

export function EventFeedbackForm({ token }: EventFeedbackFormProps) {
  const [state, formAction, pending] = useActionState(submitEventFeedbackAction, {});
  useActionToastFeedback(pending, state);

  return (
    <form action={formAction} className="public-feedback-form">
      <input name="token" type="hidden" value={token} />
      <label className="public-feedback-field">
        <span>Your rating</span>
        <select defaultValue="" name="rating" required>
          <option disabled value="">Choose a rating</option>
          <option value="5">5 - Excellent</option>
          <option value="4">4 - Good</option>
          <option value="3">3 - Okay</option>
          <option value="2">2 - Could be better</option>
          <option value="1">1 - Poor</option>
        </select>
      </label>
      <label className="public-feedback-field">
        <span>Comments <small>(optional)</small></span>
        <textarea maxLength={2000} name="message" placeholder="What did you enjoy, or what could be improved?" />
      </label>
      {state.error && <p className="public-feedback-error" role="alert">{state.error}</p>}
      {state.success && <p className="public-feedback-success" role="status">Thanks for sharing your feedback.</p>}
      <button className="button button-dark public-feedback-submit" disabled={pending || state.success} type="submit">
        {pending ? "Submitting…" : "Submit feedback"}
      </button>
    </form>
  );
}
