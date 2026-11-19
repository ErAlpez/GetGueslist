UPDATE "Plan"
SET
    "features" = CASE
        WHEN "features" @> '["e_certificates"]'::jsonb THEN "features"
        ELSE "features" || '["e_certificates"]'::jsonb
    END,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'FREE';
