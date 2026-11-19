import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { AttendeeForm } from "@/components/attendee-form";
import { getPrisma } from "@/lib/prisma";
import { getPreferences } from "@/lib/preferences";
import { localizeNode } from "@/lib/localization";
import { requireWorkspacePermission } from "@/lib/workspace";

type AddAttendeePageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function AddAttendeePage({ params }: AddAttendeePageProps) {
  const { locale } = await getPreferences();
  const { eventId } = await params;
  const context = await requireWorkspacePermission("attendees.manage", "/dashboard/attendees");
  const event = await getPrisma().event.findFirst({
    where: { id: eventId, workspaceId: context.workspace.id, archivedAt: null },
    select: { id: true, name: true },
  });
  if (!event) notFound();

  return localizeNode((
    <div className="event-editor-page">
      <div className="breadcrumbs"><Link href="/dashboard">Overview</Link><ArrowRight size={12} /><Link href={`/dashboard/attendees?event=${event.id}`}>Attendees</Link><ArrowRight size={12} /><span>Add guest</span></div>
      <div className="event-editor-heading"><div><div className="page-kicker">GUEST REGISTRATION</div><h1>Add a guest</h1><p>Manually register someone for {event.name}.</p></div></div>
      <AttendeeForm eventId={event.id} eventName={event.name} />
    </div>
  ), locale);
}
