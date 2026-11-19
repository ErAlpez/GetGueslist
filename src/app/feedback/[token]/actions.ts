"use server";

import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { getEventFeedbackTicket } from "@/lib/event-feedback";

export type EventFeedbackFormState = {
  error?: string;
  success?: boolean;
};

const feedbackInput = z.object({
  token: z.string().min(1),
  rating: z.coerce.number().int().min(1).max(5),
  message: z.string().trim().max(2000).optional(),
});

export async function submitEventFeedbackAction(
  _previousState: EventFeedbackFormState,
  formData: FormData,
): Promise<EventFeedbackFormState> {
  const parsed = feedbackInput.safeParse({
    token: formData.get("token"),
    rating: formData.get("rating"),
    message: formData.get("message") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Choose a rating and try again." };
  }

  const ticket = await getEventFeedbackTicket(parsed.data.token);
  if (!ticket) return { error: "This feedback link is invalid or no longer active." };

  await getPrisma().eventFeedback.upsert({
    where: { registrationId: ticket.registrationId },
    create: {
      eventId: ticket.registration.event.id,
      registrationId: ticket.registrationId,
      rating: parsed.data.rating,
      message: parsed.data.message || null,
    },
    update: {
      rating: parsed.data.rating,
      message: parsed.data.message || null,
      submittedAt: new Date(),
    },
  });

  return { success: true };
}
