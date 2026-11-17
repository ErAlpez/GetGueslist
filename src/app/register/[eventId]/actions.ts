"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import {
  isRegistrationQuestionType,
  readRegistrationQuestionOptions,
} from "@/lib/registration-form";
import { createTicketToken, hashTicketToken } from "@/lib/tickets";
import { attendeeCategories } from "@/lib/attendee-categories";
import { registrationAge, registrationGender } from "@/lib/registration-details";
import { sendTicketEmail } from "@/lib/email";
import { getPreferences } from "@/lib/preferences";

export type PublicRegistrationState = {
  error?: string;
};

const registrationInput = z.object({
  eventId: z.string().min(1),
  firstName: z.string().trim().min(1, "Enter your first name.").max(100),
  lastName: z.string().trim().min(1, "Enter your last name.").max(100),
  email: z.email("Enter a valid email address.").transform((value) => value.trim().toLowerCase()),
  phone: z.string().trim().max(40),
  category: z.enum(attendeeCategories, { error: "Choose a valid category." }),
  age: registrationAge,
  gender: registrationGender,
});

const registrationOpenStatuses = new Set(["PUBLISHED", "REGISTRATION_OPEN", "ONGOING"]);

export async function registerForEventAction(
  _previousState: PublicRegistrationState,
  formData: FormData,
): Promise<PublicRegistrationState> {
  const parsed = registrationInput.safeParse({
    eventId: formData.get("eventId"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    category: formData.get("category") ?? "GENERAL",
    age: formData.get("age") ?? "",
    gender: formData.get("gender") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details and try again." };
  }

  const input = parsed.data;
  const prisma = getPrisma();
  const ticketId = randomUUID();
  const ticketToken = createTicketToken(ticketId);
  const ticketTokenHash = hashTicketToken(ticketToken);
  const result = await prisma.$transaction(async (transaction) => {
    const event = await transaction.event.findFirst({
      where: { id: input.eventId, archivedAt: null },
      select: {
        id: true,
        name: true,
        workspaceId: true,
        capacity: true,
        startsAt: true,
        endsAt: true,
        timezone: true,
        registrationDeadline: true,
        status: true,
        visibility: true,
        settings: { select: { allowRegistration: true, requireApproval: true } },
        registrationForm: {
          select: {
            published: true,
            questions: {
              orderBy: { position: "asc" },
              select: { id: true, label: true, type: true, required: true, options: true },
            },
          },
        },
      },
    });
    const now = new Date();
    if (
      !event ||
      event.visibility === "INVITE_ONLY" ||
      !registrationOpenStatuses.has(event.status) ||
      event.settings?.allowRegistration === false ||
      event.settings?.requireApproval === true ||
      event.registrationForm?.published === false ||
      event.endsAt <= now ||
      (event.registrationDeadline && event.registrationDeadline <= now)
    ) {
      return { error: "Registration is not available for this event." };
    }

    const answers: { questionId: string; value: Prisma.InputJsonValue }[] = [];
    for (const question of event.registrationForm?.questions ?? []) {
      if (!isRegistrationQuestionType(question.type)) {
        return { error: "The event registration form is temporarily unavailable." };
      }

      const submittedValues = formData.getAll(`question_${question.id}`);
      if (submittedValues.length > 1 || submittedValues.some((value) => typeof value !== "string")) {
        return { error: `Check your answer for “${question.label}”.` };
      }

      if (question.type === "CHECKBOX") {
        const submitted = submittedValues[0];
        if (submitted !== undefined && submitted !== "true") {
          return { error: `Check your answer for “${question.label}”.` };
        }
        const checked = submitted === "true";
        if (question.required && !checked) {
          return { error: `Please answer “${question.label}”.` };
        }
        answers.push({ questionId: question.id, value: checked });
        continue;
      }

      const submitted = submittedValues[0];
      const value = typeof submitted === "string" ? submitted.trim() : "";
      if (value.length > 2000) {
        return { error: `Your answer for “${question.label}” is too long.` };
      }
      if (question.required && !value) {
        return { error: `Please answer “${question.label}”.` };
      }
      if (question.type === "SELECT" && value && !readRegistrationQuestionOptions(question.options).includes(value)) {
        return { error: `Choose a valid option for “${question.label}”.` };
      }
      if (value) answers.push({ questionId: question.id, value });
    }

    const subscription = await transaction.subscription.findUnique({
      where: { workspaceId: event.workspaceId },
      include: { plan: true },
    });
    if (!subscription) throw new Error("This workspace does not have a subscription plan.");

    const registeredCount = await transaction.eventRegistration.count({ where: { eventId: event.id } });
    if (subscription.plan.attendeePerEventLimit !== null && registeredCount >= subscription.plan.attendeePerEventLimit) {
      return { error: "Your plan’s attendee limit for this event has been reached." };
    }
    if (event.capacity !== null && registeredCount >= event.capacity) {
      return { error: "This event has reached its capacity." };
    }

    let attendee = await transaction.attendee.findUnique({
      where: { workspaceId_email: { workspaceId: event.workspaceId, email: input.email } },
      select: { id: true },
    });
    if (attendee) {
      const existingRegistration = await transaction.eventRegistration.findUnique({
        where: { eventId_attendeeId: { eventId: event.id, attendeeId: attendee.id } },
        select: { id: true },
      });
      if (existingRegistration) return { error: "This email is already registered for the event." };
    }

    let ticketType = await transaction.ticketType.findFirst({
      where: { eventId: event.id, name: "General admission" },
      select: { id: true, capacity: true },
    });
    if (!ticketType) {
      ticketType = await transaction.ticketType.create({
        data: { eventId: event.id, name: "General admission" },
        select: { id: true, capacity: true },
      });
    }
    if (ticketType.capacity !== null) {
      const ticketTypeRegistrationCount = await transaction.eventRegistration.count({
        where: { eventId: event.id, ticketTypeId: ticketType.id },
      });
      if (ticketTypeRegistrationCount >= ticketType.capacity) {
        return { error: "This ticket type has reached capacity." };
      }
    }

    if (!attendee) {
      attendee = await transaction.attendee.create({
        data: {
          workspaceId: event.workspaceId,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone || null,
        },
        select: { id: true },
      });
    }

    const registration = await transaction.eventRegistration.create({
      data: {
        eventId: event.id,
        attendeeId: attendee.id,
        ticketTypeId: ticketType.id,
        category: input.category,
        age: input.age,
        gender: input.gender,
        rsvpStatus: "ACCEPTED",
        paymentStatus: "NOT_REQUIRED",
        registrationSource: "online",
        answers: { create: answers },
        ticket: {
          create: {
            id: ticketId,
            tokenHash: ticketTokenHash,
          },
        },
      },
      select: { id: true, ticket: { select: { displayId: true } } },
    });
    if (!registration.ticket) throw new Error("Registration was created without a ticket.");

    await transaction.activityLog.create({
      data: {
        workspaceId: event.workspaceId,
        actorId: null,
        action: "attendee.registered",
        entityType: "registration",
        entityId: registration.id,
        metadata: { eventId: event.id, category: input.category, registrationSource: "online" },
      },
    });
    return { ticketToken, event, displayId: registration.ticket.displayId };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if ("error" in result) return { error: result.error };
  const ticketPath = `/t/${encodeURIComponent(result.ticketToken)}`;
  let emailFailed = false;
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL;
    if (!baseUrl) throw new Error("Set NEXT_PUBLIC_APP_URL or BETTER_AUTH_URL to enable ticket email delivery.");
    const ticketUrl = new URL(ticketPath, baseUrl);
    if (!["http:", "https:"].includes(ticketUrl.protocol)) throw new Error("The application URL must use HTTP or HTTPS.");
    if (ticketUrl.username || ticketUrl.password || ["localhost", "127.0.0.1", "[::1]"].includes(ticketUrl.hostname) || ticketUrl.hostname.endsWith(".localhost")) {
      throw new Error("Ticket email delivery requires a public application URL without credentials.");
    }
    const { locale } = await getPreferences();
    await sendTicketEmail({
      to: input.email,
      guestName: `${input.firstName} ${input.lastName}`,
      eventName: result.event.name,
      startsAt: result.event.startsAt,
      endsAt: result.event.endsAt,
      timeZone: result.event.timezone,
      ticketId: result.displayId,
      ticketUrl: ticketUrl.toString(),
      locale,
    });
  } catch (error) {
    console.error("Ticket email delivery failed:", error instanceof Error ? error.message : "Unknown error");
    emailFailed = true;
  }
  redirect(`${ticketPath}${emailFailed ? "?email=failed" : ""}`);
}
