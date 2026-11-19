"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/super-admin";

const moderationInput = z.object({
  reviewId: z.string().trim().min(1).max(64),
  status: z.enum(["APPROVED", "HIDDEN"]),
});

export async function moderatePlatformReviewAction(formData: FormData) {
  const admin = await requireSuperAdmin();
  const parsed = moderationInput.safeParse({
    reviewId: formData.get("reviewId"),
    status: formData.get("status"),
  });
  if (!parsed.success) throw new Error("Choose a valid review moderation action.");

  await getPrisma().$transaction(async (transaction) => {
    const review = await transaction.platformReview.findUnique({
      where: { id: parsed.data.reviewId },
      select: {
        id: true,
        rating: true,
        publicationConsent: true,
        status: true,
        workspaceName: true,
      },
    });
    if (!review) throw new Error("The review could not be found.");
    if (parsed.data.status === "APPROVED" && (review.rating !== 5 || !review.publicationConsent)) {
      throw new Error("Only opted-in 5-star reviews can be approved for publication.");
    }
    if (review.status === parsed.data.status) return;

    await transaction.platformReview.update({
      where: { id: review.id },
      data: {
        status: parsed.data.status,
        moderatedAt: new Date(),
        moderatedById: admin.user.id,
      },
    });
    await transaction.superAdminAuditLog.create({
      data: {
        adminId: admin.user.id,
        action: parsed.data.status === "APPROVED" ? "platform_review.approved" : "platform_review.hidden",
        entityId: review.id,
        metadata: { rating: review.rating, workspaceName: review.workspaceName },
      },
    });
  });

  revalidatePath("/dashboard/admin/plans");
  revalidatePath("/");
}
