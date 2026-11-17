import Link from "next/link";
import { ArrowRight, ScanLine } from "lucide-react";
import { CheckInScanner } from "@/components/check-in-scanner";
import { CheckInEventSwitcher } from "@/components/check-in-event-switcher";
import { RecentCheckIns } from "@/components/recent-check-ins";
import { getPrisma } from "@/lib/prisma";
import { getPreferences } from "@/lib/preferences";
import { localizeNode } from "@/lib/localization";
import { requireWorkspaceContext } from "@/lib/workspace";
import "../plain-heading.css";

type CheckInPageProps = {
  searchParams: Promise<{ event?: string }>;
};

export default async function CheckInPage({ searchParams }: CheckInPageProps) {
  const { locale } = await getPreferences();
  const context = await requireWorkspaceContext();
  const { event: requestedEventId } = await searchParams;
  const prisma = getPrisma();
  const events = await prisma.event.findMany({
    where: { workspaceId: context.workspace.id, archivedAt: null, status: { notIn: ["COMPLETED", "CANCELLED"] } },
    select: { id: true, name: true, timezone: true },
    orderBy: { startsAt: "asc" },
  });
  const selectedEvent = events.find((event) => event.id === requestedEventId) ?? events[0] ?? null;
  const recentActivity = selectedEvent
    ? await prisma.attendanceLog.findMany({
        where: { workspaceId: context.workspace.id, eventId: selectedEvent.id, action: "CHECK_IN" },
        include: {
          registration: { include: { attendee: { select: { firstName: true, lastName: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
      })
    : [];
  const canCheckIn = ["OWNER", "ADMIN", "MANAGER", "CHECKIN"].includes(context.membership.role);

  return localizeNode((
    <div className="check-in-page">
      <div className="page-heading-row">
        <div><div className="page-kicker">EVENT OPERATIONS</div><h1>Check-in</h1><p>Validate tickets and keep a live record of arrivals.</p></div>
        {selectedEvent && <CheckInEventSwitcher events={events} selectedEvent={selectedEvent} />}
      </div>
      {!canCheckIn && <p className="form-message form-error">You don’t have permission to scan tickets in this workspace.</p>}
      {!selectedEvent ? (
        <section className="app-panel"><div className="empty-state"><span className="empty-state-icon"><ScanLine size={20} /></span><strong>No event ready for check-in</strong><p>Create an event and add guests to prepare tickets for scanning.</p><Link className="text-link" href="/dashboard/events/new">Create an event <ArrowRight size={14} /></Link></div></section>
      ) : canCheckIn ? (
        <>
          <CheckInScanner eventId={selectedEvent.id} />
          <RecentCheckIns
            key={selectedEvent.id}
            locale={locale}
            logs={recentActivity.map((log) => ({
              id: log.id,
              name: `${log.registration.attendee.firstName} ${log.registration.attendee.lastName}`,
              method: log.method.toUpperCase(),
              time: new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone: selectedEvent.timezone }).format(log.createdAt),
            }))}
          />
        </>
      ) : null}
    </div>
  ), locale);
}
