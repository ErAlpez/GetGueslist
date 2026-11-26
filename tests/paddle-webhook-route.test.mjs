import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const provider = require(path.join(root, "src/lib/payment-provider.ts"));
const source = fs.readFileSync(path.join(root, "src/app/api/paddle/webhook/route.ts"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

let prisma;
let allowedSourceIp = true;
let requestedIpEndpoint = "";
const mocks = {
  "next/server": {
    NextResponse: {
      json: (body, init) => ({ body, status: init?.status ?? 200 }),
    },
  },
  "@/lib/payment-provider": provider,
  "@/lib/paddle-webhook-utils": {
    mapPaddleSubscriptionStatus: (status) => ({
      active: "ACTIVE",
      canceled: "CANCELLED",
    })[status] ?? null,
    verifyPaddleWebhookSignature: () => true,
  },
  "@/lib/paddle-ip-allowlist": {
    isPaddleWebhookIpAllowed: async (address, endpoint) => {
      requestedIpEndpoint = endpoint;
      return address === "34.237.3.244" && allowedSourceIp;
    },
  },
  "@/lib/prisma": { getPrisma: () => prisma },
};
const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
const loaded = { exports: {} };
new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
const { POST } = loaded.exports;

function makeRequest(event, sourceIp = "34.237.3.244") {
  return {
    text: async () => JSON.stringify(event),
    headers: {
      get: (name) => name === "paddle-signature"
        ? "verified"
        : name === "x-forwarded-for"
          ? sourceIp
          : null,
    },
  };
}

function makeEvent(eventType, data, occurredAt = "2026-01-01T00:00:00.000Z") {
  return { event_type: eventType, occurred_at: occurredAt, data };
}

test("paid one-time Paddle transaction activates the selected plan through the paid period", async () => {
  const previousEnvironment = { ...process.env };
  process.env.PADDLE_WEBHOOK_SECRET = "webhook-secret";
  process.env.PADDLE_ONE_TIME_PRICE_STARTER_MONTHLY = "pri_starter_one_time_monthly";

  let subscriptionUpdate;
  let invoiceRows;
  const transaction = {
    subscription: {
      updateMany: async (args) => {
        subscriptionUpdate = args;
        return { count: 1 };
      },
    },
    subscriptionInvoice: {
      createMany: async (args) => {
        invoiceRows = args;
        return { count: 1 };
      },
    },
  };
  const transactionId = "txn_0123456789abcdefghijklmnop";
  prisma = {
    plan: { findUnique: async () => ({ id: "starter-plan", isActive: true }) },
    subscription: {
      findUnique: async () => ({
        id: "workspace-subscription",
        provider: "paddle",
        providerCheckoutId: transactionId,
      }),
    },
    $transaction: async (callback) => callback(transaction),
  };

  try {
    const response = await POST(makeRequest(makeEvent("transaction.completed", {
      id: transactionId,
      subscription_id: null,
      customer_id: "ctm_customer",
      items: [{ price_id: "pri_starter_one_time_monthly" }],
      custom_data: { workspaceId: "workspace-123", planCode: "STARTER", billingPeriod: "monthly" },
      details: { totals: { grand_total: "199" } },
      currency_code: "USD",
    })));

    assert.equal(response.status, 200);
    assert.equal(requestedIpEndpoint, "https://api.paddle.com/ips");
    assert.deepEqual(response.body, { received: true, updated: true });
    assert.deepEqual(subscriptionUpdate.where, {
      id: "workspace-subscription",
      provider: "paddle",
      providerCheckoutId: transactionId,
    });
    assert.equal(subscriptionUpdate.data.planId, "starter-plan");
    assert.equal(subscriptionUpdate.data.status, "ACTIVE");
    assert.equal(subscriptionUpdate.data.providerSubscriptionId, null);
    assert.equal(subscriptionUpdate.data.billingPeriodStart.toISOString(), "2026-01-01T00:00:00.000Z");
    assert.equal(subscriptionUpdate.data.billingPeriodEnd.toISOString(), "2026-02-01T00:00:00.000Z");
    assert.equal(subscriptionUpdate.data.renewalDate.toISOString(), "2026-02-01T00:00:00.000Z");
    assert.equal(invoiceRows.data[0].providerTransactionId, transactionId);
  } finally {
    process.env = previousEnvironment;
  }
});

test("Paddle webhooks from unlisted IP addresses are rejected", async () => {
  const previousEnvironment = { ...process.env };
  process.env.PADDLE_WEBHOOK_SECRET = "webhook-secret";
  prisma = {};

  try {
    const response = await POST(
      makeRequest(makeEvent("transaction.completed", {}), "203.0.113.1"),
    );

    assert.equal(response.status, 403);
    assert.deepEqual(response.body, { error: "Paddle webhook source IP is not allowed." });
  } finally {
    process.env = previousEnvironment;
  }
});

test("canceled recurring Paddle subscriptions return to the Free plan", async () => {
  const previousEnvironment = { ...process.env };
  const subscriptionId = "sub_abcdefghijklmnopqrstuvwxyz";
  const currentPeriodEnd = new Date("2026-02-01T00:00:00.000Z");
  Object.assign(process.env, {
    PADDLE_WEBHOOK_SECRET: "webhook-secret",
    PADDLE_PRICE_STARTER_MONTHLY: "pri_starter_recurring_monthly",
  });
  let planLookup;
  let subscriptionUpdate;
  prisma = {
    plan: {
      findUnique: async ({ where }) => {
        planLookup = where.code;
        return { id: "free-plan", isActive: true };
      },
    },
    subscription: {
      findUnique: async () => ({
        provider: "paddle",
        providerSubscriptionId: subscriptionId,
        providerCheckoutId: null,
        providerEventAt: null,
        billingPeriodEnd: currentPeriodEnd,
      }),
      updateMany: async (args) => {
        subscriptionUpdate = args;
        return { count: 1 };
      },
    },
  };

  try {
    const response = await POST(makeRequest(makeEvent("subscription.canceled", {
      id: subscriptionId,
      status: "canceled",
      custom_data: { workspaceId: "workspace-123", planCode: "STARTER", billingPeriod: "monthly" },
      items: [{ price_id: "pri_starter_recurring_monthly" }],
    }, "2026-02-01T00:00:00.000Z")));

    assert.equal(response.status, 200);
    assert.equal(planLookup, "FREE");
    assert.equal(subscriptionUpdate.data.planId, "free-plan");
    assert.equal(subscriptionUpdate.data.status, "CANCELLED");
    assert.equal(subscriptionUpdate.data.billingPeriodEnd, currentPeriodEnd);
  } finally {
    process.env = previousEnvironment;
  }
});
