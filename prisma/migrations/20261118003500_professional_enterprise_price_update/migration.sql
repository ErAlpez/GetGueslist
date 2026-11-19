UPDATE "Plan"
SET
    "monthlyPriceCents" = 59900,
    "yearlyPriceCents" = 599000,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'PROFESSIONAL';

UPDATE "Plan"
SET
    "monthlyPriceCents" = 99900,
    "yearlyPriceCents" = 999000,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'ENTERPRISE';
