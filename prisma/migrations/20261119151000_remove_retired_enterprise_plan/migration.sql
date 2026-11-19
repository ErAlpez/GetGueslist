DELETE FROM "Plan" AS enterprise
WHERE enterprise."code" = 'ENTERPRISE'
  AND NOT EXISTS (
    SELECT 1
    FROM "Subscription"
    WHERE "planId" = enterprise."id"
  );
