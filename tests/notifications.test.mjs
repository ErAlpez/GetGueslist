import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/app/api/notifications/route.ts"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function harness(items) {
  const views = new Map();
  const activity = items ?? [
    { id: "a1", entityId: "registration-1", workspaceId: "workspace-1", action: "attendee.registered", entityType: "registration", createdAt: new Date("2030-01-01T12:00:00Z") },
    { id: "foreign", entityId: "registration-2", workspaceId: "workspace-2", action: "attendee.registered", entityType: "registration", createdAt: new Date("2030-01-01T12:00:00Z") },
  ];
  let context = { user: { id: "user-1" }, workspace: { id: "workspace-1" } };
  const key = (userId, id) => `${userId}:${id}`;
  const prisma = {
    activityLog: {
      findMany: async ({ where, select, orderBy, take }) => activity
        .filter((item) => item.workspaceId === where.workspaceId && item.action === where.action && item.entityType === where.entityType && (!where.id || where.id.in.includes(item.id)) && (!where.createdAt || item.createdAt > where.createdAt.gt))
        .sort((a, b) => orderBy ? b.createdAt - a.createdAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0) : 0)
        .slice(0, take)
        .map((item) => ({
          ...item,
          seenBy: select.seenBy && views.has(key(select.seenBy.where.userId, item.id))
            ? [{ seenAt: views.get(key(select.seenBy.where.userId, item.id)) }]
            : [],
        })),
    },
    eventRegistration: {
      findMany: async ({ where }) => where.id.in.map((id) => ({ id, eventId: "event-1", attendee: { firstName: "Alex", lastName: "Guest" }, event: { name: "Event" } })),
    },
    notificationView: {
      createMany: async ({ data }) => {
        for (const entry of data) {
          const id = key(entry.userId, entry.activityId);
          if (!views.has(id)) views.set(id, new Date("2030-01-01T12:01:00Z"));
        }
      },
      findMany: async ({ where }) => where.activityId.in
        .filter((id) => views.has(key(where.userId, id)))
        .map((id) => ({ activityId: id, seenAt: views.get(key(where.userId, id)) })),
    },
  };
  prisma.$transaction = (callback) => callback(prisma);
  const mocks = {
    "@/lib/prisma": { getPrisma: () => prisma },
    "@/lib/workspace": { getWorkspaceContext: async () => context },
  };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  const loaded = { exports: {} };
  new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
  return {
    route: loaded.exports,
    views,
    setContext(value) { context = value; },
  };
}

function request(ids, contentType = "application/json") {
  return new Request("http://localhost/api/notifications", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: JSON.stringify({ ids }),
  });
}

test("seen state persists per user and repeated views preserve the original timestamp", async () => {
  const h = harness();
  let data = await (await h.route.GET()).json();
  assert.equal(data.notifications[0].seenAt, null);
  const first = await (await h.route.POST(request(["a1"]))).json();
  assert.equal(first.seen[0].seenAt, "2030-01-01T12:01:00.000Z");
  assert.deepEqual(await (await h.route.POST(request(["a1"]))).json(), first);
  data = await (await h.route.GET()).json();
  assert.equal(data.notifications[0].seenAt, first.seen[0].seenAt);
  h.setContext({ user: { id: "user-2" }, workspace: { id: "workspace-1" } });
  assert.equal((await (await h.route.GET()).json()).notifications[0].seenAt, null);
});

test("marking seen rejects unauthenticated, malformed and cross-workspace requests", async () => {
  const h = harness();
  assert.equal((await h.route.POST(request(["foreign"]))).status, 404);
  assert.equal((await h.route.POST(request(["a1", "foreign"]))).status, 404);
  assert.equal(h.views.size, 0);
  assert.equal((await h.route.POST(request([]))).status, 400);
  assert.equal((await h.route.POST(request(["a1"], "text/plain"))).status, 415);
  h.setContext(null);
  assert.equal((await h.route.POST(request(["a1"]))).status, 401);
  assert.equal((await h.route.GET()).status, 401);
});

test("notifications expire at 30 days without deleting activity history", async (t) => {
  const now = Date.parse("2030-02-01T12:00:00Z");
  t.mock.method(Date, "now", () => now);
  const cutoff = now - 30 * 24 * 60 * 60 * 1000;
  const activity = [-1, 0, 1].map((offset) => ({
    id: `item-${offset}`,
    entityId: `registration-${offset}`,
    workspaceId: "workspace-1",
    action: "attendee.registered",
    entityType: "registration",
    createdAt: new Date(cutoff + offset),
  }));
  const h = harness(activity);
  const data = await (await h.route.GET()).json();
  assert.deepEqual(data.notifications.map((item) => item.id), ["item-1"]);
  assert.equal(activity.length, 3);
});

test("the newest 20 notifications are returned and can be marked seen together", async (t) => {
  const now = Date.parse("2030-02-01T12:00:00Z");
  t.mock.method(Date, "now", () => now);
  const activity = Array.from({ length: 21 }, (_, index) => ({
    id: `item-${String(index).padStart(2, "0")}`,
    entityId: `registration-${index}`,
    workspaceId: "workspace-1",
    action: "attendee.registered",
    entityType: "registration",
    createdAt: new Date(now - Math.floor(index / 2) * 1000),
  }));
  const h = harness(activity);
  const data = await (await h.route.GET()).json();
  const ids = data.notifications.map((item) => item.id);
  assert.equal(ids.length, 20);
  assert.equal(ids[0], "item-01");
  assert.equal(ids[18], "item-19");
  assert.equal(ids[19], "item-18");
  assert.ok(!ids.includes("item-20"));
  const response = await h.route.POST(request(ids));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).seen.length, 20);
  assert.equal((await h.route.POST(request(activity.map((item) => item.id)))).status, 400);
});
