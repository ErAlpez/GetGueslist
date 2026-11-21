"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import {
  getPaymentProvider,
  getPaymentProviderName,
  getPaddleBillingPeriodFromDates,
  isPaddleSubscriptionId,
  PaymentProviderUnavailableError,
  schedulePaddleSubscriptionCancellation,
  upgradePaddleSubscription,
} from "@/lib/payment-provider";
import { requireWorkspacePermission } from "@/lib/workspace";

export type PaddleRenewalActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export type PaddleUpgradeActionState = PaddleRenewalActionState;

const checkoutInput = z.object({
  planCode: z.enum(["STARTER", "PROFESSIONAL"]),
  billingPeriod: z.enum(["monthly", "annual"]),
});

export async function startPlanCheckoutAction(formData: FormData) {
  const context = await requireWorkspacePermission("billing.manage");
  const parsed = checkoutInput.safeParse({
    planCode: formData.get("planCode"),
    billingPeriod: formData.get("billingPeriod"),
  });
  if (!parsed.success) throw new Error("Choose a valid plan and billing period.");

  const plan = await getPrisma().plan.findUnique({
    where: { code: parsed.data.planCode, isActive: true },
  });
  if (!plan) throw new Error("That plan is not available.");

  const amountCents = parsed.data.billingPeriod === "annual"
    ? plan.yearlyPriceCents
    : plan.monthlyPriceCents;
  if (!amountCents || amountCents <= 0) throw new Error("That plan is not configured for checkout.");

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const providerName = getPaymentProviderName();
  const existingSubscription = await getPrisma().subscription.findUnique({
    where: { workspaceId: context.workspace.id },
    select: {
      provider: true,
      providerSubscriptionId: true,
      providerCheckoutId: true,
      status: true,
      billingPeriodEnd: true,
      scheduledCancellationAt: true,
    },
  });
  const now = new Date();
  const activePaddleStatus = Boolean(
    existingSubscription &&
    ["ACTIVE", "TRIALING", "PAST_DUE"].includes(existingSubscription.status),
  );
  const hasActivePaddleTerm = Boolean(
    providerName === "paddle" &&
    existingSubscription?.provider === "paddle" &&
    activePaddleStatus &&
    (isPaddleSubscriptionId(existingSubscription.providerSubscriptionId)
      ? !existingSubscription.scheduledCancellationAt || existingSubscription.scheduledCancellationAt > now
      : Boolean(existingSubscription.billingPeriodEnd && existingSubscription.billingPeriodEnd > now)),
  );
  const hasUnresolvedPaddlePayment = providerName === "paddle"
    && existingSubscription?.provider === "paddle"
    && existingSubscription.status === "PAST_DUE"
    && isPaddleSubscriptionId(existingSubscription.providerSubscriptionId);
  if (hasActivePaddleTerm || hasUnresolvedPaddlePayment) {
    redirect("/dashboard/billing");
  }
  if (providerName === "paddle" && existingSubscription?.providerCheckoutId) {
    redirect("/dashboard/billing");
  }

  let session;
  try {
    session = await getPaymentProvider().createCheckoutSession({
      workspaceId: context.workspace.id,
      planCode: plan.code,
      planName: plan.name,
      amountCents,
      billingPeriod: parsed.data.billingPeriod,
      successUrl: `${baseUrl}/dashboard/billing?checkout=success`,
      cancelUrl: `${baseUrl}/dashboard/billing?checkout=cancelled`,
      checkoutUrl: `${baseUrl}/paddle-checkout`,
    });
  } catch (error) {
    if (error instanceof PaymentProviderUnavailableError) throw error;
    throw error;
  }

  await getPrisma().subscription.update({
    where: { workspaceId: context.workspace.id },
    data: {
      provider: session.provider,
      providerCustomerId: null,
      providerSubscriptionId: null,
      providerCheckoutId: session.providerSessionId,
    },
  });

  redirect(session.redirectUrl);
}

export async function disablePaddleSubscriptionRenewalAction(
  _previousState: PaddleRenewalActionState,
  formData: FormData,
): Promise<PaddleRenewalActionState> {
  if (formData.get("confirmAutoRenewOff") !== "yes") {
    return { status: "error", message: "Confirm that you want to turn auto-renew off." };
  }

  const context = await requireWorkspacePermission("billing.manage");
  const prisma = getPrisma();
  const subscription = await prisma.subscription.findUnique({
    where: { workspaceId: context.workspace.id },
    select: {
      id: true,
      provider: true,
      providerSubscriptionId: true,
      status: true,
      scheduledCancellationAt: true,
    },
  });

  if (
    !subscription ||
    subscription.provider !== "paddle" ||
    !subscription.providerSubscriptionId ||
    !["ACTIVE", "TRIALING", "PAST_DUE", "PAUSED"].includes(subscription.status)
  ) {
    return { status: "error", message: "No active Paddle subscription is available to manage." };
  }
  if (subscription.scheduledCancellationAt) {
    return {
      status: "success",
      message: "Cancellation is already scheduled.",
    };
  }
  if (subscription.status === "PAUSED") {
    return {
      status: "error",
      message: "Paddle only allows paused subscriptions to be canceled immediately. Contact support to manage this subscription.",
    };
  }

  let effectiveAt: Date;
  try {
    effectiveAt = await schedulePaddleSubscriptionCancellation(subscription.providerSubscriptionId);
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Paddle could not schedule the cancellation.",
    };
  }

  try {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { scheduledCancellationAt: effectiveAt },
    });
  } catch (error) {
    console.error("Paddle scheduled a cancellation, but the local subscription record could not be updated.", error);
    return {
      status: "error",
      message: "Paddle accepted the cancellation, but billing could not refresh yet. Please wait for the webhook before trying again.",
    };
  }

  revalidatePath("/dashboard/billing");
  return {
    status: "success",
    message: "Auto-renew is off. Cancellation is scheduled for the end of this billing period.",
  };
}

export async function upgradeStarterToMaxAction(
  _previousState: PaddleUpgradeActionState,
  formData: FormData,
): Promise<PaddleUpgradeActionState> {
  if (formData.get("confirmPlanUpgrade") !== "yes") {
    return { status: "error", message: "Confirm the immediate prorated upgrade to Max." };
  }

  const context = await requireWorkspacePermission("billing.manage");
  const prisma = getPrisma();
  const subscription = await prisma.subscription.findUnique({
    where: { workspaceId: context.workspace.id },
    select: {
      provider: true,
      providerSubscriptionId: true,
      providerCheckoutId: true,
      status: true,
      scheduledCancellationAt: true,
      billingPeriodStart: true,
      billingPeriodEnd: true,
      plan: { select: { code: true } },
    },
  });

  if (
    !subscription ||
    subscription.provider !== "paddle" ||
    !isPaddleSubscriptionId(subscription.providerSubscriptionId) ||
    subscription.plan.code !== "STARTER"
  ) {
    return { status: "error", message: "An active Paddle Starter subscription is required to upgrade." };
  }
  if (!["ACTIVE", "TRIALING"].includes(subscription.status)) {
    return { status: "error", message: "Resolve the subscription status before upgrading to Max." };
  }
  if (subscription.providerCheckoutId) {
    return { status: "error", message: "Wait for the pending Paddle checkout to finish before upgrading." };
  }
  if (subscription.scheduledCancellationAt && subscription.scheduledCancellationAt <= new Date()) {
    return { status: "error", message: "The renewal date has arrived. Make a manual payment to continue the plan." };
  }

  const billingPeriod = getPaddleBillingPeriodFromDates(
    subscription.billingPeriodStart,
    subscription.billingPeriodEnd,
  );
  if (!billingPeriod) {
    return {
      status: "error",
      message: "Paddle has not provided a supported billing period yet. Wait for the subscription to sync, then try again.",
    };
  }

  const maxPlan = await prisma.plan.findUnique({
    where: { code: "PROFESSIONAL" },
    select: { isActive: true },
  });
  if (!maxPlan?.isActive) {
    return { status: "error", message: "The Max plan is not currently available." };
  }

  try {
    await upgradePaddleSubscription(
      subscription.providerSubscriptionId,
      context.workspace.id,
      billingPeriod,
    );
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Paddle could not upgrade the subscription.",
    };
  }

  revalidatePath("/dashboard/billing");
  return {
    status: "success",
    message: "Paddle accepted the upgrade. The prorated charge is immediate; Max access starts when the subscription webhook syncs.",
  };
}
