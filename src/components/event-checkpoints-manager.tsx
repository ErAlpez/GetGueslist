"use client";

import { useActionState, useState } from "react";
import { useActionToastFeedback } from "@/components/toast-provider";
import { Check, Plus, Trash2 } from "lucide-react";
import { ConfirmButton } from "@/components/confirm-button";
import {
  createEventCheckpointAction,
  deleteEventCheckpointAction,
  updateEventCheckpointAction,
  type EventCheckpointState,
} from "@/app/dashboard/events/actions";
import { usePreferences } from "@/components/preferences-provider";
import { localizeNode } from "@/lib/localization";

export type EventCheckpointSummary = {
  id: string;
  name: string;
  capacity: number | null;
  claimedCount: number;
};

const checkpointErrors: Record<string, string> = {
  invalid: "Enter a checkpoint name of at least 2 characters and a valid positive capacity.",
  duplicate: "A checkpoint with that name already exists for this event.",
  capacity: "Capacity cannot be lower than the number of claims already recorded.",
  missing: "This checkpoint could not be found.",
};

function EventCheckpointEditForm({
  eventId,
  checkpoint,
}: {
  eventId: string;
  checkpoint: EventCheckpointSummary;
}) {
  const { locale } = usePreferences();
  const [state, formAction, pending] = useActionState<EventCheckpointState, FormData>(
    updateEventCheckpointAction,
    {},
  );
  useActionToastFeedback(pending, state);
  const [edited, setEdited] = useState(false);

  return localizeNode((
    <form
      action={formAction}
      className="event-checkpoint-edit"
      onChange={() => setEdited(true)}
      onSubmit={() => setEdited(false)}
    >
      <input name="eventId" type="hidden" value={eventId} />
      <input name="checkpointId" type="hidden" value={checkpoint.id} />
      <label className="form-field">
        <span className="sr-only">Name</span>
        <input defaultValue={checkpoint.name} maxLength={80} minLength={2} name="name" required />
      </label>
      <label className="form-field">
        <span className="sr-only">Capacity</span>
        <input defaultValue={checkpoint.capacity ?? ""} max={100000} min={1} name="capacity" placeholder="Unlimited" type="number" />
      </label>
      <div className="event-checkpoint-count">
        <strong>{checkpoint.claimedCount}</strong>
        <span>{checkpoint.capacity === null ? "claims · unlimited" : `of ${checkpoint.capacity} claimed`}</span>
      </div>
      <div className="event-checkpoint-actions">
        <button className="button button-light" disabled={pending} type="submit">
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {!edited && state.error && (
        <p className="event-checkpoint-save-feedback form-error" role="alert">
          {checkpointErrors[state.error] ?? "The checkpoint change could not be completed."}
        </p>
      )}
      {!edited && state.success && (
        <p className="event-checkpoint-save-feedback" role="status">Checkpoint saved.</p>
      )}
    </form>
  ), locale);
}

function EventCheckpointDeleteForm({
  eventId,
  checkpoint,
}: {
  eventId: string;
  checkpoint: EventCheckpointSummary;
}) {
  const { locale } = usePreferences();
  const [state, formAction, pending] = useActionState<EventCheckpointState, FormData>(
    deleteEventCheckpointAction,
    {},
  );
  useActionToastFeedback(pending, state);

  return localizeNode((
    <form action={formAction} className="event-checkpoint-delete">
      <input name="eventId" type="hidden" value={eventId} />
      <input name="checkpointId" type="hidden" value={checkpoint.id} />
      <ConfirmButton
        aria-label={`Delete ${checkpoint.name}`}
        className="button button-light danger-action"
        disabled={pending}
        message={`Delete “${checkpoint.name}” and its ${checkpoint.claimedCount} recorded claim(s)?`}
      >
        <Trash2 aria-hidden="true" size={14} />
      </ConfirmButton>
      {state.error && (
        <p className="event-checkpoint-delete-feedback form-error" role="alert">
          {checkpointErrors[state.error] ?? "The checkpoint change could not be completed."}
        </p>
      )}
    </form>
  ), locale);
}

export function EventCheckpointsManager({
  eventId,
  checkpoints,
  canManage,
  notice,
  error,
}: {
  eventId: string;
  checkpoints: EventCheckpointSummary[];
  canManage: boolean;
  notice?: string;
  error?: string;
}) {
  const { locale } = usePreferences();
  const [createState, createAction, creating] = useActionState<EventCheckpointState, FormData>(
    createEventCheckpointAction,
    {},
  );
  useActionToastFeedback(creating, createState);

  return localizeNode((
    <section aria-labelledby="event-checkpoints-heading" className="app-panel event-checkpoints-panel" id="checkpoints">
      <div className="panel-heading-row">
        <div>
          <h2 id="event-checkpoints-heading">Session, meal &amp; swag checkpoints</h2>
          <p>Use the same ticket QR to record one claim per guest at each checkpoint.</p>
        </div>
      </div>

      {notice === "created" && <p className="event-checkpoint-notice"><Check aria-hidden="true" size={14} /> Checkpoint created.</p>}
      {error && <p className="form-message form-error event-checkpoint-notice" role="alert">{checkpointErrors[error] ?? "The checkpoint change could not be completed."}</p>}

      {canManage && (
        <form action={createAction} className="event-checkpoint-create">
          <input name="eventId" type="hidden" value={eventId} />
          <label className="form-field">
            Checkpoint name
            <input maxLength={80} minLength={2} name="name" placeholder="Lunch claimed" required />
          </label>
          <label className="form-field">
            Capacity
            <input max={100000} min={1} name="capacity" placeholder="Unlimited" type="number" />
          </label>
          <button className="button button-dark app-primary-button" disabled={creating} type="submit">
            <Plus aria-hidden="true" size={14} /> {creating ? "Adding…" : "Add checkpoint"}
          </button>
          {createState.error && (
            <p className="event-checkpoint-save-feedback form-error" role="alert">
              {checkpointErrors[createState.error] ?? "The checkpoint change could not be completed."}
            </p>
          )}
          {createState.success && (
            <p className="event-checkpoint-save-feedback" role="status">Checkpoint added.</p>
          )}
        </form>
      )}

      {checkpoints.length ? (
        <div className="event-checkpoint-list">
          {checkpoints.map((checkpoint) => (
            <article className="event-checkpoint-card" key={checkpoint.id}>
              {canManage ? (
                <EventCheckpointEditForm checkpoint={checkpoint} eventId={eventId} />
              ) : (
                <div className="event-checkpoint-readonly">
                  <strong>{checkpoint.name}</strong>
                  <span>{checkpoint.claimedCount} {checkpoint.capacity === null ? "claims · unlimited" : `of ${checkpoint.capacity} claimed`}</span>
                </div>
              )}
              {canManage && (
                <EventCheckpointDeleteForm checkpoint={checkpoint} eventId={eventId} />
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="event-checkpoint-empty">No checkpoints yet. Add one for a meal, session, or item claim.</p>
      )}
      <p className="event-checkpoint-footnote">Guests must be checked in at the main entrance first. A full checkpoint rejects additional claims.</p>
    </section>
  ), locale);
}
