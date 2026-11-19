UPDATE "Plan"
SET
    "features" = CASE
        WHEN "features" @> '["live_raffle"]'::jsonb THEN "features"
        ELSE "features" || '["live_raffle"]'::jsonb
    END,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'FREE';
