UPDATE "Plan"
SET
    "monthlyPriceCents" = 49900,
    "yearlyPriceCents" = 499000,
    "activeEventLimit" = NULL,
    "attendeePerEventLimit" = NULL,
    "features" = '["includes_starter","advanced_reports","multi_event_reporting","checkin_activity","custom_limits","workspace_settings","workspace_exports","support"]'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'PROFESSIONAL';

UPDATE "Subscription" AS subscription
SET
    "planId" = professional."id",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "Plan" AS enterprise, "Plan" AS professional
WHERE subscription."planId" = enterprise."id"
  AND enterprise."code" = 'ENTERPRISE'
  AND professional."code" = 'PROFESSIONAL';

UPDATE "Plan"
SET
    "isActive" = false,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'ENTERPRISE';
