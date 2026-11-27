"use client";

import { useActionState } from "react";
import { useActionToastFeedback } from "@/components/toast-provider";
import { LoaderCircle } from "lucide-react";
import { registerForEventAction, type PublicRegistrationState } from "@/app/register/[eventId]/actions";
import { usePreferences } from "@/components/preferences-provider";
import { attendeeCategories, attendeeCategoryLabels } from "@/lib/attendee-categories";
import type { RegistrationFormQuestion } from "@/lib/registration-form";

const initialState: PublicRegistrationState = {};

export function PublicRegistrationForm({
  eventId,
  questions = [],
  rsvp = null,
  mealOptions = [],
  sessions = [],
}: {
  eventId: string;
  questions?: RegistrationFormQuestion[];
  rsvp?: { allowMaybe: boolean } | null;
  mealOptions?: string[];
  sessions?: Array<{ id: string; name: string; startsAt?: string }>;
}) {
  const { t } = usePreferences();
  const [state, formAction, pending] = useActionState(registerForEventAction, initialState);
  useActionToastFeedback(pending, state);

  return (
    <form action={formAction} className="public-registration-form">
      <input name="eventId" type="hidden" value={eventId} />
      <div className="public-registration-fields">
        <label className="public-registration-field">
          {t("First name")}
          <input autoComplete="given-name" maxLength={100} name="firstName" required />
        </label>
        <label className="public-registration-field">
          {t("Last name")}
          <input autoComplete="family-name" maxLength={100} name="lastName" required />
        </label>
      </div>
      <label className="public-registration-field">
        {t("Email address")}
        <input autoComplete="email" maxLength={254} name="email" required type="email" />
      </label>
      <label className="public-registration-field">
        {t("Phone number")} <span>{t("Optional")}</span>
        <input autoComplete="tel" maxLength={40} name="phone" type="tel" />
      </label>
      <div className="public-registration-fields">
        <label className="public-registration-field">
          {t("Age")} <span>{t("Optional")}</span>
          <input max={150} min={0} name="age" step={1} type="number" />
        </label>
        <label className="public-registration-field">
          {t("Gender")} <span>{t("Optional")}</span>
          <select defaultValue="" name="gender">
            <option value="">{t("Choose an option")}</option>
            <option value="MALE">{t("Male")}</option>
            <option value="FEMALE">{t("Female")}</option>
          </select>
        </label>
      </div>
      <label className="public-registration-field">
        {t("Category")}
        <select defaultValue="GENERAL" name="category" required>
          {attendeeCategories.map((category) => <option key={category} value={category}>{t(attendeeCategoryLabels[category])}</option>)}
        </select>
      </label>
      {rsvp && (
        <label className="public-registration-field">
          RSVP
          <select defaultValue="PENDING" name="rsvpStatus" required>
            <option value="PENDING">Pending</option>
            <option value="ACCEPTED">Attending</option>
            <option value="DECLINED">Not attending</option>
            {rsvp.allowMaybe && <option value="MAYBE">Maybe</option>}
          </select>
        </label>
      )}
      {mealOptions.length > 0 && (
        <label className="public-registration-field">
          Meal preference
          <select defaultValue="" name="mealChoice" required>
            <option disabled value="">Choose a meal</option>
            {mealOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
      )}
      {sessions.length > 0 && (
        <fieldset className="public-registration-field public-registration-sessions">
          <legend>Sessions</legend>
          {sessions.map((session) => (
            <label key={session.id}>
              <input name="sessionId" type="checkbox" value={session.id} />
              <span>{session.name}{session.startsAt ? ` — ${session.startsAt}` : ""}</span>
            </label>
          ))}
        </fieldset>
      )}
      {questions.map((question) => {
        const name = `question_${question.id}`;
        if (question.type === "CHECKBOX") {
          return (
            <label className="public-registration-checkbox-field" key={question.id}>
              <input name={name} required={question.required} type="checkbox" value="true" />
              <span>{t(question.label)}{question.required && <b aria-hidden="true"> *</b>}</span>
            </label>
          );
        }

        return (
          <label className="public-registration-field" key={question.id}>
            {t(question.label)} <span>{t(question.required ? "Required" : "Optional")}</span>
            {question.type === "LONG_TEXT" ? (
              <textarea autoComplete="off" maxLength={2000} name={name} required={question.required} rows={3} />
            ) : question.type === "SELECT" ? (
              <select defaultValue="" name={name} required={question.required}>
                <option disabled value="">{t("Choose an option")}</option>
                {question.options.map((option) => <option key={option} value={option}>{t(option)}</option>)}
              </select>
            ) : (
              <input autoComplete="off" maxLength={2000} name={name} required={question.required} />
            )}
          </label>
        );
      })}
      {state.error && <p className="public-registration-error" role="alert">{t(state.error)}</p>}
      <button className="button button-dark app-primary-button public-registration-submit" disabled={pending} type="submit">
        {pending && <LoaderCircle aria-hidden="true" className="feedback-spinner" size={15} />}
        {pending ? t("Registering...") : t("Register and get ticket")}
      </button>
      <p className="public-registration-privacy">{t("By registering, you agree to be contacted about this event.")}</p>
    </form>
  );
}
