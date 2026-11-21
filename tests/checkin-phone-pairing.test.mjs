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
  new Function("require", "module", "exports", output)(
    (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

const workspaceRoles = loadTypeScript("src/lib/workspace-roles.ts");
const api = loadTypeScript("src/lib/api.ts");

test("phone pairing APIs return responses whose bodies are still available", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (path, init) => {
    requests.push({ path, init });
    return Response.json(requests.length === 1
      ? { id: "access-1", pairingToken: "pairing-token" }
      : { ok: true });
  };

  try {
    const pairingResponse = await api.createScannerPairing("event-1", "Front gate");
    assert.deepEqual(await pairingResponse.json(), { id: "access-1", pairingToken: "pairing-token" });

    const revokeResponse = await api.revokeScannerAccess("access-1");
    assert.deepEqual(await revokeResponse.json(), { ok: true });
    assert.equal(requests[0].init.method, "POST");
    assert.equal(requests[1].init.method, "DELETE");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function createHarness(role) {
  const calls = {};
  const prisma = {
    mobileCheckinAccess: {
      findMany: async (args) => {
        calls.findMany = args;
        return [];
      },
      create: async ({ data }) => {
        calls.created = data;
        return { id: "access-1", deviceName: data.deviceName, pairingExpiresAt: data.pairingExpiresAt };
      },
      updateMany: async (args) => {
        calls.revoked = args;
        return { count: 1 };
      },
    },
    event: {
      findFirst: async (args) => {
        calls.eventQuery = args;
        return { id: args.where.id };
      },
    },
  };
  const route = loadTypeScript("src/app/api/check-in/pairing/route.ts", {
    "@/lib/prisma": { getPrisma: () => prisma },
    "@/lib/workspace": {
      getWorkspaceContext: async () => ({
        membership: { role },
        workspace: { id: "workspace-1" },
        user: { id: "user-1" },
      }),
    },
    "@/lib/mobile-checkin": {
      createMobileCheckinToken: () => "pairing-token",
      hashMobileCheckinToken: (token) => `hashed:${token}`,
      isSameOriginRequest: () => true,
      mobileCheckinPairingLifetimeMs: 300_000,
    },
    "@/lib/workspace-roles": workspaceRoles,
  });
  return { ...route, calls };
}

function jsonRequest(body) {
  return new Request("http://localhost/api/check-in/pairing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("Check-in role can create an event-scoped phone pairing", async () => {
  const { POST, calls } = createHarness("CHECKIN");
  const response = await POST(jsonRequest({ eventId: "event-1", deviceName: "Front gate" }));

  assert.equal(response.status, 200);
  assert.equal(calls.eventQuery.where.workspaceId, "workspace-1");
  assert.equal(calls.created.createdById, "user-1");
  assert.equal(calls.created.deviceName, "Front gate");
  assert.deepEqual(await response.json().then(({ pairingToken }) => pairingToken), "pairing-token");
});

test("Check-in role only sees its own phone access and cannot revoke it", async () => {
  const { GET, DELETE, calls } = createHarness("CHECKIN");
  const response = await GET(new Request("http://localhost/api/check-in/pairing?eventId=event-1"));

  assert.equal(response.status, 200);
  assert.equal(calls.findMany.where.createdById, "user-1");
  const revokeResponse = await DELETE(jsonRequest({ accessId: "access-1" }));
  assert.equal(revokeResponse.status, 403);
  assert.equal(calls.revoked, undefined);
});

test("Managers cannot create pairings, while admins can manage all phone access", async () => {
  const manager = createHarness("MANAGER");
  assert.equal((await manager.POST(jsonRequest({ eventId: "event-1", deviceName: "Front gate" }))).status, 403);

  const admin = createHarness("ADMIN");
  await admin.GET(new Request("http://localhost/api/check-in/pairing?eventId=event-1"));
  assert.equal("createdById" in admin.calls.findMany.where, false);
  const revokeResponse = await admin.DELETE(jsonRequest({ accessId: "access-1" }));
  assert.equal(revokeResponse.status, 200);
  assert.equal(admin.calls.revoked.where.workspaceId, "workspace-1");
});
