export type AutomatedFollowupKind = "PRE_EVENT_REMINDER" | "POST_EVENT_FOLLOWUP";

const hourInMilliseconds = 60 * 60 * 1000;
const dailyCronDeliveryWindow = 26 * hourInMilliseconds;
const dailyCronEarlyDeliveryWindow = hourInMilliseconds;

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

export function isReminderWithinDeliveryWindow(scheduledAt: Date, now: Date) {
  const lateness = now.getTime() - scheduledAt.getTime();
  return lateness >= -dailyCronEarlyDeliveryWindow && lateness <= dailyCronDeliveryWindow;
}
