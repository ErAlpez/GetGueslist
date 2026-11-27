"use client";

import { useActionState, useState } from "react";
import { useActionToastFeedback } from "@/components/toast-provider";
import Link from "next/link";
import { ArrowLeft, ArrowRight, LoaderCircle } from "lucide-react";
import { createEventAction, updateEventAction, type EventFormState } from "@/app/dashboard/events/actions";
import { EventDateTime } from "@/components/event-date-time";
import { usePreferences } from "@/components/preferences-provider";
import { localizeNode } from "@/lib/localization";

const initialState: EventFormState = {};

export type EventFormValues = {
  name: string;
  description: string;
  category: string;
  type: string;
  format: string;
  visibility: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  venue: string;
  address: string;
  capacity: string;
  registrationDeadline: string;
  organizerName: string;
  contactEmail: string;
  contactPhone: string;
};

const categories = ["Conference", "Workshop", "Meetup", "Social", "Corporate", "Other"];
const timezones = ["Asia/Manila", "UTC", "America/Los_Angeles", "America/New_York", "Europe/London", "Asia/Singapore"];

const emptyValues: EventFormValues = {
  name: "", description: "", category: "", type: "", format: "PHYSICAL", visibility: "PRIVATE",
  startsAt: "", endsAt: "", timezone: "Asia/Manila", venue: "", address: "", capacity: "",
  registrationDeadline: "", organizerName: "", contactEmail: "", contactPhone: "",
};

export function EventForm({ event }: { event?: { id: string; updatedAt: string; values: EventFormValues } }) {
  const { locale } = usePreferences();
  const [values, setValues] = useState(event?.values ?? emptyValues);
  const action = event ? updateEventAction.bind(null, event.id, event.updatedAt) : createEventAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  useActionToastFeedback(pending, state);
  function setValue(name: keyof EventFormValues, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
  }

  return localizeNode((
    <form action={formAction} className="event-form">
      {state.error && <p aria-live="polite" className="form-message form-error">{state.error}</p>}
      <section className="form-section">
        <div className="form-section-heading"><span>01</span><div><h2>Event details</h2><p>Give your event a name and a clear description.</p></div></div>
        <div className="form-grid">
          <label className="form-field form-field-wide">Event name <input maxLength={120} name="name" onChange={(e) => setValue("name", e.target.value)} placeholder="e.g. Community founders breakfast" required value={values.name} /></label>
          <label className="form-field form-field-wide">Description <textarea maxLength={10000} name="description" onChange={(e) => setValue("description", e.target.value)} placeholder="What should guests know about this event?" rows={4} value={values.description} /></label>
          <label className="form-field">Category <select name="category" onChange={(e) => setValue("category", e.target.value)} required value={values.category}><option disabled value="">Choose category</option>{values.category && !categories.includes(values.category) && <option value={values.category}>{values.category}</option>}{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
          <label className="form-field">Event type <input name="type" onChange={(e) => setValue("type", e.target.value)} placeholder="e.g. Networking" required value={values.type} /></label>
          <label className="form-field">Format <select name="format" onChange={(e) => setValue("format", e.target.value)} value={values.format}><option value="PHYSICAL">Physical</option><option value="VIRTUAL">Virtual</option><option value="HYBRID">Hybrid</option></select></label>
          <label className="form-field">Visibility <select name="visibility" onChange={(e) => setValue("visibility", e.target.value)} value={values.visibility}><option value="PUBLIC">Public</option><option value="PRIVATE">Private</option><option value="INVITE_ONLY">Invite-only</option></select></label>
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-heading"><span>02</span><div><h2>When & where</h2><p>Set the timing and location. You can update these later.</p></div></div>
        <div className="form-grid">
          <EventDateTime defaultTime="00:00" initialValue={values.startsAt} label="Starts" name="startsAt" required />
          <EventDateTime defaultTime="23:59" initialValue={values.endsAt} label="Ends" name="endsAt" required />
          <label className="form-field">Timezone <select name="timezone" onChange={(e) => setValue("timezone", e.target.value)} value={values.timezone}>{!timezones.includes(values.timezone) && <option value={values.timezone}>{values.timezone}</option>}<option value="Asia/Manila">Asia/Manila (PHT)</option><option value="UTC">UTC</option><option value="America/Los_Angeles">America/Los_Angeles</option><option value="America/New_York">America/New_York</option><option value="Europe/London">Europe/London</option><option value="Asia/Singapore">Asia/Singapore</option></select></label>
          <label className="form-field">Venue <input name="venue" onChange={(e) => setValue("venue", e.target.value)} placeholder="Venue name or online" value={values.venue} /></label>
          <label className="form-field form-field-wide">Address <input name="address" onChange={(e) => setValue("address", e.target.value)} placeholder="Street address or virtual event link" value={values.address} /></label>
          <label className="form-field">Capacity <input min="1" name="capacity" onChange={(e) => setValue("capacity", e.target.value)} placeholder="No limit" type="number" value={values.capacity} /></label>
          <EventDateTime defaultTime="23:59" initialValue={values.registrationDeadline} label="Registration deadline" name="registrationDeadline" />
        </div>
      </section>

      <section className="form-section">
        <div className="form-section-heading"><span>03</span><div><h2>Organizer & contact</h2><p>How guests can reach the event organizer.</p></div></div>
        <div className="form-grid">
          <label className="form-field">Organizer <input name="organizerName" onChange={(e) => setValue("organizerName", e.target.value)} placeholder="Organizer name" value={values.organizerName} /></label>
          <label className="form-field">Contact email <input name="contactEmail" onChange={(e) => setValue("contactEmail", e.target.value)} placeholder="events@company.com" type="email" value={values.contactEmail} /></label>
          <label className="form-field">Contact phone <input name="contactPhone" onChange={(e) => setValue("contactPhone", e.target.value)} placeholder="+63 900 000 0000" type="tel" value={values.contactPhone} /></label>
        </div>
      </section>

      <div className="event-form-actions">
        <Link className="form-cancel" href={event ? `/dashboard/events/${event.id}` : "/dashboard/events"}><ArrowLeft size={14} /> Cancel</Link>
        <button className="button button-dark app-primary-button" disabled={pending} type="submit">{pending ? <LoaderCircle className="spin" size={14} /> : null} {event ? "Save changes" : "Save as draft"} {!pending && <ArrowRight size={14} />}</button>
      </div>
    </form>
  ), locale);
}
