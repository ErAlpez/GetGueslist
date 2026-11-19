UPDATE "Plan"
SET
    "features" = '["public_registration","basic_guestlist","qr_tickets","checkin_options","basic_attendance","registration_notifications"]'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'FREE';

UPDATE "Plan"
SET
    "features" = '["includes_free","custom_forms","event_branding","guestlist_filters","csv_exports","basic_reports","event_lifecycle"]'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'STARTER';

UPDATE "Plan"
SET
    "features" = '["includes_starter","advanced_reports","multi_event_reporting","checkin_activity"]'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'PROFESSIONAL';

UPDATE "Plan"
SET
    "features" = '["includes_professional","custom_limits","workspace_settings","workspace_exports","support"]'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'ENTERPRISE';
