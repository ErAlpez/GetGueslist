import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadRoute(runChecks) {
  const source = fs.readFileSync(path.join(root, "src/app/api/cron/system-health/route.ts"), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loadedModule = { exports: {} };
  const mocks = {
    "@/lib/super-admin-health": { runSuperAdminHealthChecks: runChecks },
  };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  new Function("require", "module", "exports", output)(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports.GET;
}

async function withCronSecret(secret, callback) {
  const previous = process.env.CRON_SECRET;
  if (secret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = secret;
  try {
    await callback();
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
}

test("rejects unauthorized health cron requests without running checks", async () => {
  await withCronSecret("a".repeat(32), async () => {
    let runs = 0;
    const GET = loadRoute(async () => { runs += 1; return { checks: [], checkedAt: new Date() }; });
    const response = await GET(new Request("https://app.example/api/cron/system-health"));

    assert.equal(response.status, 401);
    assert.equal(runs, 0);
  });
});

test("reports a missing cron secret as a configuration error", async () => {
  await withCronSecret(undefined, async () => {
    let runs = 0;
    const GET = loadRoute(async () => { runs += 1; return { checks: [], checkedAt: new Date() }; });
    const response = await GET(new Request("https://app.example/api/cron/system-health"));

    assert.equal(response.status, 500);
    assert.equal(runs, 0);
  });
});

test("accepts the protected cron token and returns sanitized service results", async () => {
  const secret = "a".repeat(32);
  await withCronSecret(secret, async () => {
    const checkedAt = new Date("2026-11-19T10:00:00.000Z");
    const GET = loadRoute(async () => ({
      checkedAt,
      checks: [{
        id: "file-storage",
        provider: "Supabase Storage",
        status: "healthy",
        label: "API reachable",
        latencyMs: 21,
        detail: "No credentials in the response.",
      }],
    }));
    const response = await GET(new Request("https://app.example/api/cron/system-health", {
      headers: { authorization: `Bearer ${secret}` },
    }));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.checkedAt, checkedAt.toISOString());
    assert.deepEqual(body.checks, [{
      service: "file-storage",
      status: "healthy",
      label: "API reachable",
      latencyMs: 21,
    }]);
  });
});
