import type { Metadata } from "next";
import { MobileCheckinPairing, MobileCheckinSession } from "@/components/mobile-checkin";
import { getMobileCheckinAccess } from "@/lib/mobile-checkin";

export const metadata: Metadata = {
  title: "Phone Check-in",
  robots: { index: false, follow: false },
};

export default async function MobileCheckinPage() {
  const access = await getMobileCheckinAccess();

  if (!access) return <MobileCheckinPairing />;

  return (
    <MobileCheckinSession
      deviceName={access.deviceName}
      eventId={access.event.id}
      eventName={access.event.name}
      expiresAt={access.sessionExpiresAt?.toISOString() ?? ""}
    />
  );
}
