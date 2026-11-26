import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/lib/payment-provider.ts"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mocks = { "server-only": {} };
const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
const loaded = { exports: {} };
new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
const {
  getPaymentProvider,
  getPaymentProviderName,
  getPaddleCheckoutConfig,
  getPaddleApiBaseUrl,
  getPaddleBillingPeriodFromDates,
  getPaddleBillingPeriodEnd,
  getPaddleEnvironment,
  getPaddlePriceDetails,
  isPaddleSubscriptionId,
  schedulePaddleSubscriptionCancellation,
  upgradePaddleSubscription,
} = loaded.exports;

test("Paddle is the default billing provider when no provider is selected", () => {
  const previousProvider = process.env.PAYMENT_PROVIDER;
  delete process.env.PAYMENT_PROVIDER;

  try {
    assert.equal(getPaymentProviderName(), "paddle");
  } finally {
    if (previousProvider === undefined) delete process.env.PAYMENT_PROVIDER;
    else process.env.PAYMENT_PROVIDER = previousProvider;
  }
});

test("Paddle defaults to Live when no environment is selected", () => {
  const previousEnvironment = process.env.PADDLE_ENVIRONMENT;
  delete process.env.PADDLE_ENVIRONMENT;

  try {
    assert.equal(getPaddleEnvironment(), "live");
    assert.equal(getPaddleApiBaseUrl(), "https://api.paddle.com");
  } finally {
    if (previousEnvironment === undefined) delete process.env.PADDLE_ENVIRONMENT;
    else process.env.PADDLE_ENVIRONMENT = previousEnvironment;
  }
});

test("PayMongo is not an available payment provider", () => {
  const previousProvider = process.env.PAYMENT_PROVIDER;
  process.env.PAYMENT_PROVIDER = "paymongo";
  try {
    assert.throws(getPaymentProviderName, /Unsupported payment provider "paymongo"/);
  } finally {
    if (previousProvider === undefined) delete process.env.PAYMENT_PROVIDER;
    else process.env.PAYMENT_PROVIDER = previousProvider;
  }
});

test("Paddle checkout uses the sandbox price and attaches trusted workspace metadata", async () => {
  const previousEnvironment = { ...process.env };
  const previousFetch = globalThis.fetch;
  Object.assign(process.env, {
    PAYMENT_PROVIDER: "paddle",
    PADDLE_API_KEY: "sandbox-api-key",
    PADDLE_ENVIRONMENT: "sandbox",
    PADDLE_WEBHOOK_SECRET: "sandbox-webhook-secret",
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "test-client-token",
    PADDLE_ONE_TIME_PRICE_STARTER_MONTHLY: "pri_starter_monthly",
  });
  let requestUrl = "";
  let requestOptions;
  globalThis.fetch = async (url, options) => {
    requestUrl = String(url);
    requestOptions = options;
    return {
      ok: true,
      json: async () => ({ data: { id: "txn_0123456789abcdefghijklmnop" } }),
    };
  };

  try {
    const provider = getPaymentProvider();
    const result = await provider.createCheckoutSession({
      workspaceId: "workspace-123",
      planCode: "STARTER",
      planName: "Starter",
      amountCents: 9900,
      billingPeriod: "monthly",
      successUrl: "https://example.test/success",
      cancelUrl: "https://example.test/cancel",
      checkoutUrl: "https://example.test/paddle-checkout",
    });

    assert.equal(requestUrl, "https://sandbox-api.paddle.com/transactions");
    assert.equal(requestOptions.headers.Authorization, "Bearer sandbox-api-key");
    assert.deepEqual(JSON.parse(requestOptions.body), {
      collection_mode: "automatic",
      items: [{ price_id: "pri_starter_monthly", quantity: 1 }],
      custom_data: {
        workspaceId: "workspace-123",
        planCode: "STARTER",
        billingPeriod: "monthly",
      },
    });
    assert.deepEqual(result, {
      provider: "paddle",
      providerSessionId: "txn_0123456789abcdefghijklmnop",
      redirectUrl: "https://example.test/paddle-checkout?transaction_id=txn_0123456789abcdefghijklmnop",
    });
  } finally {
    process.env = previousEnvironment;
    globalThis.fetch = previousFetch;
  }
});

test("Paddle checkout fails clearly when a plan price ID is missing", async () => {
  const previousEnvironment = { ...process.env };
  Object.assign(process.env, {
    PAYMENT_PROVIDER: "paddle",
    PADDLE_API_KEY: "sandbox-api-key",
    PADDLE_ENVIRONMENT: "sandbox",
    PADDLE_WEBHOOK_SECRET: "sandbox-webhook-secret",
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "test-client-token",
  });
  delete process.env.PADDLE_ONE_TIME_PRICE_STARTER_ANNUAL;

  try {
    const provider = getPaymentProvider();
    await assert.rejects(
      provider.createCheckoutSession({
        workspaceId: "workspace-123",
        planCode: "STARTER",
        planName: "Starter",
        amountCents: 99000,
        billingPeriod: "annual",
        successUrl: "https://example.test/success",
        cancelUrl: "https://example.test/cancel",
        checkoutUrl: "https://example.test/paddle-checkout",
      }),
      /Paddle one-time STARTER annual price ID is not configured/,
    );
  } finally {
    process.env = previousEnvironment;
  }
});

test("Paddle checkout rejects an amount where a price ID is required", async () => {
  const previousEnvironment = { ...process.env };
  Object.assign(process.env, {
    PAYMENT_PROVIDER: "paddle",
    PADDLE_API_KEY: "sandbox-api-key",
    PADDLE_ENVIRONMENT: "sandbox",
    PADDLE_WEBHOOK_SECRET: "sandbox-webhook-secret",
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "test-client-token",
    PADDLE_ONE_TIME_PRICE_STARTER_MONTHLY: "1.99",
  });

  try {
    const provider = getPaymentProvider();
    await assert.rejects(
      provider.createCheckoutSession({
        workspaceId: "workspace-123",
        planCode: "STARTER",
        planName: "Starter",
        amountCents: 199,
        billingPeriod: "monthly",
        successUrl: "https://example.test/success",
        cancelUrl: "https://example.test/cancel",
        checkoutUrl: "https://example.test/paddle-checkout",
      }),
      /must be a Paddle price ID beginning with "pri_", not a price amount/,
    );
  } finally {
    process.env = previousEnvironment;
  }
});

test("Paddle checkout configuration exposes configured IDs and the client token", () => {
  const previousEnvironment = { ...process.env };
  Object.assign(process.env, {
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "sandbox-client-token",
    PADDLE_ENVIRONMENT: "sandbox",
    PADDLE_ONE_TIME_PRICE_STARTER_MONTHLY: "pri_starter_monthly",
    PADDLE_ONE_TIME_PRICE_STARTER_ANNUAL: "pri_starter_annual",
    PADDLE_ONE_TIME_PRICE_PROFESSIONAL_MONTHLY: "pri_professional_monthly",
    PADDLE_ONE_TIME_PRICE_PROFESSIONAL_ANNUAL: "pri_professional_annual",
  });

  try {
    assert.deepEqual(getPaddleCheckoutConfig(), {
      clientToken: "sandbox-client-token",
      environment: "sandbox",
      priceIds: {
        STARTER: {
          monthly: "pri_starter_monthly",
          annual: "pri_starter_annual",
        },
        PROFESSIONAL: {
          monthly: "pri_professional_monthly",
          annual: "pri_professional_annual",
        },
      },
    });
  } finally {
    process.env = previousEnvironment;
  }
});

test("Paddle subscription cancellation is scheduled at the end of the billing period", async () => {
  const previousEnvironment = { ...process.env };
  const previousFetch = globalThis.fetch;
  const subscriptionId = "sub_abcdefghijklmnopqrstuvwxyz";
  Object.assign(process.env, {
    PADDLE_API_KEY: "sandbox-api-key",
    PADDLE_ENVIRONMENT: "sandbox",
  });
  let requestUrl = "";
  let requestOptions;
  globalThis.fetch = async (url, options) => {
    requestUrl = String(url);
    requestOptions = options;
    return {
      ok: true,
      json: async () => ({
        data: {
          id: subscriptionId,
          scheduled_change: {
            action: "cancel",
            effective_at: "2026-12-01T00:00:00.000Z",
          },
        },
      }),
    };
  };

  try {
    const effectiveAt = await schedulePaddleSubscriptionCancellation(subscriptionId);
    assert.equal(requestUrl, `https://sandbox-api.paddle.com/subscriptions/${subscriptionId}/cancel`);
    assert.equal(requestOptions.method, "POST");
    assert.equal(requestOptions.headers.Authorization, "Bearer sandbox-api-key");
    assert.deepEqual(JSON.parse(requestOptions.body), { effective_from: "next_billing_period" });
    assert.equal(effectiveAt.toISOString(), "2026-12-01T00:00:00.000Z");
  } finally {
    process.env = previousEnvironment;
    globalThis.fetch = previousFetch;
  }
});

test("Paddle billing dates identify monthly and annual intervals", () => {
  assert.equal(
    getPaddleBillingPeriodFromDates(new Date("2026-01-31T00:00:00Z"), new Date("2026-02-28T00:00:00Z")),
    "monthly",
  );
  assert.equal(
    getPaddleBillingPeriodFromDates(new Date("2024-01-01T00:00:00Z"), new Date("2025-01-01T00:00:00Z")),
    "annual",
  );
  assert.equal(getPaddleBillingPeriodFromDates(null, new Date("2026-02-01T00:00:00Z")), null);
  assert.equal(
    getPaddleBillingPeriodFromDates(new Date("2026-01-01T00:00:00Z"), new Date("2026-01-15T00:00:00Z")),
    null,
  );
});

test("manual Paddle billing periods preserve calendar dates without overflowing months", () => {
  assert.equal(
    getPaddleBillingPeriodEnd(new Date("2026-01-31T12:00:00Z"), "monthly").toISOString(),
    "2026-02-28T12:00:00.000Z",
  );
  assert.equal(
    getPaddleBillingPeriodEnd(new Date("2024-02-29T12:00:00Z"), "annual").toISOString(),
    "2025-02-28T12:00:00.000Z",
  );
});

test("Paddle price lookup distinguishes one-time prices from existing recurring prices", () => {
  const previousEnvironment = { ...process.env };
  Object.assign(process.env, {
    PADDLE_PRICE_STARTER_MONTHLY: "pri_recurring_starter",
    PADDLE_ONE_TIME_PRICE_STARTER_MONTHLY: "pri_one_time_starter",
  });

  try {
    assert.deepEqual(getPaddlePriceDetails("pri_recurring_starter"), {
      planCode: "STARTER",
      billingPeriod: "monthly",
      paymentType: "recurring",
    });
    assert.deepEqual(getPaddlePriceDetails("pri_one_time_starter"), {
      planCode: "STARTER",
      billingPeriod: "monthly",
      paymentType: "one_time",
    });
  } finally {
    process.env = previousEnvironment;
  }
});

test("Paddle subscription upgrades use the matching Max price and immediate proration", async () => {
  const previousEnvironment = { ...process.env };
  const previousFetch = globalThis.fetch;
  const subscriptionId = "sub_abcdefghijklmnopqrstuvwxyz";
  Object.assign(process.env, {
    PADDLE_API_KEY: "sandbox-api-key",
    PADDLE_ENVIRONMENT: "sandbox",
    PADDLE_PRICE_PROFESSIONAL_ANNUAL: "pri_professional_annual",
  });
  let requestUrl = "";
  let requestOptions;
  globalThis.fetch = async (url, options) => {
    requestUrl = String(url);
    requestOptions = options;
    return {
      ok: true,
      json: async () => ({
        data: {
          id: subscriptionId,
          items: [{ price: { id: "pri_professional_annual" } }],
        },
      }),
    };
  };

  try {
    await upgradePaddleSubscription(subscriptionId, "workspace-123", "annual");
    assert.equal(requestUrl, `https://sandbox-api.paddle.com/subscriptions/${subscriptionId}`);
    assert.equal(requestOptions.method, "PATCH");
    assert.equal(requestOptions.headers.Authorization, "Bearer sandbox-api-key");
    assert.deepEqual(JSON.parse(requestOptions.body), {
      items: [{ price_id: "pri_professional_annual", quantity: 1 }],
      proration_billing_mode: "prorated_immediately",
      custom_data: {
        workspaceId: "workspace-123",
        planCode: "PROFESSIONAL",
        billingPeriod: "annual",
      },
    });
  } finally {
    process.env = previousEnvironment;
    globalThis.fetch = previousFetch;
  }
});

test("Paddle subscription upgrade fails when Paddle does not confirm the Max price", async () => {
  const previousEnvironment = { ...process.env };
  const previousFetch = globalThis.fetch;
  Object.assign(process.env, {
    PADDLE_API_KEY: "sandbox-api-key",
    PADDLE_ENVIRONMENT: "sandbox",
    PADDLE_PRICE_PROFESSIONAL_MONTHLY: "pri_professional_monthly",
  });
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      data: {
        id: "sub_abcdefghijklmnopqrstuvwxyz",
        items: [{ price_id: "pri_starter_monthly" }],
      },
    }),
  });

  try {
    await assert.rejects(
      upgradePaddleSubscription("sub_abcdefghijklmnopqrstuvwxyz", "workspace-123", "monthly"),
      /Paddle did not confirm the upgraded subscription price/,
    );
  } finally {
    process.env = previousEnvironment;
    globalThis.fetch = previousFetch;
  }
});

test("Paddle subscription checks reject non-Paddle checkout IDs", () => {
  assert.equal(isPaddleSubscriptionId("sub_abcdefghijklmnopqrstuvwxyz"), true);
  assert.equal(isPaddleSubscriptionId("cs_3a5a12345678901234567890"), false);
  assert.equal(isPaddleSubscriptionId("txn_abcdefghijklmnopqrstuvwxyz"), false);
});
