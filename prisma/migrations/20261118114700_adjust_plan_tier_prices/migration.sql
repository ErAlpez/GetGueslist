UPDATE "Plan"
SET
    "monthlyPriceCents" = 9900,
    "yearlyPriceCents" = 99000,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'STARTER';

UPDATE "Plan"
SET
    "monthlyPriceCents" = 29900,
    "yearlyPriceCents" = 299000,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'PROFESSIONAL';

UPDATE "Plan"
SET
    "monthlyPriceCents" = 69900,
    "yearlyPriceCents" = 699000,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'ENTERPRISE';
