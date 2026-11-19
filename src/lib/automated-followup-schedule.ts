export type AutomatedFollowupKind = "PRE_EVENT_REMINDER" | "POST_EVENT_FOLLOWUP";

const hourInMilliseconds = 60 * 60 * 1000;

export function getAutomatedFollowupScheduledAt(
  kind: AutomatedFollowupKind,
  startsAt: Date,
  endsAt: Date,
) {
  return new Date(
    kind === "PRE_EVENT_REMINDER"
      ? startsAt.getTime() - 24 * hourInMilliseconds
      : endsAt.getTime() + 2 * hourInMilliseconds,
  );
}

export function shouldScheduleReminder(registrationAt: Date, reminderAt: Date) {
  return registrationAt <= reminderAt;
}
