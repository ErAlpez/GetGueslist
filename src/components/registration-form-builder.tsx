"use client";

import { useActionState, useRef, useState } from "react";
import { Check, ChevronDown, ClipboardList, Copy, ExternalLink, LoaderCircle, LockKeyhole, MessageCircle, Plus, Save, Trash2 } from "lucide-react";
import {
  saveRegistrationFormAction,
  type RegistrationFormState,
} from "@/app/dashboard/events/actions";
import { usePreferences } from "@/components/preferences-provider";
import { EventLogoForm } from "@/components/event-logo-form";
import { FormSaveSuccess } from "@/components/form-save-success";
import { ConfirmButton } from "@/components/confirm-button";
import {
  isRegistrationQuestionType,
  registrationQuestionTypes,
  type RegistrationQuestionDraft,
} from "@/lib/registration-form";
import "./registration-form-builder.css";

const initialState: RegistrationFormState = {};
const maxQuestions = 12;

const questionTypeLabels = {
  SHORT_TEXT: "Short answer",
  LONG_TEXT: "Long answer",
  SELECT: "Multiple choice",
  CHECKBOX: "Yes / no checkbox",
} as const;

export function RegistrationFormBuilder({
  eventId,
  registrationUrl,
  logo,
  questions: initialQuestions = [],
  canShareRegistration,
  canCustomForms,
  canBranding,
}: {
  eventId: string;
  registrationUrl: string;
  logo: string | null;
  questions?: RegistrationQuestionDraft[];
  canShareRegistration: boolean;
  canCustomForms: boolean;
  canBranding: boolean;
}) {
  const { t } = usePreferences();
  const [questions, setQuestions] = useState(() => (Array.isArray(initialQuestions) ? initialQuestions : []).map((question, index) => ({
    ...question,
    localKey: `initial-${index}`,
  })));
  const nextQuestionKey = useRef(0);
  const [state, formAction, pending] = useActionState(saveRegistrationFormAction, initialState);
  const [edited, setEdited] = useState(false);
  const [linkFeedback, setLinkFeedback] = useState("");
  const registrationPath = `/register/${eventId}`;

  async function copyRegistrationLink() {
    setLinkFeedback("");
    try {
      await navigator.clipboard.writeText(registrationUrl);
      setLinkFeedback(t("Registration link copied."));
    } catch {
      setLinkFeedback(t("Copy failed; select and copy the registration link."));
    }
  }

  function updateQuestion(index: number, patch: Partial<RegistrationQuestionDraft>) {
    setEdited(true);
    setQuestions((current) => current.map((question, questionIndex) =>
      questionIndex === index ? { ...question, ...patch } : question,
    ));
  }

  function addQuestion() {
    setEdited(true);
    const localKey = `new-${nextQuestionKey.current++}`;
    setQuestions((current) => current.length >= maxQuestions
      ? current
      : [...current, { label: "", type: "SHORT_TEXT", required: false, options: [], localKey }],
    );
  }

  function removeQuestion(index: number) {
    setEdited(true);
    setQuestions((current) => current.filter((_, questionIndex) => questionIndex !== index));
  }

  const serializedQuestions = JSON.stringify(questions.map(({ id, label, type, required, options }) => ({
    ...(id ? { id } : {}),
    label,
    type,
    required,
    options,
  })));

  return (
    <section aria-labelledby="registration-form-heading" className="app-panel registration-form-builder-panel" id="registration-form" tabIndex={-1}>
      <div className="panel-heading-row">
        <div>
          <h2 id="registration-form-heading">{t("Registration form")}</h2>
          <p>{t("Customize the questions guests answer when they register for this event.")}</p>
        </div>
        <ClipboardList aria-hidden="true" size={16} />
      </div>
      <div className="registration-builder-columns">
        <div className="registration-builder-left">
          <div className="registration-share-panel">
            <div className="registration-share-copy">
              <strong>{t("Share registration form")}</strong>
              <p>{canShareRegistration
                ? t("Guests can register themselves")
                : t("Publish the event and enable registrations to make the link available.")}</p>
            </div>
            {canShareRegistration && (
              <>
                <div className="registration-share-controls">
                  <input aria-label={t("Registration link")} readOnly value={registrationUrl} />
                  <button className="button button-light" onClick={copyRegistrationLink} type="button">
                    {linkFeedback === t("Registration link copied.") ? <Check size={13} /> : <Copy size={13} />}
                    {t("Copy link")}
                  </button>
                  <a aria-label={t("Open registration form")} className="button button-light" href={registrationPath} rel="noreferrer" target="_blank">
                    <ExternalLink size={13} />
                  </a>
                </div>
                {linkFeedback && <p aria-live="polite" className="registration-share-feedback">{linkFeedback}</p>}
              </>
            )}
          </div>
          {canBranding ? (
            <EventLogoForm eventId={eventId} key={eventId} logo={logo} />
          ) : (
            <div className="plan-feature-lock">
              <span><LockKeyhole aria-hidden="true" size={15} /></span>
              <div><strong>Event branding is locked</strong><p>Upgrade to Starter or a higher plan to add and remove an event logo.</p></div>
            </div>
          )}
        </div>
        {canCustomForms ? (
        <form action={formAction} className="registration-form-builder" onSubmit={() => setEdited(false)}>
          <input name="eventId" type="hidden" value={eventId} />
          <input name="questions" type="hidden" value={serializedQuestions} />
          {state.error && <p aria-live="polite" className="form-message form-error">{t(state.error)}</p>}
          <p className="registration-builder-note">{t("First name, last name, email, phone, and category are included automatically. Your custom questions are unique to this event.")}</p>
          <p className="registration-builder-note">{t("Age and gender are optional.")}</p>
          {questions.length ? (
            <div className="registration-question-list">
              {questions.map((question, index) => (
                <article className="registration-question-editor" key={question.localKey}>
                  <details open={!question.id}>
                    <summary className="registration-question-editor-heading">
                      <strong>{t("Question")} {index + 1}</strong>
                      {question.locked && <span className="registration-response-badge"><MessageCircle aria-hidden="true" size={12} />{t("Has responses")}</span>}
                      {question.label && <small className="registration-question-title">{question.label}</small>}
                      <ChevronDown aria-hidden="true" className="registration-question-chevron" size={16} />
                    </summary>
                    <div className="registration-question-body">
                      <label className="form-field">
                        {t("Question label")}
                        <input
                          disabled={question.locked}
                          maxLength={160}
                          onChange={(event) => updateQuestion(index, { label: event.target.value })}
                          value={question.label}
                        />
                      </label>
                      <div className="registration-question-options">
                        <label className="form-field">
                          {t("Answer type")}
                          <select
                            disabled={question.locked}
                            onChange={(event) => {
                              if (!isRegistrationQuestionType(event.target.value)) return;
                              const type = event.target.value;
                              updateQuestion(index, {
                                type,
                                options: type === "SELECT" ? (question.options.length ? question.options : ["", ""]) : [],
                              });
                            }}
                            value={question.type}
                          >
                            {registrationQuestionTypes.map((type) => (
                              <option key={type} value={type}>{t(questionTypeLabels[type])}</option>
                            ))}
                          </select>
                        </label>
                        <label className="registration-question-required">
                          <input
                            checked={question.required}
                            disabled={question.locked}
                            onChange={(event) => updateQuestion(index, { required: event.target.checked })}
                            type="checkbox"
                          />
                          {t("Required")}
                        </label>
                      </div>
                      {question.type === "SELECT" && (
                        <label className="form-field">
                          {t("Options (one per line)")}
                          <textarea
                            disabled={question.locked}
                            onChange={(event) => updateQuestion(index, {
                              options: event.target.value.split(/\r?\n/).map((option) => option.trim()),
                            })}
                            rows={3}
                            value={question.options.join("\n")}
                          />
                        </label>
                      )}
                    </div>
                  </details>
                  <ConfirmButton
                    aria-label={`${t("Remove question")} ${index + 1}`}
                    className="registration-question-remove"
                    disabled={question.locked}
                    message="Remove this question from the registration form?"
                    onClick={() => removeQuestion(index)}
                    type="button"
                  >
                    <Trash2 size={13} />
                  </ConfirmButton>
                </article>
              ))}
            </div>
          ) : (
            <div className="registration-builder-empty">{t("No custom questions yet. Add one to collect more details from guests.")}</div>
          )}
          <div className="registration-builder-actions">
            <button
              className="button button-light registration-add-question"
              disabled={questions.length >= maxQuestions}
              onClick={addQuestion}
              type="button"
            >
              <Plus size={14} /> {t("Add question")}
            </button>
            <div className="form-save-actions">
              {state.success && !edited && !pending && <FormSaveSuccess message={t(state.success)} />}
              <button className="button button-dark app-primary-button" disabled={pending} type="submit">
                {pending ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}
                {t("Save registration form")}
              </button>
            </div>
          </div>
        </form>
        ) : (
          <div className="plan-feature-lock plan-feature-lock-wide">
            <span><LockKeyhole aria-hidden="true" size={16} /></span>
            <div><strong>Custom registration questions are locked</strong><p>Upgrade to Starter or a higher plan to add, edit, and save custom questions.</p></div>
          </div>
        )}
      </div>
    </section>
  );
}
