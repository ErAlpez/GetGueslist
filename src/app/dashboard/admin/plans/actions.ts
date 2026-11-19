"use server";

import { Prisma, SubscriptionStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import { planFeatureOptions } from "@/lib/plan-features";
import { requireSuperAdmin } from "@/lib/super-admin";

export type AdminActionState = {
  error?: string;
  success?: string;
};

const featureCodes = new Set(planFeatureOptions.map(({ code }) => code));
const numericText = z.union([z.literal(""), z.string().regex(/^\d+$/)]);

const planInput = z.object({
  id: z.string().optional(),
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/, "Use 2–40 uppercase letters, numbers, or underscores for the plan code."),
  name: z.string().trim().min(2, "Enter a plan name.").max(60),
  description: z.string().trim().max(240),
  monthlyPriceCents: numericText.transform((value) => value === "" ? null : Number(value))
    .pipe(z.number().int().safe().nonnegative().nullable()),
  yearlyPriceCents: numericText.transform((value) => value === "" ? null : Number(value))
    .pipe(z.number().int().safe().nonnegative().nullable()),
  activeEventLimit: numericText.transform((value) => value === "" ? null : Number(value))
    .pipe(z.number().int().safe().nonnegative().nullable()),
  attendeePerEventLimit: numericText.transform((value) => value === "" ? null : Number(value))
    .pipe(z.number().int().safe().nonnegative().nullable()),
  features: z.array(z.string()).max(64),
});

function readPlanInput(formData: FormData) {
  const rawFeatures = formData.getAll("features");
  if (rawFeatures.some((value) => typeof value !== "string")) {
    return { success: false as const, error: "Select valid plan features." };
  }
  const parsed = planInput.safeParse({
    id: formData.get("id") || undefined,
    code: formData.get("code"),
    name: formData.get("name"),
    description: formData.get("description"),
    monthlyPriceCents: formData.get("monthlyPriceCents"),
    yearlyPriceCents: formData.get("yearlyPriceCents"),
    activeEventLimit: formData.get("activeEventLimit"),
    attendeePerEventLimit: formData.get("attendeePerEventLimit"),
    features: rawFeatures,
  });
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0]?.message ?? "Check the plan details." };
  }
  if (parsed.data.features.some((feature) => !featureCodes.has(feature))) {
    return { success: false as const, error: "One or more selected plan features are invalid." };
  }
  return { success: true as const, data: parsed.data };
}

export async function savePlanAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireSuperAdmin();
  const parsed = readPlanInput(formData);
  if (!parsed.success) return { error: parsed.error };

  const isActive = formData.get("isActive") === "true";
  const { id, ...input } = parsed.data;
  const prisma = getPrisma();

  try {
    const saved = await prisma.$transaction(async (transaction) => {
      if (id) {
        const existing = await transaction.plan.findUnique({ where: { id } });
        if (!existing) return null;
        if (existing.code === "FREE" && !isActive) return "FREE_MUST_STAY_ACTIVE" as const;
        const plan = await transaction.plan.update({
          where: { id: existing.id },
          data: {
            name: input.name,
            description: input.description || null,
            monthlyPriceCents: input.monthlyPriceCents,
            yearlyPriceCents: input.yearlyPriceCents,
            activeEventLimit: input.activeEventLimit,
            attendeePerEventLimit: input.attendeePerEventLimit,
            features: input.features,
            isActive,
          },
        });
        await transaction.superAdminAuditLog.create({
          data: {
            adminId: admin.user.id,
            action: "plan.updated",
            entityId: plan.id,
            metadata: {
              code: plan.code,
              previous: {
                name: existing.name,
                description: existing.description,
                monthlyPriceCents: existing.monthlyPriceCents,
                yearlyPriceCents: existing.yearlyPriceCents,
                activeEventLimit: existing.activeEventLimit,
                attendeePerEventLimit: existing.attendeePerEventLimit,
                features: JSON.stringify(existing.features),
                isActive: existing.isActive,
              },
              current: {
                name: plan.name,
                description: plan.description,
                monthlyPriceCents: plan.monthlyPriceCents,
                yearlyPriceCents: plan.yearlyPriceCents,
                activeEventLimit: plan.activeEventLimit,
                attendeePerEventLimit: plan.attendeePerEventLimit,
                features: JSON.stringify(plan.features),
                isActive: plan.isActive,
              },
            },
          },
        });
        return plan;
      }

      const plan = await transaction.plan.create({
        data: {
          code: input.code,
          name: input.name,
          description: input.description || null,
          monthlyPriceCents: input.monthlyPriceCents,
          yearlyPriceCents: input.yearlyPriceCents,
          activeEventLimit: input.activeEventLimit,
          attendeePerEventLimit: input.attendeePerEventLimit,
          features: input.features,
          isActive,
        },
      });
      await transaction.superAdminAuditLog.create({
        data: {
          adminId: admin.user.id,
          action: "plan.created",
          entityId: plan.id,
          metadata: {
            code: plan.code,
            name: plan.name,
            monthlyPriceCents: plan.monthlyPriceCents,
            yearlyPriceCents: plan.yearlyPriceCents,
            activeEventLimit: plan.activeEventLimit,
            attendeePerEventLimit: plan.attendeePerEventLimit,
            features: JSON.stringify(plan.features),
            isActive: plan.isActive,
          },
        },
      });
      return plan;
    });

    if (saved === "FREE_MUST_STAY_ACTIVE") {
      return { error: "The Free plan must remain active for new accounts." };
    }
    if (!saved) return { error: "This plan no longer exists. Refresh and try again." };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "That plan code is already in use." };
    }
    throw error;
  }

  revalidatePath("/dashboard/admin/plans");
  revalidatePath("/dashboard", "layout");
  return { success: id ? "Plan saved." : "Plan created." };
}

const subscriptionInput = z.object({
  workspaceId: z.string().min(1),
  planId: z.string().min(1),
  status: z.nativeEnum(SubscriptionStatus),
});

export async function updateWorkspacePlanAction(
  _previousState: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  const admin = await requireSuperAdmin();
  const parsed = subscriptionInput.safeParse({
    workspaceId: formData.get("workspaceId"),
    planId: formData.get("planId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: "Choose a valid workspace, plan, and subscription status." };

  const prisma = getPrisma();
  const result = await prisma.$transaction(async (transaction) => {
    const [workspace, plan, existing] = await Promise.all([
      transaction.workspace.findUnique({ where: { id: parsed.data.workspaceId }, select: { id: true, name: true } }),
      transaction.plan.findFirst({ where: { id: parsed.data.planId, isActive: true }, select: { id: true, code: true, name: true } }),
      transaction.subscription.findUnique({
        where: { workspaceId: parsed.data.workspaceId },
        select: { id: true, plan: { select: { code: true } }, status: true },
      }),
    ]);
    if (!workspace) return "WORKSPACE_NOT_FOUND";
    if (!plan) return "PLAN_NOT_AVAILABLE";

    const subscription = existing
      ? await transaction.subscription.update({
          where: { workspaceId: workspace.id },
          data: { planId: plan.id, status: parsed.data.status },
        })
      : await transaction.subscription.create({
          data: { workspaceId: workspace.id, planId: plan.id, status: parsed.data.status },
        });
    await transaction.superAdminAuditLog.create({
      data: {
        adminId: admin.user.id,
        action: "workspace.subscription_updated",
        entityId: workspace.id,
        metadata: {
          workspaceName: workspace.name,
          previousPlan: existing?.plan.code ?? null,
          plan: plan.code,
          previousStatus: existing?.status ?? null,
          status: subscription.status,
        },
      },
    });
    return "UPDATED";
  });

  if (result === "WORKSPACE_NOT_FOUND") return { error: "That workspace no longer exists." };
  if (result === "PLAN_NOT_AVAILABLE") return { error: "Choose an active plan." };

  revalidatePath("/dashboard/admin/plans");
  revalidatePath("/dashboard", "layout");
  return { success: "Workspace subscription updated." };
}
