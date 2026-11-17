"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { sendFeedbackEmail } from "@/lib/email";
import { getWorkspaceContext } from "@/lib/workspace";

export type FeedbackFormState = {
  error?: string;
  success?: boolean;
};

const feedbackInput = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  message: z.string().trim().min(1, "Enter a message before sending feedback.").max(2000, "Messages must be 2,000 characters or fewer."),
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
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Choose a rating and enter a message." };
  }

  try {
    await sendFeedbackEmail({
      rating: parsed.data.rating,
      message: parsed.data.message,
      email: context.user.email,
      workspaceName: context.workspace.name,
    });
  } catch (error) {
    console.error("Could not deliver workspace feedback.", error);
    return { error: error instanceof Error ? error.message : "Could not send feedback. Please try again." };
  }

  return { success: true };
}
