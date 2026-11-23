ALTER TABLE "EventAttachment" ADD COLUMN "originalFileName" TEXT;
UPDATE "EventAttachment" SET "originalFileName" = "fileName";
ALTER TABLE "EventAttachment" ALTER COLUMN "originalFileName" SET NOT NULL;
CREATE INDEX "EventAttachment_eventId_originalFileName_idx" ON "EventAttachment"("eventId", "originalFileName");

ALTER TABLE "WorkspaceFile" ADD COLUMN "originalFileName" TEXT;
UPDATE "WorkspaceFile" SET "originalFileName" = "fileName";
ALTER TABLE "WorkspaceFile" ALTER COLUMN "originalFileName" SET NOT NULL;
CREATE INDEX "WorkspaceFile_workspaceId_originalFileName_idx" ON "WorkspaceFile"("workspaceId", "originalFileName");
