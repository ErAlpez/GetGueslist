"use server";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createTicketToken, hashTicketToken } from "@/lib/tickets";
import { getPrisma } from "@/lib/prisma";
import { getWorkspaceContext } from "@/lib/workspace";
import { attendeeCategories } from "@/lib/attendee-categories";
import { registrationAge, registrationGender } from "@/lib/registration-details";

export type AttendeeFormState = {
  error?: string;
};

const attendeeInput = z.object({
  eventId: z.string().min(1),
  firstName: z.string().trim().min(1, "Enter the guest’s first name.").max(100),
  lastName: z.string().trim().min(1, "Enter the guest’s last name.").max(100),
  email: z.email("Enter a valid email address.").transform((value) => value.trim().toLowerCase()),
  phone: z.string().trim().max(40),
  age: registrationAge,
  gender: registrationGender,
  category: z.enum(attendeeCategories),
});

const rolesAllowedToRegister = new Set(["OWNER", "ADMIN", "MANAGER", "CHECKIN"]);

export async function registerAttendeeAction(
  _previousState: AttendeeFormState,
  formData: FormData,
): Promise<AttendeeFormState> {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");
  if (!rolesAllowedToRegister.has(context.membership.role)) {
    return { error: "You don’t have permission to add guests in this workspace." };
  }

  const parsed = attendeeInput.safeParse({
    eventId: formData.get("eventId"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    age: formData.get("age") ?? "",
    gender: formData.get("gender") ?? "",
    category: formData.get("category"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the guest details and try again." };

  const input = parsed.data;
  const ticketId = randomUUID();
  const ticketToken = createTicketToken(ticketId);
  const ticketTokenHash = hashTicketToken(ticketToken);
  const prisma = getPrisma();

  const result = await prisma.$transaction(async (transaction) => {
    const event = await transaction.event.findFirst({
      where: { id: input.eventId, workspaceId: context.workspace.id, archivedAt: null },
      select: { id: true, capacity: true },
    });
    if (!event) return { error: "This event isn’t available in your workspace." };

    const subscription = await transaction.subscription.findUnique({
      where: { workspaceId: context.workspace.id },
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
      where: { workspaceId_email: { workspaceId: context.workspace.id, email: input.email } },
    });
    if (!attendee) {
      attendee = await transaction.attendee.create({
        data: {
          workspaceId: context.workspace.id,
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone || null,
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
        eventId: event.id,
        attendeeId: attendee.id,
        ticketTypeId: ticketType.id,
        category: input.category,
        age: input.age,
        gender: input.gender,
        rsvpStatus: "ACCEPTED",
        paymentStatus: "NOT_REQUIRED",
        registrationSource: input.category === "WALK_IN" ? "walk_in" : "manual",
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
        workspaceId: context.workspace.id,
        actorId: context.user.id,
        action: "attendee.registered",
        entityType: "registration",
        entityId: registration.id,
        metadata: { eventId: event.id, category: input.category },
      },
    });
    return { ticketId };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if ("error" in result) return { error: result.error };
  redirect(`/dashboard/tickets?event=${input.eventId}&issued=${result.ticketId}`);
}
