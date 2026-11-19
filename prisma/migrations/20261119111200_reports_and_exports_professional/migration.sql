UPDATE "Plan"
SET
    "features" = "features" - 'basic_reports' - 'csv_exports',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'STARTER';

UPDATE "Plan"
SET
    "features" =
        (CASE
            WHEN "features" @> '["basic_reports"]'::jsonb THEN "features"
            ELSE "features" || '["basic_reports"]'::jsonb
        END)
        || (CASE
            WHEN "features" @> '["csv_exports"]'::jsonb THEN '[]'::jsonb
            ELSE '["csv_exports"]'::jsonb
        END),
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'PROFESSIONAL';
