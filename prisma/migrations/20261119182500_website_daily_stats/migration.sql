CREATE TABLE "WebsiteDailyStat" (
  "id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "path" TEXT NOT NULL,
  "countryCode" TEXT NOT NULL DEFAULT 'XX',
  "views" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WebsiteDailyStat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebsiteDailyStat_date_path_countryCode_key"
  ON "WebsiteDailyStat"("date", "path", "countryCode");
CREATE INDEX "WebsiteDailyStat_date_idx" ON "WebsiteDailyStat"("date");
