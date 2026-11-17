import type { AttendeeCategory } from "@prisma/client";

export const attendeeCategories = [
  "VIP", "SPEAKER", "SPONSOR", "ORGANIZER", "MEDIA",
  "GENERAL", "STAFF", "VOLUNTEER", "GUEST", "WALK_IN",
] as const satisfies readonly AttendeeCategory[];

export const attendeeCategoryLabels: Record<AttendeeCategory, string> = {
  VIP: "VIP",
  SPEAKER: "Speaker",
  SPONSOR: "Sponsor",
  ORGANIZER: "Organizer",
  MEDIA: "Media",
  GENERAL: "General",
  STAFF: "Staff",
  VOLUNTEER: "Volunteer",
  GUEST: "Guest",
  WALK_IN: "Walk-in",
};
