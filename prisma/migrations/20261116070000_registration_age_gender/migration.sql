ALTER TABLE "EventRegistration"
  ADD COLUMN "age" INTEGER,
  ADD COLUMN "gender" TEXT,
  ADD CONSTRAINT "EventRegistration_age_check" CHECK ("age" IS NULL OR "age" BETWEEN 0 AND 150),
  ADD CONSTRAINT "EventRegistration_gender_check" CHECK ("gender" IS NULL OR "gender" IN ('MALE', 'FEMALE'));
