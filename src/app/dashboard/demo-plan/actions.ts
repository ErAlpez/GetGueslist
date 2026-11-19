"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getWorkspaceContext } from "@/lib/workspace";

const demoPlanCodes = ["FREE", "STARTER", "PROFESSIONAL"] as const;

export async function switchDemoPlanAction(formData: FormData) {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("Demo plan switching is only available in development.");
  }

  const context = await getWorkspaceContext();
  if (!context) redirect("/login");
  if (
    context.user.id !== "guestlist-demo-user" ||
    context.workspace.id !== "guestlist-demo-workspace"
  ) {
    throw new Error("Demo plan switching is only available to the local demo workspace.");
  }

  const planCode = demoPlanCodes.find((code) => code === formData.get("planCode"));
  if (!planCode) throw new Error("Choose a valid demo plan.");

  const prisma = getPrisma();
  const plan = await prisma.plan.findFirst({
    where: { code: planCode, isActive: true },
    select: { id: true },
  });
  if (!plan) throw new Error(`The active ${planCode} plan could not be found.`);

  await prisma.subscription.upsert({
    where: { workspaceId: context.workspace.id },
    create: { workspaceId: context.workspace.id, planId: plan.id, status: "ACTIVE" },
    update: { planId: plan.id },
  });

  const requestedPath = formData.get("returnTo");
  const returnTo = typeof requestedPath === "string" && /^\/dashboard(?:\/|$)/.test(requestedPath)
    ? requestedPath
    : "/dashboard";
  revalidatePath("/dashboard", "layout");
  redirect(returnTo);
}
