import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { EventForm, type EventFormValues } from "@/components/event-form";
import { utcToLocalDateTime } from "@/lib/datetime";
import { localizeNode } from "@/lib/localization";
import { getPreferences } from "@/lib/preferences";
import { getPrisma } from "@/lib/prisma";
import { requireWorkspaceContext } from "@/lib/workspace";

export default async function EditEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const [{ locale }, context] = await Promise.all([getPreferences(), requireWorkspaceContext()]);
  if (!["OWNER", "ADMIN", "MANAGER"].includes(context.membership.role)) {
    redirect(`/dashboard/events/${encodeURIComponent(eventId)}?error=permission`);
  }
  const event = await getPrisma().event.findFirst({
    where: { id: eventId, workspaceId: context.workspace.id, archivedAt: null },
  });
  if (!event) notFound();

  const values: EventFormValues = {
    name: event.name,
    description: event.description,
    category: event.category,
    type: event.type,
    format: event.format,
    visibility: event.visibility,
    startsAt: utcToLocalDateTime(event.startsAt, event.timezone),
    endsAt: utcToLocalDateTime(event.endsAt, event.timezone),
    timezone: event.timezone,
    venue: event.venue ?? "",
    address: event.address ?? "",
    capacity: event.capacity?.toString() ?? "",
    registrationDeadline: event.registrationDeadline ? utcToLocalDateTime(event.registrationDeadline, event.timezone) : "",
    organizerName: event.organizerName ?? "",
    contactEmail: event.contactEmail ?? "",
    contactPhone: event.contactPhone ?? "",
  };

  return localizeNode((
    <div className="event-editor-page">
      <div className="breadcrumbs"><Link href="/dashboard">Overview</Link><ChevronRight size={13} /><Link href="/dashboard/events">My events</Link><ChevronRight size={13} /><Link href={`/dashboard/events/${event.id}`}>{event.name}</Link><ChevronRight size={13} /><span>Edit event</span></div>
      <div className="event-editor-heading"><div><div className="page-kicker">EVENT SETUP</div><h1>Edit event</h1><p>Update your event details, timing, and contact information.</p></div></div>
      <EventForm event={{ id: event.id, updatedAt: event.updatedAt.toISOString(), values }} />
    </div>
  ), locale);
}
