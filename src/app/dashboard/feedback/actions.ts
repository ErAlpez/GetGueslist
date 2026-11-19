"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { sendFeedbackEmail } from "@/lib/email";
import { getPrisma } from "@/lib/prisma";
import { getWorkspaceContext } from "@/lib/workspace";

export type FeedbackFormState = {
  error?: string;
  notificationError?: boolean;
  success?: boolean;
};

const feedbackInput = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  message: z.string().trim().min(1, "Enter a message before sending feedback.").max(2000, "Messages must be 2,000 characters or fewer."),
  publicationConsent: z.boolean(),
});

export async function submitFeedbackAction(
  _previousState: FeedbackFormState,
  formData: FormData,
): Promise<FeedbackFormState> {
  const context = await getWorkspaceContext();
  if (!context) redirect("/login");

  const parsed = feedbackInput.safeParse({
    rating: formData.get("rating"),
    message: formData.get("message"),
    publicationConsent: formData.get("publicationConsent") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Choose a rating and enter a message." };
  }

  if (parsed.data.publicationConsent && context.membership.role !== "OWNER") {
    return { error: "Only workspace owners may submit a public review." };
  }

  if (context.membership.role === "OWNER") {
    await getPrisma().platformReview.create({
      data: {
        ownerId: context.user.id,
        workspaceId: context.workspace.id,
        authorName: context.user.name,
        workspaceName: context.workspace.name,
        rating: parsed.data.rating,
        message: parsed.data.message,
        publicationConsent: parsed.data.publicationConsent,
      },
    });
  }

  let notificationError = false;
  try {
    await sendFeedbackEmail({
      rating: parsed.data.rating,
      message: parsed.data.message,
      email: context.user.email,
      workspaceName: context.workspace.name,
    });
  } catch (error) {
    console.error("Could not deliver workspace feedback.", error);
    notificationError = true;
  }

  return { success: true, notificationError };
}
