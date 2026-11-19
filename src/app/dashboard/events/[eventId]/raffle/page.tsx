import { notFound } from "next/navigation";
import { LiveRafflePicker } from "@/components/live-raffle-picker";
import { getPrisma } from "@/lib/prisma";
import { requireWorkspacePermission } from "@/lib/workspace";
import "./raffle.css";

type RafflePageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function RafflePage({ params }: RafflePageProps) {
  const { eventId } = await params;
  const context = await requireWorkspacePermission("events.manage", `/dashboard/events/${encodeURIComponent(eventId)}`);
  const event = await getPrisma().event.findFirst({
    where: { id: eventId, workspaceId: context.workspace.id, archivedAt: null },
    select: { id: true, name: true },
  });
  if (!event) notFound();

  const [checkedInCount, eligible, draws] = await Promise.all([
    getPrisma().eventRegistration.count({
      where: {
        eventId,
        attendanceLogs: {
          some: { eventId, workspaceId: context.workspace.id, action: "CHECK_IN" },
        },
      },
    }),
    getPrisma().eventRegistration.findMany({
      where: {
        eventId,
        attendanceLogs: {
          some: { eventId, workspaceId: context.workspace.id, action: "CHECK_IN" },
        },
        raffleDraws: { none: { eventId } },
      },
      select: {
        id: true,
        attendee: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ attendee: { lastName: "asc" } }, { attendee: { firstName: "asc" } }],
    }),
    getPrisma().raffleDraw.findMany({
      where: { eventId },
      include: { registration: { include: { attendee: { select: { firstName: true, lastName: true } } } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <LiveRafflePicker
      checkedInCount={checkedInCount}
      eventId={event.id}
      eventName={event.name}
      initialEntries={eligible.map((registration) => ({
        id: registration.id,
        name: `${registration.attendee.firstName} ${registration.attendee.lastName}`,
      }))}
      initialWinners={draws.map((draw) => ({
        id: draw.registrationId,
        name: `${draw.registration.attendee.firstName} ${draw.registration.attendee.lastName}`,
        drawnAt: draw.createdAt.toISOString(),
      }))}
    />
  );
}
