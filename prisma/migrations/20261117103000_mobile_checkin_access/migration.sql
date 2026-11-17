CREATE TABLE "MobileCheckinAccess" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "deviceName" TEXT NOT NULL,
  "pairingTokenHash" TEXT NOT NULL,
  "pairingExpiresAt" TIMESTAMP(3) NOT NULL,
  "pairedAt" TIMESTAMP(3),
  "sessionTokenHash" TEXT,
  "sessionExpiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MobileCheckinAccess_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MobileCheckinAccess_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MobileCheckinAccess_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MobileCheckinAccess_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MobileCheckinAccess_pairingTokenHash_key" ON "MobileCheckinAccess"("pairingTokenHash");
CREATE UNIQUE INDEX "MobileCheckinAccess_sessionTokenHash_key" ON "MobileCheckinAccess"("sessionTokenHash");
CREATE INDEX "MobileCheckinAccess_workspaceId_eventId_revokedAt_idx" ON "MobileCheckinAccess"("workspaceId", "eventId", "revokedAt");
CREATE INDEX "MobileCheckinAccess_pairingExpiresAt_idx" ON "MobileCheckinAccess"("pairingExpiresAt");
CREATE INDEX "MobileCheckinAccess_sessionExpiresAt_idx" ON "MobileCheckinAccess"("sessionExpiresAt");
