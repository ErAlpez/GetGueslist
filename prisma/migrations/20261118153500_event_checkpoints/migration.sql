CREATE TABLE "EventCheckpoint" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "capacity" INTEGER,
  "claimedCount" INTEGER NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EventCheckpoint_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CheckpointClaim" (
  "id" TEXT NOT NULL,
  "checkpointId" TEXT NOT NULL,
  "registrationId" TEXT NOT NULL,
  "operatorId" TEXT,
  "deviceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CheckpointClaim_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EventCheckpoint_eventId_name_key" ON "EventCheckpoint"("eventId", "name");
CREATE INDEX "EventCheckpoint_eventId_sortOrder_idx" ON "EventCheckpoint"("eventId", "sortOrder");
CREATE UNIQUE INDEX "CheckpointClaim_checkpointId_registrationId_key" ON "CheckpointClaim"("checkpointId", "registrationId");
CREATE INDEX "CheckpointClaim_registrationId_createdAt_idx" ON "CheckpointClaim"("registrationId", "createdAt");

ALTER TABLE "EventCheckpoint"
  ADD CONSTRAINT "EventCheckpoint_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CheckpointClaim"
  ADD CONSTRAINT "CheckpointClaim_checkpointId_fkey"
  FOREIGN KEY ("checkpointId") REFERENCES "EventCheckpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CheckpointClaim_registrationId_fkey"
  FOREIGN KEY ("registrationId") REFERENCES "EventRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "CheckpointClaim_operatorId_fkey"
  FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
