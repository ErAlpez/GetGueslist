import type { Metadata } from "next";
import { MobileCheckinPairing, MobileCheckinSession } from "@/components/mobile-checkin";
import { getMobileCheckinAccess } from "@/lib/mobile-checkin";
import { getPrisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Phone Check-in",
  robots: { index: false, follow: false },
};

export default async function MobileCheckinPage() {
  const access = await getMobileCheckinAccess();

  if (!access) return <MobileCheckinPairing />;

  const checkpoints = await getPrisma().eventCheckpoint.findMany({
    where: { eventId: access.event.id, event: { workspaceId: access.workspaceId } },
    select: { id: true, name: true, claimedCount: true, capacity: true },
    orderBy: { sortOrder: "asc" },
  });

  return (
    <MobileCheckinSession
      checkpoints={checkpoints}
      deviceName={access.deviceName}
      eventId={access.event.id}
      eventName={access.event.name}
      expiresAt={access.sessionExpiresAt?.toISOString() ?? ""}
    />
  );
}
