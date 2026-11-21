import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadTypeScript(file, mocks = {}) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}

const { planFeatureOptions } = loadTypeScript("src/lib/plan-features.ts");

function createPlanForm({
  id,
  code = "CUSTOM",
  name = "Custom",
  features = ["includes_free"],
  isActive = true,
  monthlyPriceDollars = "100.00",
  yearlyPriceDollars = "1000.00",
} = {}) {
  const formData = new FormData();
  if (id) formData.set("id", id);
  formData.set("code", code);
  formData.set("name", name);
  formData.set("description", "A custom plan");
  formData.set("monthlyPriceDollars", monthlyPriceDollars);
  formData.set("yearlyPriceDollars", yearlyPriceDollars);
  formData.set("activeEventLimit", "");
  formData.set("attendeePerEventLimit", "100");
  if (isActive) formData.set("isActive", "true");
  for (const feature of features) formData.append("features", feature);
  return formData;
}

function loadActions({ transaction, calls }) {
  const mocks = {
    "@prisma/client": {
      Prisma: { PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {} },
      SubscriptionStatus: {
        ACTIVE: "ACTIVE",
        TRIALING: "TRIALING",
        PAST_DUE: "PAST_DUE",
        CANCELLED: "CANCELLED",
        EXPIRED: "EXPIRED",
      },
    },
    "next/cache": { revalidatePath: (...args) => calls.revalidated.push(args) },
    "@/lib/plan-features": { planFeatureOptions },
    "@/lib/prisma": { getPrisma: () => ({ $transaction: async (callback) => callback(transaction) }) },
    "@/lib/super-admin": { requireSuperAdmin: async () => ({ user: { id: "admin-1" } }) },
  };
  return loadTypeScript("src/app/dashboard/admin/plans/actions.ts", mocks);
}

test("creates plans with validated known features and writes an audit entry", async () => {
  const calls = { created: [], audits: [], revalidated: [] };
  const transaction = {
    plan: {
      create: async ({ data }) => {
        calls.created.push(data);
        return { id: "plan-1", ...data };
      },
    },
    superAdminAuditLog: {
      create: async ({ data }) => calls.audits.push(data),
    },
  };
  const { savePlanAction } = loadActions({ transaction, calls });
  const result = await savePlanAction({}, createPlanForm({ features: ["includes_free", "custom_forms"] }));

  assert.deepEqual(result, { success: "Plan created." });
  assert.deepEqual(calls.created[0].features, ["includes_free", "custom_forms"]);
  assert.equal(calls.created[0].monthlyPriceCents, 10000);
  assert.equal(calls.created[0].yearlyPriceCents, 100000);
  assert.equal(calls.created[0].activeEventLimit, null);
  assert.equal(calls.audits[0].adminId, "admin-1");
  assert.equal(calls.audits[0].action, "plan.created");
  assert.deepEqual(calls.revalidated, [["/dashboard/admin/plans"], ["/dashboard", "layout"]]);
});

test("converts decimal dollar prices to cents without rounding", async () => {
  const calls = { created: [], audits: [], revalidated: [] };
  const transaction = {
    plan: { create: async ({ data }) => calls.created.push(data) },
    superAdminAuditLog: {
      create: async ({ data }) => calls.audits.push(data),
    },
  };
  const { savePlanAction } = loadActions({ transaction, calls });
  const result = await savePlanAction({}, createPlanForm({
    monthlyPriceDollars: "99.99",
    yearlyPriceDollars: "1200.5",
  }));

  assert.deepEqual(result, { success: "Plan created." });
  assert.equal(calls.created[0].monthlyPriceCents, 9999);
  assert.equal(calls.created[0].yearlyPriceCents, 120050);
});

test("rejects dollar prices with more than two decimal places", async () => {
  const calls = { created: [], audits: [], revalidated: [] };
  const transaction = {
    plan: { create: async ({ data }) => calls.created.push(data) },
    superAdminAuditLog: {
      create: async ({ data }) => calls.audits.push(data),
    },
  };
  const { savePlanAction } = loadActions({ transaction, calls });
  const result = await savePlanAction({}, createPlanForm({ monthlyPriceDollars: "99.999" }));

  assert.match(result.error, /two decimal places/);
  assert.equal(calls.created.length, 0);
});

test("rejects unknown feature flags without writing a plan", async () => {
  const calls = { created: [], audits: [], revalidated: [] };
  const transaction = {
    plan: { create: async ({ data }) => calls.created.push(data) },
    superAdminAuditLog: { create: async ({ data }) => calls.audits.push(data) },
  };
  const { savePlanAction } = loadActions({ transaction, calls });
  const result = await savePlanAction({}, createPlanForm({ features: ["not_a_real_feature"] }));

  assert.deepEqual(result, { error: "One or more selected plan features are invalid." });
  assert.equal(calls.created.length, 0);
  assert.equal(calls.audits.length, 0);
});

test("cannot deactivate the Free plan even if a submitted code is tampered", async () => {
  const calls = { updates: [], audits: [], revalidated: [] };
  const transaction = {
    plan: {
      findUnique: async () => ({ id: "free-plan", code: "FREE" }),
      update: async ({ data }) => calls.updates.push(data),
    },
    superAdminAuditLog: {
      create: async ({ data }) => calls.audits.push(data),
    },
  };
  const { savePlanAction } = loadActions({ transaction, calls });
  const result = await savePlanAction({}, createPlanForm({
    id: "free-plan",
    code: "OTHER",
    name: "Free",
    isActive: false,
    features: [],
  }));

  assert.deepEqual(result, { error: "The Free plan must remain active for new accounts." });
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.audits.length, 0);
});

test("persists the selected active plan and status for a workspace subscription", async () => {
  const calls = { updates: [], audits: [], revalidated: [] };
  const transaction = {
    workspace: { findUnique: async () => ({ id: "workspace-1", name: "Workspace One" }) },
    plan: { findFirst: async () => ({ id: "plan-max", code: "PROFESSIONAL", name: "Max" }) },
    subscription: {
      findUnique: async () => ({
        id: "subscription-1",
        plan: { code: "STARTER" },
        status: "ACTIVE",
      }),
      update: async ({ data }) => {
        calls.updates.push(data);
        return { status: data.status };
      },
    },
    superAdminAuditLog: {
      create: async ({ data }) => calls.audits.push(data),
    },
  };
  const { updateWorkspacePlanAction } = loadActions({ transaction, calls });
  const formData = new FormData();
  formData.set("workspaceId", "workspace-1");
  formData.set("planId", "plan-max");
  formData.set("status", "TRIALING");
  const result = await updateWorkspacePlanAction({}, formData);

  assert.deepEqual(result, { success: "Workspace subscription updated." });
  assert.deepEqual(calls.updates[0], { planId: "plan-max", status: "TRIALING" });
  assert.equal(calls.audits[0].metadata.previousPlan, "STARTER");
  assert.equal(calls.audits[0].metadata.plan, "PROFESSIONAL");
});
