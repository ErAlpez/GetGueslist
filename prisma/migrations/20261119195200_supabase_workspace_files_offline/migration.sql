ALTER TABLE "EventAttachment"
  ALTER COLUMN "data" DROP NOT NULL,
  ADD COLUMN "storagePath" TEXT;

CREATE TABLE "WorkspaceFile" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "uploadedById" TEXT,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "storagePath" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceFile_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkspaceFile_workspaceId_createdAt_idx" ON "WorkspaceFile"("workspaceId", "createdAt");
CREATE INDEX "WorkspaceFile_uploadedById_idx" ON "WorkspaceFile"("uploadedById");

ALTER TABLE "WorkspaceFile"
  ADD CONSTRAINT "WorkspaceFile_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "WorkspaceFile_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "EventRegistration"
  ADD COLUMN "offlineSyncId" TEXT;

CREATE UNIQUE INDEX "EventRegistration_offlineSyncId_key" ON "EventRegistration"("offlineSyncId");
