import "server-only";
import type { PaddleBillingPeriod, PaddleCheckoutConfig } from "@/lib/paddle-pricing";

export type PaymentProviderName = "paddle";

export type CheckoutRequest = {
  workspaceId: string;
  planCode: string;
  planName: string;
  amountCents: number;
  billingPeriod: "monthly" | "annual";
  successUrl: string;
  cancelUrl: string;
  checkoutUrl: string;
};

export type CheckoutSession = {
  provider: PaymentProviderName;
  providerSessionId: string;
  redirectUrl: string;
};

export interface PaymentProvider {
  provider: PaymentProviderName;
  createCheckoutSession(input: CheckoutRequest): Promise<CheckoutSession>;
}

export class PaymentProviderUnavailableError extends Error {
  constructor(message = "Subscription checkout is not configured. Connect a payment provider before enabling upgrades.") {
    super(message);
    this.name = "PaymentProviderUnavailableError";
  }
}

const paddlePriceEnvironmentKeys = {
  STARTER: {
    monthly: "PADDLE_PRICE_STARTER_MONTHLY",
    annual: "PADDLE_PRICE_STARTER_ANNUAL",
  },
  PROFESSIONAL: {
    monthly: "PADDLE_PRICE_PROFESSIONAL_MONTHLY",
    annual: "PADDLE_PRICE_PROFESSIONAL_ANNUAL",
  },
} as const;

const paddleOneTimePriceEnvironmentKeys = {
  STARTER: {
    monthly: "PADDLE_ONE_TIME_PRICE_STARTER_MONTHLY",
    annual: "PADDLE_ONE_TIME_PRICE_STARTER_ANNUAL",
  },
  PROFESSIONAL: {
    monthly: "PADDLE_ONE_TIME_PRICE_PROFESSIONAL_MONTHLY",
    annual: "PADDLE_ONE_TIME_PRICE_PROFESSIONAL_ANNUAL",
  },
} as const;

export function getPaymentProviderName(): PaymentProviderName {
  const provider = process.env.PAYMENT_PROVIDER?.trim().toLowerCase() || "paddle";
  if (provider === "paddle") return provider;
  throw new Error(`Unsupported payment provider "${provider}".`);
}

export function isPaddleSubscriptionId(value: string | null | undefined): value is string {
  return typeof value === "string" && /^sub_[a-z\d]{26}$/i.test(value);
}

export function getPaddleBillingPeriodFromDates(
  start: Date | null | undefined,
  end: Date | null | undefined,
): PaddleBillingPeriod | null {
  if (!start || !end) return null;
  const days = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  if (days >= 300 && days <= 400) return "annual";
  if (days >= 20 && days <= 40) return "monthly";
  return null;
}

export function getPaddleBillingPeriodEnd(start: Date, billingPeriod: PaddleBillingPeriod): Date {
  const end = new Date(start);
  const originalDay = end.getUTCDate();
  end.setUTCDate(1);
  if (billingPeriod === "annual") {
    end.setUTCFullYear(end.getUTCFullYear() + 1);
  } else {
    end.setUTCMonth(end.getUTCMonth() + 1);
  }
  const lastDayOfTargetMonth = new Date(Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  end.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
  return end;
}

function getPaddleEnvironment(): "sandbox" | "live" {
  const environment = process.env.PADDLE_ENVIRONMENT?.trim().toLowerCase() || "sandbox";
  if (environment !== "sandbox" && environment !== "live") {
    throw new Error('PADDLE_ENVIRONMENT must be either "sandbox" or "live".');
  }
  return environment;
}

function getPaddleApiBaseUrl(environment = getPaddleEnvironment()) {
  return environment === "sandbox"
    ? "https://sandbox-api.paddle.com"
    : "https://api.paddle.com";
}

export async function schedulePaddleSubscriptionCancellation(subscriptionId: string) {
  const apiKey = process.env.PADDLE_API_KEY?.trim();
  if (!apiKey) {
    throw new PaymentProviderUnavailableError("Paddle cancellation requires a server-side API key.");
  }
  if (!isPaddleSubscriptionId(subscriptionId)) {
    throw new Error("The stored Paddle subscription ID is invalid.");
  }

  const response = await fetch(
    `${getPaddleApiBaseUrl()}/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ effective_from: "next_billing_period" }),
    },
  );
  const body = await response.json() as {
    data?: {
      id?: string;
      scheduled_change?: {
        action?: string;
        effective_at?: string | null;
      } | null;
    };
    error?: { detail?: string };
  };

  if (!response.ok) {
    throw new Error(body.error?.detail ?? "Paddle could not schedule the subscription cancellation.");
  }

  const effectiveAt = body.data?.scheduled_change?.action === "cancel"
    ? body.data.scheduled_change.effective_at
    : null;
  const cancellationDate = effectiveAt ? new Date(effectiveAt) : null;
  if (
    body.data?.id !== subscriptionId ||
    !cancellationDate ||
    Number.isNaN(cancellationDate.getTime())
  ) {
    throw new Error("Paddle did not confirm the scheduled cancellation date.");
  }
  return cancellationDate;
}

export async function upgradePaddleSubscription(
  subscriptionId: string,
  workspaceId: string,
  billingPeriod: PaddleBillingPeriod,
) {
  const apiKey = process.env.PADDLE_API_KEY?.trim();
  if (!apiKey) {
    throw new PaymentProviderUnavailableError("Paddle plan upgrades require a server-side API key.");
  }
  if (!isPaddleSubscriptionId(subscriptionId)) {
    throw new Error("The stored Paddle subscription ID is invalid.");
  }

  const priceId = getPaddlePriceId("PROFESSIONAL", billingPeriod);
  const response = await fetch(
    `${getPaddleApiBaseUrl()}/subscriptions/${encodeURIComponent(subscriptionId)}`,
    {
      method: "PATCH",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        items: [{ price_id: priceId, quantity: 1 }],
        proration_billing_mode: "prorated_immediately",
        custom_data: {
          workspaceId,
          planCode: "PROFESSIONAL",
          billingPeriod,
        },
      }),
    },
  );
  const body = await response.json() as {
    data?: {
      id?: string;
      items?: Array<{ price_id?: string; price?: { id?: string } }>;
    };
    error?: { detail?: string };
    errors?: Array<{ detail?: string }>;
  };

  if (!response.ok) {
    throw new Error(
      body.error?.detail
      ?? body.errors?.[0]?.detail
      ?? "Paddle could not upgrade the subscription.",
    );
  }
  if (
    body.data?.id !== subscriptionId ||
    !body.data.items?.some((item) => (item.price?.id ?? item.price_id) === priceId)
  ) {
    throw new Error("Paddle did not confirm the upgraded subscription price.");
  }
}

export function getPaddlePriceDetails(priceId: string) {
  for (const [planCode, periods] of Object.entries(paddlePriceEnvironmentKeys)) {
    for (const [billingPeriod, environmentKey] of Object.entries(periods)) {
      if (process.env[environmentKey]?.trim() === priceId) {
        return {
          planCode,
          billingPeriod: billingPeriod as "monthly" | "annual",
          paymentType: "recurring" as const,
        };
      }
    }
  }
  for (const [planCode, periods] of Object.entries(paddleOneTimePriceEnvironmentKeys)) {
    for (const [billingPeriod, environmentKey] of Object.entries(periods)) {
      if (process.env[environmentKey]?.trim() === priceId) {
        return {
          planCode,
          billingPeriod: billingPeriod as "monthly" | "annual",
          paymentType: "one_time" as const,
        };
      }
    }
  }
  return null;
}

export function getPaddleCheckoutConfig(): PaddleCheckoutConfig | null {
  const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN?.trim();
  const apiKey = process.env.PADDLE_API_KEY?.trim();
  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET?.trim();
  if (!clientToken || !apiKey || !webhookSecret) return null;

  try {
    return {
      clientToken,
      environment: getPaddleEnvironment(),
      priceIds: {
        STARTER: {
          monthly: getPaddleOneTimePriceId("STARTER", "monthly"),
          annual: getPaddleOneTimePriceId("STARTER", "annual"),
        },
        PROFESSIONAL: {
          monthly: getPaddleOneTimePriceId("PROFESSIONAL", "monthly"),
          annual: getPaddleOneTimePriceId("PROFESSIONAL", "annual"),
        },
      },
    };
  } catch (error) {
    if (error instanceof PaymentProviderUnavailableError) return null;
    throw error;
  }
}

function getPaddlePriceId(planCode: string, billingPeriod: CheckoutRequest["billingPeriod"]) {
  const environmentKey = paddlePriceEnvironmentKeys[
    planCode as keyof typeof paddlePriceEnvironmentKeys
  ]?.[billingPeriod];
  const priceId = environmentKey ? process.env[environmentKey]?.trim() : undefined;
  if (!priceId) {
    throw new PaymentProviderUnavailableError(
      `The Paddle ${planCode} ${billingPeriod} price ID is not configured.`,
    );
  }
  if (!priceId.startsWith("pri_")) {
    throw new PaymentProviderUnavailableError(
      `The Paddle ${planCode} ${billingPeriod} setting must be a Paddle price ID beginning with "pri_", not a price amount.`,
    );
  }
  return priceId;
}

function getPaddleOneTimePriceId(planCode: string, billingPeriod: CheckoutRequest["billingPeriod"]) {
  const environmentKey = paddleOneTimePriceEnvironmentKeys[
    planCode as keyof typeof paddleOneTimePriceEnvironmentKeys
  ]?.[billingPeriod];
  const priceId = environmentKey ? process.env[environmentKey]?.trim() : undefined;
  if (!priceId) {
    throw new PaymentProviderUnavailableError(
      `The Paddle one-time ${planCode} ${billingPeriod} price ID is not configured.`,
    );
  }
  if (!priceId.startsWith("pri_")) {
    throw new PaymentProviderUnavailableError(
      `The Paddle one-time ${planCode} ${billingPeriod} setting must be a Paddle price ID beginning with "pri_", not a price amount.`,
    );
  }
  return priceId;
}

export function getPaymentProvider(): PaymentProvider {
  getPaymentProviderName();
  const apiKey = process.env.PADDLE_API_KEY?.trim();
  const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN?.trim();
  const webhookSecret = process.env.PADDLE_WEBHOOK_SECRET?.trim();
  if (!apiKey || !clientToken || !webhookSecret) {
    throw new PaymentProviderUnavailableError(
      "Paddle checkout requires its API key, client-side token, and webhook secret.",
    );
  }

  return new PaddlePaymentProvider(apiKey, getPaddleEnvironment());
}

class PaddlePaymentProvider implements PaymentProvider {
  readonly provider = "paddle" as const;

  constructor(
    private readonly apiKey: string,
    private readonly environment: "sandbox" | "live",
  ) {}

  async createCheckoutSession(input: CheckoutRequest): Promise<CheckoutSession> {
    const priceId = getPaddleOneTimePriceId(input.planCode, input.billingPeriod);
    const response = await fetch(`${getPaddleApiBaseUrl(this.environment)}/transactions`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        collection_mode: "automatic",
        items: [{ price_id: priceId, quantity: 1 }],
        custom_data: {
          workspaceId: input.workspaceId,
          planCode: input.planCode,
          billingPeriod: input.billingPeriod,
        },
      }),
    });

    const body = await response.json() as {
      data?: {
        id?: string;
      };
      error?: { detail?: string };
    };

    if (!response.ok || !body.data?.id) {
      throw new Error(body.error?.detail ?? "Paddle could not create a checkout transaction.");
    }

    return {
      provider: this.provider,
      providerSessionId: body.data.id,
      redirectUrl: `${input.checkoutUrl}?transaction_id=${encodeURIComponent(body.data.id)}`,
    };
  }
}
