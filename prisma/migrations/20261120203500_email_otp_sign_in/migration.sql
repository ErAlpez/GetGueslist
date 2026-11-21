ALTER TABLE "users"
ADD COLUMN "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "two_factors" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "secret" TEXT NOT NULL,
  "backupCodes" TEXT NOT NULL,
  "verified" BOOLEAN NOT NULL DEFAULT true,
  "failedVerificationCount" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  CONSTRAINT "two_factors_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "two_factors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "two_factors_userId_idx" ON "two_factors"("userId");

INSERT INTO "two_factors" ("id", "userId", "secret", "backupCodes")
SELECT "id", "id", '', ''
FROM "users";

CREATE TABLE "rate_limits" (
  "key" TEXT NOT NULL,
  "count" INTEGER NOT NULL,
  "lastRequest" BIGINT NOT NULL,
  CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("key")
);
