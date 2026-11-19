UPDATE "Plan"
SET
    "features" = CASE
        WHEN "features" @> '["automated_followups"]'::jsonb THEN "features"
        ELSE "features" || '["automated_followups"]'::jsonb
    END,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'STARTER';

UPDATE "Plan"
SET
    "features" = "features" - 'automated_followups',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'PROFESSIONAL'
  AND "features" @> '["automated_followups"]'::jsonb;
