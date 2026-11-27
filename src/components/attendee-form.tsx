"use client";

import { useActionState } from "react";
import { useActionToastFeedback } from "@/components/toast-provider";
import Link from "next/link";
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import { registerAttendeeAction, type AttendeeFormState } from "@/app/dashboard/attendees/actions";
import { usePreferences } from "@/components/preferences-provider";
import { localizeNode } from "@/lib/localization";
import { attendeeCategories, attendeeCategoryLabels } from "@/lib/attendee-categories";

const initialState: AttendeeFormState = {};

export function AttendeeForm({ eventId, eventName }: { eventId: string; eventName: string }) {
  const { locale } = usePreferences();
  const [state, formAction, pending] = useActionState(registerAttendeeAction, initialState);
  useActionToastFeedback(pending, state);

  return localizeNode((
    <form action={formAction} className="event-form">
      <input name="eventId" type="hidden" value={eventId} />
      {state.error && <p aria-live="polite" className="form-message form-error">{state.error}</p>}
      <section className="form-section">
        <div className="form-section-heading"><span>01</span><div><h2>Guest details</h2><p>Adding a guest to {eventName}.</p></div></div>
        <div className="form-grid">
          <label className="form-field">First name <input autoComplete="given-name" maxLength={100} name="firstName" required /></label>
          <label className="form-field">Last name <input autoComplete="family-name" maxLength={100} name="lastName" required /></label>
          <label className="form-field">Email address <input autoComplete="email" name="email" required type="email" /></label>
          <label className="form-field">Phone number <input autoComplete="tel" name="phone" type="tel" /></label>
          <label className="form-field">Age <input max={150} min={0} name="age" step={1} type="number" /></label>
          <label className="form-field">Gender <select defaultValue="" name="gender"><option value="">Choose an option</option><option value="MALE">Male</option><option value="FEMALE">Female</option></select></label>
          <label className="form-field">Category <select defaultValue="GENERAL" name="category">{attendeeCategories.map((category) => <option key={category} value={category}>{attendeeCategoryLabels[category]}</option>)}</select></label>
        </div>
      </section>
      <p className="ticket-issue-note">A unique QR ticket will be created for this guest.</p>
      <div className="event-form-actions">
        <Link className="form-cancel" href={`/dashboard/attendees?event=${eventId}`}><ArrowLeft size={14} /> Back to attendees</Link>
        <button className="button button-dark app-primary-button" disabled={pending} type="submit">{pending ? <LoaderCircle className="spin" size={14} /> : null} Add guest {!pending && <ArrowRight size={14} />}</button>
      </div>
    </form>
  ), locale);
}
