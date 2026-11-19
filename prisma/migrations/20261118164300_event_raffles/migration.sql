CREATE TABLE "RaffleDraw" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "registrationId" TEXT NOT NULL,
  "operatorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "RaffleDraw_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RaffleDraw_eventId_registrationId_key" ON "RaffleDraw"("eventId", "registrationId");
CREATE INDEX "RaffleDraw_eventId_createdAt_idx" ON "RaffleDraw"("eventId", "createdAt");

ALTER TABLE "RaffleDraw"
  ADD CONSTRAINT "RaffleDraw_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "RaffleDraw_registrationId_fkey"
  FOREIGN KEY ("registrationId") REFERENCES "EventRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "RaffleDraw_operatorId_fkey"
  FOREIGN KEY ("operatorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
