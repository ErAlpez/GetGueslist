"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateToast, useActionToastFeedback } from "@/components/toast-provider";
import { Check, LoaderCircle, Mail, Nfc, Settings2, Utensils, CalendarClock, UserCheck } from "lucide-react";
import { beginBackgroundJobToast, watchBackgroundJob } from "@/components/background-job-toast";
import {
  sendEventInvitationsAction,
  updateEventModuleAction,
  type EventModuleState,
} from "@/app/dashboard/events/actions";
import { EventDateTime } from "@/components/event-date-time";

const initialState: EventModuleState = {};

type Module = {
  id: string;
  key: string;
  enabled: boolean;
  settings: unknown;
};

function readSettings(settings: unknown) {
  return settings && typeof settings === "object" && !Array.isArray(settings)
    ? settings as Record<string, unknown>
    : {};
}

function readStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").join("\n") : "";
}

const moduleMeta = {
  invitations: { label: "Invitations", icon: Mail, description: "Send registration invitations to a guest list." },
  rsvp: { label: "RSVP", icon: UserCheck, description: "Collect attendance responses and changes." },
  meals: { label: "Meals", icon: Utensils, description: "Offer meal choices during registration." },
  nfc_check_in: { label: "NFC check-in", icon: Nfc, description: "Enable NFC ticket scanning with Web NFC or an external reader." },
  sessions: { label: "Sessions", icon: CalendarClock, description: "Organize the event into named time sessions." },
} as const;

export function EventModulesManager({
  eventId,
  modules,
  canManage,
}: {
  eventId: string;
  modules: Module[];
  canManage: boolean;
}) {
  return (
    <div className="event-modules-manager">
      {(["invitations", "rsvp", "meals", "nfc_check_in", "sessions"] as const).map((key) => {
        const moduleRecord = modules.find((item) => item.key === key);
        return (
          <ModuleCard
            key={key}
            canManage={canManage}
            eventId={eventId}
            moduleRecord={moduleRecord ?? { id: "", key, enabled: false, settings: {} }}
          />
        );
      })}
    </div>
  );
}

function ModuleCard({
  eventId,
  moduleRecord,
  canManage,
}: {
  eventId: string;
  moduleRecord: Module;
  canManage: boolean;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updateEventModuleAction, initialState);
  useActionToastFeedback(pending, state);
  const [sending, startSending] = useTransition();
  const [invitationJobRunning, setInvitationJobRunning] = useState(false);
  const [invitationError, setInvitationError] = useState("");
  const [enabled, setEnabled] = useState(moduleRecord.enabled);
  const settings = readSettings(moduleRecord.settings);
  const meta = moduleMeta[moduleRecord.key as keyof typeof moduleMeta];
  const Icon = meta.icon;
  const [rsvpMaybe, setRsvpMaybe] = useState(settings.allowMaybe !== false);
  const [rsvpDeadline, setRsvpDeadline] = useState(typeof settings.deadline === "string" ? settings.deadline : "");
  const [mealOptions, setMealOptions] = useState(readStringList(settings.options));
  const [sessions, setSessions] = useState(
    typeof settings.sessionsJson === "string"
      ? settings.sessionsJson
      : Array.isArray(settings.sessions)
        ? JSON.stringify(settings.sessions, null, 2)
        : "[]",
  );
  const [recipients, setRecipients] = useState(readStringList(settings.recipients));
  const [subject, setSubject] = useState(typeof settings.subject === "string" ? settings.subject : "You’re invited");
  const [message, setMessage] = useState(typeof settings.message === "string" ? settings.message : "");

  let serializedSettings = "{}";
  if (moduleRecord.key === "rsvp") serializedSettings = JSON.stringify({ allowMaybe: rsvpMaybe, deadline: rsvpDeadline });
  if (moduleRecord.key === "meals") serializedSettings = JSON.stringify({
    options: mealOptions.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean).slice(0, 20),
  });
  if (moduleRecord.key === "sessions") serializedSettings = JSON.stringify({ sessionsJson: sessions });
  if (moduleRecord.key === "nfc_check_in") serializedSettings = JSON.stringify({ mode: "web_nfc_or_keyboard_reader", enabledAt: enabled ? new Date().toISOString() : null });
  if (moduleRecord.key === "invitations") serializedSettings = JSON.stringify({
    recipients: recipients.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean),
    subject,
    message,
  });

  return (
    <article className={`event-module-card${enabled ? " enabled" : ""}`}>
      <div className="event-module-heading">
        <span className="event-module-icon"><Icon aria-hidden="true" size={16} /></span>
        <span><strong>{meta.label}</strong><small>{meta.description}</small></span>
        {canManage ? (
          <button
            aria-label={`${enabled ? "Disable" : "Enable"} ${meta.label}`}
            aria-pressed={enabled}
            className={`module-switch${enabled ? " enabled" : ""}`}
            onClick={() => setEnabled((value) => !value)}
            type="button"
          >
            <span>{enabled && <Check aria-hidden="true" size={10} />}</span>
          </button>
        ) : <span className="status-pill">{enabled ? "Enabled" : "Not enabled"}</span>}
      </div>

      {canManage && enabled && (
        <div className="event-module-config">
          {moduleRecord.key === "rsvp" && (
            <>
              <EventDateTime initialValue={rsvpDeadline} label="RSVP deadline" onValueChange={setRsvpDeadline} />
              <label className="registration-question-required"><input checked={rsvpMaybe} onChange={(event) => setRsvpMaybe(event.target.checked)} type="checkbox" /> Allow “Maybe” responses</label>
            </>
          )}
          {moduleRecord.key === "meals" && (
            <label className="form-field">Meal choices<textarea rows={4} value={mealOptions} onChange={(event) => setMealOptions(event.target.value)} placeholder={"Vegetarian\nVegan\nChicken\nFish"} /></label>
          )}
          {moduleRecord.key === "sessions" && (
            <label className="form-field">Sessions JSON<textarea rows={6} value={sessions} onChange={(event) => setSessions(event.target.value)} /><small>Example: [{`{"name":"Welcome","startsAt":"2026-12-01T09:00","endsAt":"2026-12-01T09:30"}`}]</small></label>
          )}
          {moduleRecord.key === "nfc_check_in" && <p className="event-module-hint">Use Web NFC on supported Android browsers, or a USB/Bluetooth reader in keyboard mode on Mac. Mac readers are detected when they type a ticket URL or token followed by Enter (not just the tag UID). QR and manual check-in remain available.</p>}
          {moduleRecord.key === "invitations" && (
            <>
              <label className="form-field">Guest email recipients<textarea rows={5} value={recipients} onChange={(event) => setRecipients(event.target.value)} placeholder={"guest@example.com\nguests@example.com"} /></label>
              <label className="form-field">Email subject<input maxLength={160} value={subject} onChange={(event) => setSubject(event.target.value)} /></label>
              <label className="form-field">Message<textarea rows={4} value={message} onChange={(event) => setMessage(event.target.value)} /></label>
            </>
          )}
        </div>
      )}

      {canManage && enabled && moduleRecord.key === "invitations" && (
        <form
          className="event-module-send"
          onSubmit={(event) => {
            event.preventDefault();
            if (sending || invitationJobRunning) return;
            setInvitationError("");
            const toastId = beginBackgroundJobToast("Sending event invitations...");
            const formData = new FormData(event.currentTarget);
            startSending(async () => {
              try {
                const queued = await sendEventInvitationsAction(initialState, formData);
                if (queued.error) {
                  updateToast(toastId, queued.error, "error");
                  setInvitationError(queued.error);
                  return;
                }
                if (!queued.jobId) throw new Error("Could not queue event invitations.");
                setInvitationJobRunning(true);
                void watchBackgroundJob(queued.jobId, toastId, (job) => {
                  const result = readInvitationResult(job.result);
                  if (!result) return "Event invitations sent.";
                  return `Sent ${result.sentCount} event invitation${result.sentCount === 1 ? "" : "s"}${result.failedCount ? `; ${result.failedCount} failed` : ""}.`;
                }).then((job) => {
                  if (job.status === "COMPLETED") router.refresh();
                  else setInvitationError(job.error ?? "Could not send event invitations.");
                }).catch((error: unknown) => {
                  setInvitationError(error instanceof Error ? error.message : "Could not check the invitation job.");
                }).finally(() => setInvitationJobRunning(false));
              } catch (error) {
                console.error("Could not queue event invitations:", error);
                const message = "Could not queue event invitations. Please try again.";
                updateToast(toastId, message, "error");
                setInvitationError(message);
              }
            });
          }}
        >
          <input name="eventId" type="hidden" value={eventId} />
          <input name="recipients" type="hidden" value={recipients.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean).join("\n")} />
          <input name="subject" type="hidden" value={subject} />
          <input name="message" type="hidden" value={message} />
          <button className="button button-dark app-primary-button" data-toast-managed="true" disabled={sending || invitationJobRunning} type="submit">
            {sending || invitationJobRunning ? <LoaderCircle className="spin" size={13} /> : <Mail size={13} />} Send invitations
          </button>
          {invitationError && <p className="form-message form-error" role="alert">{invitationError}</p>}
        </form>
      )}

      {canManage && (enabled || moduleRecord.enabled) && (
        <form action={formAction} className="event-module-save">
          <input name="eventId" type="hidden" value={eventId} />
          <input name="moduleKey" type="hidden" value={moduleRecord.key} />
          <input name="enabled" type="hidden" value={enabled ? "true" : "false"} />
          <input name="settings" type="hidden" value={serializedSettings} />
          <button className="button button-dark app-primary-button" disabled={pending} type="submit">
            {pending ? <LoaderCircle className="spin" size={13} /> : <Settings2 size={13} />} Save module
          </button>
          {state.error && <p className="form-message form-error" role="alert">{state.error}</p>}
        </form>
      )}
    </article>
  );
}

function readInvitationResult(value: unknown): { sentCount: number; failedCount: number } | null {
  if (typeof value !== "object" || value === null || !("sentCount" in value) || !("failedCount" in value)) return null;
  return typeof value.sentCount === "number" && typeof value.failedCount === "number"
    ? { sentCount: value.sentCount, failedCount: value.failedCount }
    : null;
}
