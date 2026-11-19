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

const analytics = loadTypeScript("src/lib/website-analytics.ts");

function createRoute() {
  const calls = [];
  const route = loadTypeScript("src/app/api/website-analytics/route.ts", {
    "@/lib/prisma": {
      getPrisma: () => ({
        websiteDailyStat: { upsert: async (args) => calls.push(args) },
      }),
    },
    "@/lib/website-analytics": analytics,
  });
  return { calls, POST: route.POST };
}

function request(path, { origin = "https://example.test", country } = {}) {
  const headers = {
    origin,
    host: "example.test",
    "content-type": "application/json",
  };
  if (country) headers["x-vercel-ip-country"] = country;
  return new Request("https://example.test/api/website-analytics", {
    method: "POST",
    headers,
    body: JSON.stringify({ path }),
  });
}

test("tracks only the public home and legal page paths", () => {
  assert.equal(analytics.isTrackedPublicPath("/"), true);
  assert.equal(analytics.isTrackedPublicPath("/privacy"), true);
  assert.equal(analytics.isTrackedPublicPath("/terms"), true);
  assert.equal(analytics.isTrackedPublicPath("/dashboard"), false);
  assert.equal(analytics.isTrackedPublicPath("/register/private-event"), false);
  assert.equal(analytics.normalizeCountryCode(" us "), "US");
  assert.equal(analytics.normalizeCountryCode("unknown"), "XX");
});

test("rejects cross-origin and untracked requests without recording views", async () => {
  const { calls, POST } = createRoute();
  const wrongOrigin = await POST(request("/", { origin: "https://attacker.test" }));
  assert.equal(wrongOrigin.status, 403);

  const privatePath = await POST(request("/dashboard"));
  assert.equal(privatePath.status, 400);
  assert.equal(calls.length, 0);
});

test("records an anonymous daily aggregate and uses country only on Vercel", async () => {
  const originalVercel = process.env.VERCEL;
  delete process.env.VERCEL;
  try {
    const local = createRoute();
    const localResponse = await local.POST(request("/"));
    assert.equal(localResponse.status, 204);
    assert.equal(local.calls[0].create.countryCode, "XX");
    assert.equal(local.calls[0].create.views, 1);
    assert.equal(local.calls[0].create.date.getUTCHours(), 0);
    assert.deepEqual(local.calls[0].update, { views: { increment: 1 } });

    process.env.VERCEL = "1";
    const hosted = createRoute();
    const hostedResponse = await hosted.POST(request("/terms", { country: "ca" }));
    assert.equal(hostedResponse.status, 204);
    assert.equal(hosted.calls[0].create.countryCode, "CA");
  } finally {
    if (originalVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = originalVercel;
  }
});
