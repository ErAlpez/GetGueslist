import "server-only";

import { AutomatedEmailKind } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { workspaceHasFeature } from "@/lib/plan-features";
import { createTicketToken } from "@/lib/tickets";
import {
  sendAutomatedFollowupEmail,
  sendAutomatedReminderEmail,
} from "@/lib/email";
import {
  getAutomatedFollowupScheduledAt,
  shouldScheduleReminder,
} from "@/lib/automated-followup-schedule";

const hourInMilliseconds = 60 * 60 * 1000;
const dayInMilliseconds = 24 * hourInMilliseconds;
const reminderScanAhead = 25 * hourInMilliseconds;
const followupScanBehind = 26 * hourInMilliseconds;
const followupScanAhead = dayInMilliseconds;
const reminderLatenessLimit = hourInMilliseconds;
const followupLatenessLimit = dayInMilliseconds;
const retryDelays = [5 * 60 * 1000, 30 * 60 * 1000, 2 * hourInMilliseconds, 6 * hourInMilliseconds];
const maxAttempts = retryDelays.length + 1;
const maxBatchSize = 20;
const concurrentDeliveries = 5;

type NewDelivery = {
  registrationId: string;
  kind: AutomatedEmailKind;
  scheduledAt: Date;
};

async function insertDeliveries(rows: NewDelivery[]) {
  const prisma = getPrisma();
  let inserted = 0;
  for (let index = 0; index < rows.length; index += 500) {
    const result = await prisma.automatedEmailDelivery.createMany({
      data: rows.slice(index, index + 500),
      skipDuplicates: true,
    });
    inserted += result.count;
  }
  return inserted;
}

function getPublicUrl(path: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL;
  if (!baseUrl) throw new Error("Set NEXT_PUBLIC_APP_URL or BETTER_AUTH_URL for automated email links.");

  const url = new URL(path, baseUrl);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("The application URL must use HTTP or HTTPS.");
  }
  if (
    url.username ||
    url.password ||
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.hostname.endsWith(".localhost")
  ) {
    throw new Error("Automated email links require a public application URL without credentials.");
  }
  if (process.env.NODE_ENV === "production" && (
    url.protocol !== "https:"
  )) {
    throw new Error("Automated email links require a public HTTPS application URL.");
  }
  return url.toString();
}

async function queueUpcomingDeliveries(now: Date) {
  const prisma = getPrisma();
  const subscriptions = await prisma.subscription.findMany({
    where: {
      status: { in: ["ACTIVE", "TRIALING"] },
      plan: { isActive: true },
    },
    select: {
      workspaceId: true,
      plan: { select: { features: true } },
    },
  });
  const workspaceIds = subscriptions
    .filter((subscription) => workspaceHasFeature(subscription, "automated_followups"))
    .map((subscription) => subscription.workspaceId);
  if (workspaceIds.length === 0) return { reminders: 0, followups: 0 };

  const [reminderEvents, followupEvents] = await Promise.all([
    prisma.event.findMany({
      where: {
        workspaceId: { in: workspaceIds },
        status: { in: ["PUBLISHED", "REGISTRATION_OPEN", "REGISTRATION_CLOSED", "ONGOING"] },
        startsAt: { gt: now, lte: new Date(now.getTime() + reminderScanAhead) },
        archivedAt: null,
      },
      select: {
        startsAt: true,
        endsAt: true,
        registrations: {
          where: {
            attendee: { is: { email: { not: null } } },
            ticket: { is: { status: "ACTIVE" } },
          },
          select: { id: true, registeredAt: true },
        },
      },
    }),
    prisma.event.findMany({
      where: {
        workspaceId: { in: workspaceIds },
        status: { notIn: ["DRAFT", "CANCELLED"] },
        endsAt: {
          gte: new Date(now.getTime() - followupScanBehind),
          lte: new Date(now.getTime() + followupScanAhead),
        },
        archivedAt: null,
      },
      select: {
        startsAt: true,
        endsAt: true,
        registrations: {
          where: {
            attendee: { is: { email: { not: null } } },
            ticket: { is: { status: "USED" } },
            attendanceLogs: { some: { action: "CHECK_IN" } },
          },
          select: { id: true },
        },
      },
    }),
  ]);

  const reminderRows: NewDelivery[] = [];
  for (const event of reminderEvents) {
    const scheduledAt = getAutomatedFollowupScheduledAt("PRE_EVENT_REMINDER", event.startsAt, event.endsAt);
    for (const registration of event.registrations) {
      if (shouldScheduleReminder(registration.registeredAt, scheduledAt)) {
        reminderRows.push({
          registrationId: registration.id,
          kind: AutomatedEmailKind.PRE_EVENT_REMINDER,
          scheduledAt,
        });
      }
    }
  }

  const followupRows: NewDelivery[] = [];
  for (const event of followupEvents) {
    const scheduledAt = getAutomatedFollowupScheduledAt("POST_EVENT_FOLLOWUP", event.startsAt, event.endsAt);
    for (const registration of event.registrations) {
      followupRows.push({
        registrationId: registration.id,
        kind: AutomatedEmailKind.POST_EVENT_FOLLOWUP,
        scheduledAt,
      });
    }
  }

  const [reminders, followups] = await Promise.all([
    insertDeliveries(reminderRows),
    insertDeliveries(followupRows),
  ]);
  return { reminders, followups };
}

async function expireManualPaddleSubscriptions(now: Date) {
  const prisma = getPrisma();
  const freePlan = await prisma.plan.findUnique({
    where: { code: "FREE" },
    select: { id: true },
  });
  if (!freePlan) throw new Error("The Free plan is required to expire manual Paddle subscriptions.");

  const expired = await prisma.subscription.updateMany({
    where: {
      provider: "paddle",
      providerSubscriptionId: null,
      scheduledCancellationAt: null,
      status: { in: ["ACTIVE", "TRIALING"] },
      billingPeriodEnd: { lte: now },
      planId: { not: freePlan.id },
    },
    data: {
      planId: freePlan.id,
      status: "EXPIRED",
      renewalDate: null,
    },
  });
  return expired.count;
}

async function skipDelivery(id: string, reason: string) {
  await getPrisma().automatedEmailDelivery.update({
    where: { id },
    data: { status: "SKIPPED", lockedAt: null, nextAttemptAt: null, lastError: reason },
  });
}

async function processDelivery(id: string, now: Date): Promise<"sent" | "failed" | "skipped" | "rescheduled"> {
  const prisma = getPrisma();
  const delivery = await prisma.automatedEmailDelivery.findUnique({
    where: { id },
    include: {
      registration: {
        include: {
          attendee: { select: { firstName: true, lastName: true, email: true } },
          ticket: { select: { id: true, displayId: true, status: true } },
          attendanceLogs: {
            where: { action: "CHECK_IN" },
            select: { id: true },
            take: 1,
          },
          event: {
            include: {
              workspace: {
                include: {
                  subscription: { include: { plan: true } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!delivery) return "skipped";

  const { registration } = delivery;
  const { event } = registration;
  const expectedScheduledAt = getAutomatedFollowupScheduledAt(delivery.kind, event.startsAt, event.endsAt);
  if (delivery.scheduledAt.getTime() !== expectedScheduledAt.getTime()) {
    await prisma.automatedEmailDelivery.update({
      where: { id },
      data: {
        status: "PENDING",
        scheduledAt: expectedScheduledAt,
        attempts: 0,
        nextAttemptAt: null,
        lockedAt: null,
        lastError: null,
      },
    });
    return "rescheduled";
  }

  if (event.archivedAt || event.status === "DRAFT" || event.status === "CANCELLED") {
    await skipDelivery(id, "The event is no longer eligible for automated email.");
    return "skipped";
  }

  const subscription = event.workspace.subscription;
  if (
    !subscription ||
    !["ACTIVE", "TRIALING"].includes(subscription.status) ||
    !workspaceHasFeature(subscription, "automated_followups")
  ) {
    await skipDelivery(id, "The workspace plan does not include automated follow-ups.");
    return "skipped";
  }

  const ticket = registration.ticket;
  const attendeeEmail = registration.attendee.email?.trim();
  if (!ticket || !attendeeEmail) {
    await skipDelivery(id, "The registration no longer has an eligible ticket and email address.");
    return "skipped";
  }

  if (delivery.kind === AutomatedEmailKind.PRE_EVENT_REMINDER) {
    if (
      ticket.status !== "ACTIVE" ||
      event.startsAt <= now ||
      now.getTime() - expectedScheduledAt.getTime() > reminderLatenessLimit
    ) {
      await skipDelivery(id, "The event reminder is no longer timely.");
      return "skipped";
    }
  } else if (
    ticket.status !== "USED" ||
    registration.attendanceLogs.length === 0 ||
    now.getTime() - expectedScheduledAt.getTime() > followupLatenessLimit
  ) {
    await skipDelivery(id, "The attendee is not eligible for a timely post-event follow-up.");
    return "skipped";
  }

  try {
    const token = createTicketToken(ticket.id);
    if (delivery.kind === AutomatedEmailKind.PRE_EVENT_REMINDER) {
      await sendAutomatedReminderEmail({
        to: attendeeEmail,
        guestName: `${registration.attendee.firstName} ${registration.attendee.lastName}`,
        eventName: event.name,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        timeZone: event.timezone,
        ticketId: ticket.displayId,
        ticketUrl: getPublicUrl(`/t/${encodeURIComponent(token)}`),
      });
    } else {
      await sendAutomatedFollowupEmail({
        to: attendeeEmail,
        guestName: `${registration.attendee.firstName} ${registration.attendee.lastName}`,
        eventName: event.name,
        feedbackUrl: getPublicUrl(`/feedback/${encodeURIComponent(token)}`),
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email delivery error.";
    const nextAttemptDelay = retryDelays[delivery.attempts - 1];
    await prisma.automatedEmailDelivery.update({
      where: { id },
      data: {
        status: "FAILED",
        lockedAt: null,
        nextAttemptAt: nextAttemptDelay ? new Date(now.getTime() + nextAttemptDelay) : null,
        lastError: message.slice(0, 1000),
      },
    });
    console.error(`Automated ${delivery.kind.toLowerCase()} email failed for delivery ${id}:`, message);
    return "failed";
  }

  await prisma.automatedEmailDelivery.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date(), lockedAt: null, nextAttemptAt: null, lastError: null },
  });
  return "sent";
}

async function claimDueDeliveries(now: Date) {
  const prisma = getPrisma();
  const staleLock = new Date(now.getTime() - 10 * 60 * 1000);
  await prisma.automatedEmailDelivery.updateMany({
    where: { status: "PROCESSING", lockedAt: { lt: staleLock }, attempts: { lt: maxAttempts } },
    data: { status: "FAILED", lockedAt: null, nextAttemptAt: now, lastError: "Delivery attempt timed out." },
  });
  await prisma.automatedEmailDelivery.updateMany({
    where: { status: "PROCESSING", lockedAt: { lt: staleLock }, attempts: { gte: maxAttempts } },
    data: { status: "FAILED", lockedAt: null, nextAttemptAt: null, lastError: "Delivery attempt timed out." },
  });

  const due = await prisma.automatedEmailDelivery.findMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
      scheduledAt: { lte: now },
      attempts: { lt: maxAttempts },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    take: maxBatchSize,
    select: { id: true },
  });
  const claimed: string[] = [];
  for (const delivery of due) {
    const result = await prisma.automatedEmailDelivery.updateMany({
      where: {
        id: delivery.id,
        status: { in: ["PENDING", "FAILED"] },
        scheduledAt: { lte: now },
        attempts: { lt: maxAttempts },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      data: {
        status: "PROCESSING",
        attempts: { increment: 1 },
        lockedAt: now,
        nextAttemptAt: null,
      },
    });
    if (result.count > 0) claimed.push(delivery.id);
  }
  return claimed;
}

export async function runAutomatedFollowups(now = new Date()) {
  const expiredManualSubscriptions = await expireManualPaddleSubscriptions(now);
  const queued = await queueUpcomingDeliveries(now);
  const claimed = await claimDueDeliveries(now);
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (let index = 0; index < claimed.length; index += concurrentDeliveries) {
    const results = await Promise.all(
      claimed.slice(index, index + concurrentDeliveries).map((id) => processDelivery(id, now)),
    );
    sent += results.filter((result) => result === "sent").length;
    failed += results.filter((result) => result === "failed").length;
    skipped += results.filter((result) => result === "skipped").length;
  }

  return {
    expiredManualSubscriptions,
    queuedReminders: queued.reminders,
    queuedFollowups: queued.followups,
    sent,
    failed,
    skipped,
  };
}
