UPDATE "Plan"
SET
    "monthlyPriceCents" = 59900,
    "yearlyPriceCents" = 599000,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'ENTERPRISE';
