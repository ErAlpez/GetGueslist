import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { attendeeCategories } from "@/lib/attendee-categories";
import { registrationAge, registrationGender } from "@/lib/registration-details";
import { createTicketToken, hashTicketToken } from "@/lib/tickets";
import { getPrisma } from "@/lib/prisma";

export const attendeeInput = z.object({
  eventId: z.string().min(1),
  firstName: z.string().trim().min(1, "Enter the guest’s first name.").max(100),
  lastName: z.string().trim().min(1, "Enter the guest’s last name.").max(100),
  email: z.email("Enter a valid email address.").transform((value) => value.trim().toLowerCase()),
  phone: z.string().trim().max(40),
  age: registrationAge,
  gender: registrationGender,
  category: z.enum(attendeeCategories),
});

export type AttendeeRegistrationInput = z.infer<typeof attendeeInput>;
export type GuestRegistrationResult = { ticketId: string; alreadyProcessed?: boolean } | { error: string };
export const rolesAllowedToRegister = new Set(["OWNER", "ADMIN", "MANAGER"]);

export async function createGuestRegistration(
  input: AttendeeRegistrationInput,
  workspaceId: string,
  actorId: string,
  offlineSyncId?: string,
): Promise<GuestRegistrationResult> {
  const prisma = getPrisma();
  const ticketId = randomUUID();
  const ticketTokenHash = hashTicketToken(createTicketToken(ticketId));

  const result = await prisma.$transaction(async (transaction) => {
    if (offlineSyncId) {
      const previousSync = await transaction.eventRegistration.findUnique({
        where: { offlineSyncId },
        select: { eventId: true, ticket: { select: { id: true } } },
      });
      if (previousSync) {
        return previousSync.eventId === input.eventId
          ? { ticketId: previousSync.ticket?.id ?? "", alreadyProcessed: true }
          : { error: "This offline change has already been used." };
      }
    }

    const event = await transaction.event.findFirst({
      where: { id: input.eventId, workspaceId, archivedAt: null },
      select: { id: true, capacity: true },
    });
    if (!event) return { error: "This event isn’t available in your workspace." };

    const subscription = await transaction.subscription.findUnique({
      where: { workspaceId },
      include: { plan: true },
    });
    if (!subscription) throw new Error("This workspace does not have a subscription plan.");

    const registeredCount = await transaction.eventRegistration.count({ where: { eventId: event.id } });
    if (subscription.plan.attendeePerEventLimit !== null && registeredCount >= subscription.plan.attendeePerEventLimit) {
      return { error: "Your plan’s attendee limit for this event has been reached. Upgrade your plan to add more guests." };
    }
    if (event.capacity !== null && registeredCount >= event.capacity) {
      return { error: "This event has reached its capacity." };
    }

    let attendee = await transaction.attendee.findUnique({
      where: { workspaceId_email: { workspaceId, email: input.email } },
    });
    if (!attendee) {
      attendee = await transaction.attendee.create({
        data: {
          workspaceId,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone || null,
        },
      });
    } else {
      await transaction.attendee.update({
        where: { id: attendee.id },
        data: {
          firstName: attendee.firstName,
          lastName: attendee.lastName,
          phone: attendee.phone,
        },
      });
    }

    const existingRegistration = await transaction.eventRegistration.findUnique({
      where: { eventId_attendeeId: { eventId: event.id, attendeeId: attendee.id } },
      select: { id: true },
    });
    if (existingRegistration) return { error: "This guest is already registered for the event." };

    let ticketType = await transaction.ticketType.findFirst({
      where: { eventId: event.id, name: "General admission" },
      select: { id: true },
    });
    if (!ticketType) {
      ticketType = await transaction.ticketType.create({
        data: { eventId: event.id, name: "General admission" },
        select: { id: true },
      });
    }

    const registration = await transaction.eventRegistration.create({
      data: {
        offlineSyncId: offlineSyncId ?? null,
        eventId: event.id,
        attendeeId: attendee.id,
        ticketTypeId: ticketType.id,
        category: input.category,
        age: input.age,
        gender: input.gender,
        rsvpStatus: "ACCEPTED",
        registrationSource: offlineSyncId
          ? "offline_sync"
          : input.category === "WALK_IN" ? "walk_in" : "manual",
        ticket: {
          create: {
            id: ticketId,
            tokenHash: ticketTokenHash,
          },
        },
      },
      select: { id: true },
    });

    await transaction.activityLog.create({
      data: {
        workspaceId,
        actorId,
        action: "attendee.registered",
        entityType: "registration",
        entityId: registration.id,
        metadata: {
          eventId: event.id,
          category: input.category,
          ...(offlineSyncId ? { source: "offline_sync" } : {}),
        },
      },
    });
    return { ticketId };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return result;
}
