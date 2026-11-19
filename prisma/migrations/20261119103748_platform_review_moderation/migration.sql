-- CreateEnum
CREATE TYPE "PlatformReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'HIDDEN');

-- CreateTable
CREATE TABLE "PlatformReview" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "workspaceId" TEXT,
    "moderatedById" TEXT,
    "authorName" TEXT NOT NULL,
    "workspaceName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "message" TEXT NOT NULL,
    "publicationConsent" BOOLEAN NOT NULL DEFAULT false,
    "status" "PlatformReviewStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moderatedAt" TIMESTAMP(3),

    CONSTRAINT "PlatformReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlatformReview_status_createdAt_idx" ON "PlatformReview"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PlatformReview_workspaceId_ownerId_createdAt_idx" ON "PlatformReview"("workspaceId", "ownerId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlatformReview" ADD CONSTRAINT "PlatformReview_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformReview" ADD CONSTRAINT "PlatformReview_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformReview" ADD CONSTRAINT "PlatformReview_moderatedById_fkey" FOREIGN KEY ("moderatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
