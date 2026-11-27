"use client";

import { useActionState, useState } from "react";
import { useActionToastFeedback } from "@/components/toast-provider";
import { createPortal } from "react-dom";
import { LoaderCircle, MessageSquareText, Star, X } from "lucide-react";
import { usePreferences } from "@/components/preferences-provider";
import { submitFeedbackAction, type FeedbackFormState } from "@/app/dashboard/feedback/actions";
import "./feedback-dialog.css";

const initialState: FeedbackFormState = {};

export function FeedbackDialog({ collapsed, isWorkspaceOwner }: { collapsed: boolean; isWorkspaceOwner: boolean }) {
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  const portalRoot = typeof document === "undefined"
    ? null
    : document.querySelector(".app-shell") ?? document.body;

  return (
    <>
      <button
        aria-label={t("Give Feedback")}
        aria-haspopup="dialog"
        className="app-nav-link sidebar-feedback-link"
        data-tooltip={collapsed ? t("Give Feedback") : undefined}
        onClick={() => setOpen(true)}
        type="button"
      >
        <MessageSquareText aria-hidden="true" size={16} strokeWidth={1.8} />
        <span>{t("Give Feedback")}</span>
      </button>
      {open && portalRoot && createPortal(<FeedbackForm isWorkspaceOwner={isWorkspaceOwner} onClose={() => setOpen(false)} />, portalRoot)}
    </>
  );
}

function FeedbackForm({ isWorkspaceOwner, onClose }: { isWorkspaceOwner: boolean; onClose: () => void }) {
  const { t } = usePreferences();
  const [state, formAction, pending] = useActionState(submitFeedbackAction, initialState);
  useActionToastFeedback(pending, state);
  const [rating, setRating] = useState(0);

  return (
    <div
      className="feedback-overlay"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section aria-labelledby="feedback-dialog-title" aria-modal="true" className="feedback-dialog" role="dialog">
        <button aria-label={t("Close")} autoFocus className="feedback-dialog-close" onClick={onClose} type="button">
          <X size={17} />
        </button>
        {state.success ? (
          <div className="feedback-success" role="status">
            <div className="feedback-success-mark">✓</div>
            <h2 id="feedback-dialog-title">{t("Thank you for your feedback.")}</h2>
            {state.notificationError && <p>{t("Your feedback was saved, but the email notification could not be sent.")}</p>}
            <button className="button button-dark app-primary-button" onClick={onClose} type="button">{t("Close")}</button>
          </div>
        ) : (
          <>
            <div className="feedback-dialog-heading">
              <span className="feedback-dialog-icon"><Star size={17} /></span>
              <h2 id="feedback-dialog-title">{t("Rate your experience")}</h2>
              <p>{t("Tell us what went well or what we could improve.")}</p>
            </div>
            <form action={formAction} className="feedback-form">
              <fieldset className="feedback-rating">
                <legend>{t("Your rating")}</legend>
                <div className="feedback-stars">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <label className={`feedback-star${rating >= value ? " is-selected" : ""}`} key={value} title={`${value} / 5`}>
                      <input
                        checked={rating === value}
                        name="rating"
                        onChange={() => setRating(value)}
                        required
                        type="radio"
                        value={value}
                      />
                      <Star aria-hidden="true" fill={rating >= value ? "currentColor" : "none"} size={24} />
                      <span className="sr-only">{value} / 5</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="feedback-message-label">
                {t("Message")}
                <textarea autoComplete="off" id="feedback-message" maxLength={2000} name="message" placeholder={t("Write your feedback here...")} required rows={5} />
              </label>
              {isWorkspaceOwner && (
                <label className="feedback-public-consent">
                  <input name="publicationConsent" type="checkbox" />
                  <span>{t("If I give this a 5-star rating, I agree that VenuGuestPass may publish my message with my name and workspace name on the homepage if it is approved.")}</span>
                </label>
              )}
              {state.error && <p className="feedback-error" role="alert">{t(state.error)}</p>}
              <button className="button button-dark app-primary-button feedback-submit" disabled={pending || !rating} type="submit">
                {pending && <LoaderCircle aria-hidden="true" className="feedback-spinner" size={15} />}
                {pending ? t("Sending...") : t("Send feedback")}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
