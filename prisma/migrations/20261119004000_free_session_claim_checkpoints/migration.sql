UPDATE "Plan"
SET
    "features" = CASE
        WHEN "features" @> '["event_checkpoints"]'::jsonb THEN "features"
        ELSE "features" || '["event_checkpoints"]'::jsonb
    END,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'FREE';
