ALTER TABLE "rate_limits"
ADD COLUMN "id" TEXT;

UPDATE "rate_limits"
SET "id" = "key"
WHERE "id" IS NULL;

ALTER TABLE "rate_limits"
ALTER COLUMN "id" SET NOT NULL;

ALTER TABLE "rate_limits"
DROP CONSTRAINT "rate_limits_pkey";

ALTER TABLE "rate_limits"
ADD CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id");

ALTER TABLE "rate_limits"
ADD CONSTRAINT "rate_limits_key_key" UNIQUE ("key");
