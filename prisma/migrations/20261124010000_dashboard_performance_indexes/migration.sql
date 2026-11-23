CREATE INDEX CONCURRENTLY IF NOT EXISTS "AttendanceLog_workspace_action_created_registration_idx"
ON "AttendanceLog"("workspaceId", "action", "createdAt", "registrationId");
