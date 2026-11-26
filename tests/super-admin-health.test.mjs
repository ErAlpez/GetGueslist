import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadHealth({ queryRaw = async () => 1, healthRuns = {} } = {}) {
  const source = fs.readFileSync(path.join(root, "src/lib/super-admin-health.ts"), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loadedModule = { exports: {} };
  const prisma = {
    $queryRaw: queryRaw,
    systemHealthRun: {
      create: async () => ({ id: "run-1", checkedAt: new Date() }),
      deleteMany: async () => ({ count: 0 }),
      findMany: async () => [],
      ...healthRuns,
    },
  };
  const mocks = {
    "server-only": {},
    "@/lib/prisma": { getPrisma: () => prisma },
  };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  new Function("require", "module", "exports", output)(localRequire, loadedModule, loadedModule.exports);
  return { ...loadedModule.exports, prisma };
}

async function withEnvironment(values, callback) {
  const keys = [
    "DATABASE_URL",
    "RESEND_API_KEY",
    "EMAIL_FROM",
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "PAYMENT_PROVIDER",
    "PADDLE_ENVIRONMENT",
    "PADDLE_API_KEY",
    "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN",
    "PADDLE_WEBHOOK_SECRET",
    "PADDLE_PRICE_STARTER_MONTHLY",
    "PADDLE_PRICE_STARTER_ANNUAL",
    "PADDLE_PRICE_PROFESSIONAL_MONTHLY",
    "PADDLE_PRICE_PROFESSIONAL_ANNUAL",
    "PADDLE_ONE_TIME_PRICE_STARTER_MONTHLY",
    "PADDLE_ONE_TIME_PRICE_STARTER_ANNUAL",
    "PADDLE_ONE_TIME_PRICE_PROFESSIONAL_MONTHLY",
    "PADDLE_ONE_TIME_PRICE_PROFESSIONAL_ANNUAL",
  ];
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) {
    if (Object.hasOwn(values, key)) process.env[key] = values[key];
    else delete process.env[key];
  }
  try {
    await callback();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("labels platform providers and exposes missing service configuration", async () => {
  await withEnvironment({ DATABASE_URL: "postgresql://test" }, async () => {
    let queries = 0;
    let fetches = 0;
    const { collectSuperAdminHealthChecks } = loadHealth({
      queryRaw: async () => { queries += 1; return 1; },
    });
    const checks = await collectSuperAdminHealthChecks(async () => {
      fetches += 1;
      return { ok: true, status: 200 };
    });
    const byId = new Map(checks.map((check) => [check.id, check]));

    assert.equal(queries, 1);
    assert.equal(fetches, 0);
    assert.equal(byId.get("database").provider, "PostgreSQL");
    assert.equal(byId.get("database").status, "healthy");
    assert.equal(byId.get("billing").status, "not-configured");
    assert.equal(byId.get("resend").status, "not-configured");
    assert.equal(byId.get("file-storage").provider, "Supabase Storage");
    assert.equal(byId.get("file-storage").status, "not-configured");
    assert.equal(byId.get("rate-limiting").provider, "Better Auth · PostgreSQL");
    assert.equal(byId.get("rate-limiting").status, "unknown");
    assert.equal(byId.get("rate-limiting").label, "Configured · DB-backed");
  });
});

test("reports Paddle configuration without claiming that the API was probed", async () => {
  const paddleIds = {
    PAYMENT_PROVIDER: "paddle",
    PADDLE_ENVIRONMENT: "live",
    PADDLE_API_KEY: "test-api-key",
    NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: "test-client-token",
    PADDLE_WEBHOOK_SECRET: "test-webhook-secret",
    PADDLE_PRICE_STARTER_MONTHLY: "pri_starter_monthly",
    PADDLE_PRICE_STARTER_ANNUAL: "pri_starter_annual",
    PADDLE_PRICE_PROFESSIONAL_MONTHLY: "pri_professional_monthly",
    PADDLE_PRICE_PROFESSIONAL_ANNUAL: "pri_professional_annual",
    PADDLE_ONE_TIME_PRICE_STARTER_MONTHLY: "pri_one_time_starter_monthly",
    PADDLE_ONE_TIME_PRICE_STARTER_ANNUAL: "pri_one_time_starter_annual",
    PADDLE_ONE_TIME_PRICE_PROFESSIONAL_MONTHLY: "pri_one_time_professional_monthly",
    PADDLE_ONE_TIME_PRICE_PROFESSIONAL_ANNUAL: "pri_one_time_professional_annual",
  };
  await withEnvironment(paddleIds, async () => {
    const { collectSuperAdminHealthChecks } = loadHealth();
    const billing = (await collectSuperAdminHealthChecks()).find(({ id }) => id === "billing");

    assert.equal(billing.provider, "Paddle");
    assert.equal(billing.status, "unknown");
    assert.equal(billing.label, "Configured · API not probed");
    assert.equal(billing.latencyMs, null);
  });
});

test("does not ping Resend when email configuration is incomplete", async () => {
  await withEnvironment({
    DATABASE_URL: "postgresql://test",
    RESEND_API_KEY: "test-api-key",
  }, async () => {
    let fetches = 0;
    const { collectSuperAdminHealthChecks } = loadHealth();
    const checks = await collectSuperAdminHealthChecks(async () => {
      fetches += 1;
      return { ok: true, status: 200 };
    });

    assert.equal(fetches, 0);
    assert.equal(checks.find((check) => check.id === "resend").status, "not-configured");
  });
});

test("does not send the Supabase service key to a non-HTTPS host", async () => {
  await withEnvironment({
    SUPABASE_URL: "http://storage.example",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  }, async () => {
    let fetches = 0;
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const { collectSuperAdminHealthChecks } = loadHealth();
      const checks = await collectSuperAdminHealthChecks(async () => {
        fetches += 1;
        return { ok: true, status: 200 };
      });

      assert.equal(fetches, 0);
      assert.equal(checks.find((check) => check.id === "file-storage").status, "attention");
    } finally {
      console.error = originalConsoleError;
    }
  });
});

test("checks Resend and Supabase APIs without sending email or exposing credentials", async () => {
  await withEnvironment({
    DATABASE_URL: "postgresql://test",
    RESEND_API_KEY: "test-api-key",
    EMAIL_FROM: "VenuGuestPass <hello@example.com>",
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  }, async () => {
    const requests = [];
    const { collectSuperAdminHealthChecks } = loadHealth();
    const checks = await collectSuperAdminHealthChecks(async (url, options) => {
      requests.push({ url: String(url), options });
      return { ok: true, status: 200 };
    });
    const resend = requests.find(({ url }) => url === "https://api.resend.com/domains");
    const storage = requests.find(({ url }) => url === "https://project.supabase.co/storage/v1/bucket");

    assert.equal(resend.options.headers.Authorization, "Bearer test-api-key");
    assert.equal(resend.options.cache, "no-store");
    assert.equal(storage.options.headers.apikey, "test-service-role-key");
    assert.equal(storage.options.headers.Authorization, "Bearer test-service-role-key");
    assert.equal(storage.options.cache, "no-store");
    assert.equal(checks.find((check) => check.id === "resend").status, "healthy");
    assert.equal(checks.find((check) => check.id === "file-storage").status, "healthy");
    assert.match(checks.find((check) => check.id === "file-storage").detail, /still stores event attachments in PostgreSQL/);
  });
});

test("surfaces failed database, email, and storage probes", async () => {
  await withEnvironment({
    DATABASE_URL: "postgresql://test",
    RESEND_API_KEY: "test-api-key",
    EMAIL_FROM: "VenuGuestPass <hello@example.com>",
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  }, async () => {
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const { collectSuperAdminHealthChecks } = loadHealth({
        queryRaw: async () => { throw new Error("database down"); },
      });
      const checks = await collectSuperAdminHealthChecks(async (url) => ({
        ok: false,
        status: String(url).includes("resend") ? 401 : 503,
      }));

      assert.equal(checks.find((check) => check.id === "database").status, "attention");
      assert.equal(checks.find((check) => check.id === "resend").status, "attention");
      assert.equal(checks.find((check) => check.id === "file-storage").status, "attention");
    } finally {
      console.error = originalConsoleError;
    }
  });
});

test("stores scheduled checks and prunes history beyond seven days", async () => {
  await withEnvironment({}, async () => {
    let created;
    let deleted;
    const now = new Date("2026-11-19T10:00:00.000Z");
    const { runSuperAdminHealthChecks, prisma } = loadHealth({
      healthRuns: {
        create: async ({ data }) => {
          created = data;
          return { id: "run-1", checkedAt: data.checkedAt };
        },
        deleteMany: async ({ where }) => { deleted = where; return { count: 0 }; },
      },
    });
    const result = await runSuperAdminHealthChecks(async () => ({ ok: true, status: 200 }), prisma, now);

    assert.equal(result.checks.length, 5);
    assert.equal(created.checkedAt, now);
    assert.equal(created.checks.create.length, 5);
    assert.equal(deleted.checkedAt.lt.toISOString(), "2026-11-12T10:00:00.000Z");
  });
});

test("summarizes rolling 24-hour availability, incidents, latency, and hourly trend", async () => {
  await withEnvironment({}, async () => {
    const now = new Date("2026-11-19T12:00:00.000Z");
    const runs = [
      {
        checkedAt: new Date("2026-11-19T11:30:00.000Z"),
        checks: [
          { service: "database", status: "healthy", label: "Healthy", detail: "", latencyMs: 10 },
          { service: "resend", status: "attention", label: "Unavailable", detail: "", latencyMs: 30 },
        ],
      },
      {
        checkedAt: new Date("2026-11-19T11:00:00.000Z"),
        checks: [
          { service: "database", status: "healthy", label: "Healthy", detail: "", latencyMs: 20 },
          { service: "resend", status: "healthy", label: "API reachable", detail: "", latencyMs: 40 },
          { service: "billing", status: "not-configured", label: "Not connected", detail: "", latencyMs: null },
        ],
      },
    ];
    const { getSuperAdminHealthDashboard } = loadHealth({
      healthRuns: { findMany: async () => runs },
    });
    const dashboard = await getSuperAdminHealthDashboard(undefined, now);

    assert.equal(dashboard.runCount, 2);
    assert.equal(dashboard.observedChecks, 4);
    assert.equal(dashboard.failedChecks, 1);
    assert.equal(dashboard.availabilityPercent, 75);
    assert.equal(dashboard.averageLatencyMs, 25);
    assert.equal(dashboard.hourlyAvailability.length, 24);
    assert.equal(dashboard.hourlyAvailability[23].availabilityPercent, 75);
    assert.equal(dashboard.services.find((service) => service.id === "resend").availabilityPercent, 50);
    assert.equal(dashboard.services.find((service) => service.id === "resend").averageLatencyMs, 35);
  });
});

test("reports no recent run without implying the monitor has never run", async () => {
  await withEnvironment({}, async () => {
    const { getSuperAdminHealthDashboard } = loadHealth();
    const dashboard = await getSuperAdminHealthDashboard(undefined, new Date("2026-11-19T12:00:00.000Z"));

    assert.equal(dashboard.runCount, 0);
    assert.equal(dashboard.lastCheckedAt, null);
    assert.equal(dashboard.availabilityPercent, null);
    assert.ok(dashboard.services.every(({ label }) => label === "No check in last 24 hours"));
  });
});
