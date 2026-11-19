import Link from "next/link";
import { ArrowRight, ScanLine } from "lucide-react";
import { CheckInScanner } from "@/components/check-in-scanner";
import { PhoneScannerAccess } from "@/components/phone-scanner-access";
import { RecentCheckIns } from "@/components/recent-check-ins";
import { getPrisma } from "@/lib/prisma";
import { getPreferences } from "@/lib/preferences";
import { localizeNode } from "@/lib/localization";
import { requireWorkspaceSection } from "@/lib/workspace";
import { workspaceHasFeature } from "@/lib/plan-features";
import { workspaceRoleHasPermission } from "@/lib/workspace-roles";
import "../plain-heading.css";

type CheckInPageProps = {
  searchParams: Promise<{ event?: string }>;
};

export default async function CheckInPage({ searchParams }: CheckInPageProps) {
  const { locale } = await getPreferences();
  const context = await requireWorkspaceSection("check-in");
  const canViewCheckinActivity = workspaceHasFeature(context.subscription, "checkin_activity");
  const { event: requestedEventId } = await searchParams;
  const prisma = getPrisma();
  const events = await prisma.event.findMany({
    where: { workspaceId: context.workspace.id, archivedAt: null, status: { notIn: ["COMPLETED", "CANCELLED"] } },
    include: {
      modules: { where: { key: "nfc_check_in" }, select: { enabled: true } },
      checkpoints: { select: { id: true, name: true, claimedCount: true, capacity: true }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: { startsAt: "asc" },
  });
  const selectedEvent = events.find((event) => event.id === requestedEventId) ?? events[0] ?? null;
  const [recentCheckIns, latestClaimedRegistrations] = selectedEvent && canViewCheckinActivity
    ? await Promise.all([
        prisma.attendanceLog.findMany({
          where: { workspaceId: context.workspace.id, eventId: selectedEvent.id, action: "CHECK_IN" },
          include: {
            registration: {
              include: {
                attendee: { select: { firstName: true, lastName: true } },
                checkpointClaims: {
                  include: { checkpoint: { select: { name: true } } },
                  orderBy: { createdAt: "asc" },
                },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 8,
        }),
        prisma.checkpointClaim.groupBy({
          by: ["registrationId"],
          where: { checkpoint: { eventId: selectedEvent.id } },
          _max: { createdAt: true },
          orderBy: { _max: { createdAt: "desc" } },
          take: 8,
        }),
      ])
    : [[], []];
  const recentCheckInRegistrationIds = new Set(recentCheckIns.map((log) => log.registrationId));
  const additionalCheckInRegistrationIds = latestClaimedRegistrations
    .map((claim) => claim.registrationId)
    .filter((registrationId) => !recentCheckInRegistrationIds.has(registrationId));
  const claimCheckIns = selectedEvent && additionalCheckInRegistrationIds.length
    ? await prisma.attendanceLog.findMany({
        where: {
          workspaceId: context.workspace.id,
          eventId: selectedEvent.id,
          action: "CHECK_IN",
          registrationId: { in: additionalCheckInRegistrationIds },
        },
        include: {
          registration: {
            include: {
              attendee: { select: { firstName: true, lastName: true } },
              checkpointClaims: {
                include: { checkpoint: { select: { name: true } } },
                orderBy: { createdAt: "asc" },
              },
            },
          },
        },
      })
    : [];
  const checkInsByRegistration = new Map<string, (typeof recentCheckIns)[number]>();
  for (const log of [...recentCheckIns, ...claimCheckIns]) {
    const previous = checkInsByRegistration.get(log.registrationId);
    if (!previous || log.createdAt > previous.createdAt) {
      checkInsByRegistration.set(log.registrationId, log);
    }
  }
  function latestActivityAt(log: (typeof recentCheckIns)[number]) {
    return log.registration.checkpointClaims.reduce(
      (latest, claim) => claim.createdAt > latest ? claim.createdAt : latest,
      log.createdAt,
    );
  }
  const recentActivity = [...checkInsByRegistration.values()]
    .sort((a, b) => latestActivityAt(b).getTime() - latestActivityAt(a).getTime())
    .slice(0, 8);
  const canPairPhoneScanners = workspaceRoleHasPermission(context.membership.role, "checkin.pair_device");
  const canManagePhoneScanners = workspaceRoleHasPermission(context.membership.role, "workspace.manage");
  const canManageEvents = workspaceRoleHasPermission(context.membership.role, "events.manage");

  return localizeNode((
    <div className="check-in-page">
      {!selectedEvent && (
        <div className="page-heading-row">
          <div><div className="page-kicker">EVENT OPERATIONS</div><h1>Check-in</h1><p>Validate tickets and keep a live record of arrivals.</p></div>
        </div>
      )}
      {!selectedEvent ? (
        <section className="app-panel"><div className="empty-state"><span className="empty-state-icon"><ScanLine size={20} /></span><strong>No event ready for check-in</strong><p>{canManageEvents ? "Create an event and add guests to prepare tickets for scanning." : "An event must be created and prepared before check-in can begin."}</p>{canManageEvents && <Link className="text-link" href="/dashboard/events/new">Create an event <ArrowRight size={14} /></Link>}</div></section>
      ) : (
        <>
          <CheckInScanner
            key={`scanner-${selectedEvent.id}`}
            eventId={selectedEvent.id}
            events={events.map(({ id, name }) => ({ id, name }))}
            nfcEnabled={selectedEvent.modules.some((module) => module.enabled)}
            phoneScannerAccess={canPairPhoneScanners
              ? <PhoneScannerAccess canManageAccess={canManagePhoneScanners} eventId={selectedEvent.id} />
              : undefined}
            selectedEvent={{ id: selectedEvent.id, name: selectedEvent.name }}
            checkpoints={selectedEvent.checkpoints}
          />
          {canViewCheckinActivity ? (
            <RecentCheckIns
              key={`recent-checkins-${selectedEvent.id}`}
              locale={locale}
              logs={recentActivity.map((log) => ({
                id: log.id,
                name: `${log.registration.attendee.firstName} ${log.registration.attendee.lastName}`,
                method: log.method.toUpperCase(),
                checkpointClaims: log.registration.checkpointClaims.map((claim) => claim.checkpoint.name),
                time: new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone: selectedEvent.timezone }).format(latestActivityAt(log)),
              }))}
            />
          ) : (
            <section className="app-panel checkin-activity-locked">
              <strong>Recent check-in activity requires Max.</strong>
              <p>Upgrade your workspace plan to view the live check-in log.</p>
            </section>
          )}
        </>
      )}
    </div>
  ), locale);
}
