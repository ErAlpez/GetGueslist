CREATE TABLE "EventAttachment" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "uploadedById" TEXT,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "data" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EventAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventAttachment_eventId_createdAt_idx" ON "EventAttachment"("eventId", "createdAt");
CREATE INDEX "EventAttachment_uploadedById_idx" ON "EventAttachment"("uploadedById");

ALTER TABLE "EventAttachment"
  ADD CONSTRAINT "EventAttachment_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "EventAttachment_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
