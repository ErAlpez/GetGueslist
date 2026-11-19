-- CreateTable
CREATE TABLE "SystemHealthRun" (
    "id" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemHealthRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemHealthSample" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "detail" TEXT NOT NULL,

    CONSTRAINT "SystemHealthSample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemHealthRun_checkedAt_idx" ON "SystemHealthRun"("checkedAt");

-- CreateIndex
CREATE INDEX "SystemHealthSample_service_runId_idx" ON "SystemHealthSample"("service", "runId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemHealthSample_runId_service_key" ON "SystemHealthSample"("runId", "service");

-- AddForeignKey
ALTER TABLE "SystemHealthSample" ADD CONSTRAINT "SystemHealthSample_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SystemHealthRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
