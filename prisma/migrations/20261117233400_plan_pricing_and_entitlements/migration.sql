UPDATE "Plan"
SET
    "monthlyPriceCents" = 19900,
    "yearlyPriceCents" = 202980,
    "features" = '["custom_forms","qr_tickets","import_export","basic_reports"]'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'STARTER';

UPDATE "Plan"
SET
    "monthlyPriceCents" = 79900,
    "yearlyPriceCents" = 814980,
    "features" = '["qr_tickets","nfc","team_collaboration","badges","advanced_reports"]'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'PROFESSIONAL';

UPDATE "Plan"
SET
    "monthlyPriceCents" = 139900,
    "yearlyPriceCents" = 1426980,
    "features" = '["custom_limits","advanced_permissions","custom_branding","integrations","support"]'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'ENTERPRISE';
