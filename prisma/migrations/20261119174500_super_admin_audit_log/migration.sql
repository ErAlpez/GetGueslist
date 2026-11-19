CREATE TABLE "SuperAdminAuditLog" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SuperAdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SuperAdminAuditLog_entityId_createdAt_idx" ON "SuperAdminAuditLog"("entityId", "createdAt");
CREATE INDEX "SuperAdminAuditLog_adminId_createdAt_idx" ON "SuperAdminAuditLog"("adminId", "createdAt");

ALTER TABLE "SuperAdminAuditLog"
  ADD CONSTRAINT "SuperAdminAuditLog_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
