const featureLabels: Record<string, string> = {
  public_registration: "Shareable guest registration page",
  basic_guestlist: "Attendee management and search",
  qr_tickets: "Unique QR digital tickets",
  checkin_options: "QR, NFC, and Manual Check-in",
  basic_attendance: "Attendance tracking and check-in logs",
  event_checkpoints: "Session / Meal / Swag Claim Checkpoints",
  registration_notifications: "Registration activity notifications",
  live_raffle: "Live Raffle / Lucky Draw Picker",
  e_certificates: "Automated E-Certificate",
  includes_free: "Everything in Free",
  custom_forms: "Custom registration form (up to 12 questions)",
  event_branding: "Event logo on the public registration page",
  guestlist_filters: "Filter by event, category, and registration date",
  csv_exports: "Filtered guestlist, ticket, and report CSV exports",
  basic_reports: "Attendance summaries and report filters",
  event_lifecycle: "Publish, duplicate, and archive events",
  includes_starter: "Everything in Starter",
  advanced_reports: "Registration trends and attendance-rate analytics",
  multi_event_reporting: "Cross-event registration and attendance reports",
  checkin_activity: "Recent check-in activity and ticket status",
  automated_followups: "Automated Reminder & Follow-Up Sequences",
  custom_limits: "Unlimited active events and attendee capacity",
  workspace_settings: "Workspace profile, contact, and timezone settings",
  workspace_exports: "Workspace-wide, filtered CSV exports",
  support: "Email support contact",
};

export const planFeatureOptions = Object.entries(featureLabels).map(([code, label]) => ({ code, label }));

const freePlanFeatures = [
  "public_registration",
  "basic_guestlist",
  "qr_tickets",
  "checkin_options",
  "event_checkpoints",
  "basic_attendance",
  "registration_notifications",
  "live_raffle",
  "e_certificates",
];
const starterPlanFeatures = [
  "custom_forms",
  "event_branding",
  "guestlist_filters",
  "csv_exports",
  "basic_reports",
  "event_lifecycle",
  "automated_followups",
];
const inheritedPlanFeatures: Record<string, readonly string[]> = {
  includes_free: freePlanFeatures,
  includes_starter: [...freePlanFeatures, ...starterPlanFeatures],
};

export function getPlanFeatureLabels(features: unknown): string[] {
  if (!Array.isArray(features)) return [];
  return features
    .filter((feature): feature is string => typeof feature === "string")
    .map((feature) => featureLabels[feature] ?? feature.replaceAll("_", " "));
}

export function workspaceHasFeature(
  subscription: { plan: { features: unknown } } | null,
  feature: string,
): boolean {
  if (!subscription) return false;
  if (!Array.isArray(subscription.plan.features)) return false;

  const planFeatures = new Set(subscription.plan.features.filter((item): item is string => typeof item === "string"));
  if (planFeatures.has(feature)) return true;

  if (feature === "csv_exports" && planFeatures.has("workspace_exports")) return true;

  return [...planFeatures].some((planFeature) => inheritedPlanFeatures[planFeature]?.includes(feature) ?? false);
}
