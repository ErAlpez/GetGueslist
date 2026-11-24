import { NextRequest, NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import {
  getPaddleApiBaseUrl,
  getPaddleBillingPeriodEnd,
  getPaddleEnvironment,
  getPaddlePriceDetails,
} from "@/lib/payment-provider";
import { mapPaddleSubscriptionStatus, verifyPaddleWebhookSignature } from "@/lib/paddle-webhook-utils";
import { isPaddleWebhookIpAllowed } from "@/lib/paddle-ip-allowlist";

type PaddleCustomData = {
  workspaceId?: unknown;
  planCode?: unknown;
  billingPeriod?: unknown;
};

type PaddleItem = {
  price_id?: string | null;
  price?: { id?: string | null } | null;
};

type PaddleWebhookEvent = {
  event_type?: string;
  occurred_at?: string;
  data?: {
    id?: string;
    transaction_id?: string | null;
    subscription_id?: string | null;
    status?: string;
    customer_id?: string | null;
    custom_data?: PaddleCustomData | null;
    items?: PaddleItem[];
    current_billing_period?: {
      starts_at?: string | null;
      ends_at?: string | null;
    } | null;
    next_billed_at?: string | null;
    scheduled_change?: {
      action?: string | null;
      effective_at?: string | null;
    } | null;
    currency_code?: string;
    details?: { totals?: { grand_total?: string } };
  };
};

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getPriceId(items: PaddleItem[] | undefined) {
  const item = items?.[0];
  return item?.price?.id ?? item?.price_id ?? null;
}

function getTrustedPriceDetails(priceId: string | null, customData: PaddleCustomData | null | undefined) {
  if (!priceId || !customData || typeof customData.workspaceId !== "string") return null;
  const priceDetails = getPaddlePriceDetails(priceId);
  if (
    !priceDetails ||
    customData.planCode !== priceDetails.planCode ||
    customData.billingPeriod !== priceDetails.billingPeriod
  ) {
    return null;
  }
  return { ...priceDetails, workspaceId: customData.workspaceId };
}

export async function POST(request: NextRequest) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Paddle webhook verification is not configured." }, { status: 503 });
  }

  const payload = await request.text();
  if (!verifyPaddleWebhookSignature(payload, request.headers.get("paddle-signature"), secret)) {
    return NextResponse.json({ error: "Invalid Paddle webhook signature." }, { status: 401 });
  }

  const sourceIp = request.headers.get("x-forwarded-for")?.trim();
  if (!sourceIp || sourceIp.includes(",")) {
    return NextResponse.json({ error: "Paddle webhook source IP is missing or invalid." }, { status: 403 });
  }

  let allowedSourceIp: boolean;
  try {
    const ipsEndpoint = `${getPaddleApiBaseUrl(getPaddleEnvironment())}/ips`;
    allowedSourceIp = await isPaddleWebhookIpAllowed(sourceIp, ipsEndpoint);
  } catch (error) {
    console.error("Could not verify the Paddle webhook source IP.", error);
    return NextResponse.json({ error: "Paddle webhook IP verification is temporarily unavailable." }, { status: 503 });
  }
  if (!allowedSourceIp) {
    return NextResponse.json({ error: "Paddle webhook source IP is not allowed." }, { status: 403 });
  }

  let event: PaddleWebhookEvent;
  try {
    event = JSON.parse(payload) as PaddleWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid webhook JSON." }, { status: 400 });
  }

  const occurredAt = parseDate(event.occurred_at);
  if (!event.event_type || !event.data || !occurredAt) {
    return NextResponse.json({ error: "Paddle webhook is missing required event fields." }, { status: 400 });
  }

  const prisma = getPrisma();
  if (event.event_type === "transaction.completed") {
    const details = getTrustedPriceDetails(getPriceId(event.data.items), event.data.custom_data);
    const total = Number(event.data.details?.totals?.grand_total);
    const currency = event.data.currency_code;
    if (
      !details ||
      !event.data.id ||
      !Number.isSafeInteger(total) ||
      total < 0 ||
      !currency ||
      !/^[A-Z]{3}$/.test(currency)
    ) {
      return NextResponse.json({ error: "Paddle transaction data is invalid or does not match a configured price." }, { status: 400 });
    }

    const subscription = await prisma.subscription.findUnique({
      where: { workspaceId: details.workspaceId },
      select: {
        id: true,
        provider: true,
        providerCheckoutId: true,
      },
    });
    if (!subscription || subscription.provider !== "paddle") {
      return NextResponse.json({ error: "Paddle subscription workspace was not found." }, { status: 404 });
    }

    const invoice = {
      subscriptionId: subscription.id,
      providerTransactionId: event.data.id,
      amountCents: total,
      currency,
      status: "paid",
      paidAt: occurredAt,
      issuedAt: occurredAt,
    };

    if (details.paymentType === "one_time") {
      if (event.data.subscription_id) {
        return NextResponse.json({ error: "A one-time Paddle payment unexpectedly created a subscription." }, { status: 400 });
      }

      const plan = await prisma.plan.findUnique({
        where: { code: details.planCode },
        select: { id: true, isActive: true },
      });
      if (!plan?.isActive) {
        return NextResponse.json({ error: "The paid Paddle plan is not available." }, { status: 404 });
      }

      const billingPeriodEnd = getPaddleBillingPeriodEnd(occurredAt, details.billingPeriod);
      const updatedCount = await prisma.$transaction(async (transaction) => {
        const updated = await transaction.subscription.updateMany({
          where: {
            id: subscription.id,
            provider: "paddle",
            providerCheckoutId: event.data!.id,
          },
          data: {
            planId: plan.id,
            status: "ACTIVE",
            providerCustomerId: event.data!.customer_id ?? null,
            providerSubscriptionId: null,
            providerCheckoutId: null,
            providerEventAt: occurredAt,
            billingPeriodStart: occurredAt,
            billingPeriodEnd,
            renewalDate: billingPeriodEnd,
            scheduledCancellationAt: null,
          },
        });
        await transaction.subscriptionInvoice.createMany({
          data: [invoice],
          skipDuplicates: true,
        });
        return updated.count;
      });

      return NextResponse.json({ received: true, updated: updatedCount === 1 });
    }

    await prisma.subscriptionInvoice.createMany({
      data: [invoice],
      skipDuplicates: true,
    });
    return NextResponse.json({ received: true });
  }

  if (!event.event_type.startsWith("subscription.")) {
    return NextResponse.json({ received: true });
  }

  const details = getTrustedPriceDetails(getPriceId(event.data.items), event.data.custom_data);
  const status = event.data.status ? mapPaddleSubscriptionStatus(event.data.status) : null;
  if (!details || details.paymentType !== "recurring" || !event.data.id || !status) {
    return NextResponse.json({ error: "Paddle subscription data is invalid or does not match a configured price." }, { status: 400 });
  }

  const planCode = status === "CANCELLED" ? "FREE" : details.planCode;
  const [subscription, plan] = await Promise.all([
    prisma.subscription.findUnique({
      where: { workspaceId: details.workspaceId },
      select: {
        provider: true,
        providerSubscriptionId: true,
        providerCheckoutId: true,
        providerEventAt: true,
        billingPeriodEnd: true,
      },
    }),
    prisma.plan.findUnique({ where: { code: planCode }, select: { id: true, isActive: true } }),
  ]);
  if (!subscription || !plan?.isActive) {
    return NextResponse.json({ error: "Paddle subscription workspace or plan was not found." }, { status: 404 });
  }

  if (event.event_type === "subscription.created"
    ? subscription.providerCheckoutId !== event.data.transaction_id
    : subscription.provider !== "paddle" ||
      subscription.providerSubscriptionId !== event.data.id ||
      subscription.providerCheckoutId !== null) {
    return NextResponse.json({ received: true, ignored: "superseded subscription" });
  }
  if (subscription.providerEventAt && subscription.providerEventAt >= occurredAt) {
    return NextResponse.json({ received: true, ignored: "stale event" });
  }

  const billingPeriodStart = parseDate(event.data.current_billing_period?.starts_at);
  const billingPeriodEnd = parseDate(event.data.current_billing_period?.ends_at)
    ?? (status === "CANCELLED" ? subscription.billingPeriodEnd : null);
  const renewalDate = parseDate(event.data.next_billed_at);
  const scheduledCancellationAt = event.data.scheduled_change?.action === "cancel"
    ? parseDate(event.data.scheduled_change.effective_at)
    : null;
  const updated = await prisma.subscription.updateMany({
    where: {
      workspaceId: details.workspaceId,
      ...(event.event_type === "subscription.created"
        ? { providerCheckoutId: event.data.transaction_id }
        : {
            provider: "paddle",
            providerSubscriptionId: event.data.id,
            providerCheckoutId: null,
          }),
      OR: [{ providerEventAt: null }, { providerEventAt: { lt: occurredAt } }],
    },
    data: {
      planId: plan.id,
      status,
      provider: "paddle",
      providerCustomerId: event.data.customer_id ?? null,
      providerSubscriptionId: event.data.id,
      providerCheckoutId: null,
      providerEventAt: occurredAt,
      ...(billingPeriodStart ? { billingPeriodStart } : {}),
      billingPeriodEnd,
      renewalDate,
      scheduledCancellationAt,
    },
  });

  return NextResponse.json({ received: true, updated: updated.count === 1 });
}
