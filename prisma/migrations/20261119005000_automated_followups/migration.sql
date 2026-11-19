CREATE TYPE "AutomatedEmailKind" AS ENUM ('PRE_EVENT_REMINDER', 'POST_EVENT_FOLLOWUP');
CREATE TYPE "AutomatedEmailStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED');

CREATE TABLE "AutomatedEmailDelivery" (
    "id" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "kind" "AutomatedEmailKind" NOT NULL,
    "status" "AutomatedEmailStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomatedEmailDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EventFeedback" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "message" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventFeedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutomatedEmailDelivery_registrationId_kind_key"
    ON "AutomatedEmailDelivery"("registrationId", "kind");
CREATE INDEX "AutomatedEmailDelivery_status_scheduledAt_idx"
    ON "AutomatedEmailDelivery"("status", "scheduledAt");
CREATE INDEX "AutomatedEmailDelivery_status_nextAttemptAt_idx"
    ON "AutomatedEmailDelivery"("status", "nextAttemptAt");
CREATE UNIQUE INDEX "EventFeedback_registrationId_key"
    ON "EventFeedback"("registrationId");
CREATE INDEX "EventFeedback_eventId_submittedAt_idx"
    ON "EventFeedback"("eventId", "submittedAt");

ALTER TABLE "AutomatedEmailDelivery"
    ADD CONSTRAINT "AutomatedEmailDelivery_registrationId_fkey"
    FOREIGN KEY ("registrationId") REFERENCES "EventRegistration"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventFeedback"
    ADD CONSTRAINT "EventFeedback_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EventFeedback"
    ADD CONSTRAINT "EventFeedback_registrationId_fkey"
    FOREIGN KEY ("registrationId") REFERENCES "EventRegistration"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "Plan"
SET
    "features" = CASE
        WHEN "features" @> '["automated_followups"]'::jsonb THEN "features"
        ELSE "features" || '["automated_followups"]'::jsonb
    END,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'PROFESSIONAL';
