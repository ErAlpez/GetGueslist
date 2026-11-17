import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { EventForm } from "@/components/event-form";
import { getPreferences } from "@/lib/preferences";
import { localizeNode } from "@/lib/localization";

export default async function NewEventPage() {
  const { locale } = await getPreferences();
  return localizeNode((
    <div className="event-editor-page">
      <div className="breadcrumbs"><Link href="/dashboard">Overview</Link><ChevronRight size={13} /><Link href="/dashboard/events">My events</Link><ChevronRight size={13} /><span>New event</span></div>
      <div className="event-editor-heading"><div><div className="page-kicker">EVENT SETUP</div><h1>Create an event</h1><p>Start with the essentials. You can add guests and configure modules next.</p></div></div>
      <EventForm />
    </div>
  ), locale);
}
