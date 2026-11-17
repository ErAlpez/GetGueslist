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

const datetime = loadTypeScript("src/lib/datetime.ts");
const dateRange = loadTypeScript("src/lib/date-range.ts");
const event = {
  id: "event-1",
  workspaceId: "workspace-1",
  archivedAt: null,
  updatedAt: new Date("2026-10-01T00:00:00.000Z"),
  timezone: "America/New_York",
  startsAt: new Date("2026-11-01T06:30:47.123Z"),
  endsAt: new Date("2026-11-01T08:00:21.456Z"),
  registrationDeadline: new Date("2026-11-01T05:30:17.789Z"),
};

function formData(overrides = {}) {
  const data = new FormData();
  const values = {
    name: "Updated event",
    description: "Description",
    category: "Workshop",
    type: "Seminar",
    format: "PHYSICAL",
    visibility: "PRIVATE",
    startsAt: "2026-11-01",
    endsAt: "2026-11-01",
    timezone: "America/New_York",
    venue: "Hall",
    address: "",
    capacity: "",
    registrationDeadline: "2026-11-01",
    organizerName: "",
    contactEmail: "",
    contactPhone: "",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function createHarness({ role = "ADMIN", workspaceId = "workspace-1", updateCount = 1 } = {}) {
  const calls = { lookups: [], updates: [], creates: [], logs: [], revalidated: [] };
  const transaction = {
    event: {
      updateMany: async (args) => { calls.updates.push(args); return { count: updateCount }; },
      create: async (args) => { calls.creates.push(args); return { id: event.id }; },
    },
    subscription: { findUnique: async () => ({ plan: { activeEventLimit: null } }) },
    activityLog: {
      create: async (args) => { calls.logs.push(args); },
    },
  };
  const prisma = {
    event: {
      findFirst: async (args) => {
        calls.lookups.push(args);
        const where = args.where;
        return where.id === event.id && where.workspaceId === event.workspaceId && where.archivedAt === null ? event : null;
      },
    },
    $transaction: async (callback) => callback(transaction),
  };
  const actions = loadTypeScript("src/app/dashboard/events/actions.ts", {
    "next/cache": { revalidatePath: (value) => calls.revalidated.push(value) },
    "next/navigation": {
      redirect: (url) => { throw Object.assign(new Error("redirect"), { url }); },
      notFound: () => { throw new Error("not found"); },
    },
    "@/lib/datetime": datetime,
    "@/lib/date-range": dateRange,
    "@/lib/event-logo": {},
    "@/lib/prisma": { getPrisma: () => prisma },
    "@/lib/registration-form": { registrationQuestionTypes: ["TEXT"] },
    "@/lib/workspace": { getWorkspaceContext: async () => ({ membership: { role }, workspace: { id: workspaceId }, user: { id: "user-1" } }) },
  });
  return {
    calls,
    create: (data = formData()) => actions.createEventAction({}, data),
    update: (data = formData(), version = event.updatedAt.toISOString()) => actions.updateEventAction(event.id, version, {}, data),
  };
}

test("editing preserves exact unchanged timestamps, identity, and records", async () => {
  const { calls, update } = createHarness();
  await assert.rejects(update(), (error) => error.url === "/dashboard/events/event-1?updated=1");
  assert.deepEqual(calls.lookups[0].where, { id: event.id, workspaceId: event.workspaceId, archivedAt: null });
  const { where, data } = calls.updates[0];
  assert.equal(where.updatedAt.toISOString(), event.updatedAt.toISOString());
  assert.equal(data.startsAt.toISOString(), event.startsAt.toISOString());
  assert.equal(data.endsAt.toISOString(), event.endsAt.toISOString());
  assert.equal(data.registrationDeadline.toISOString(), event.registrationDeadline.toISOString());
  assert.equal(data.name, "Updated event");
  assert.equal(data.capacity, null);
  assert.equal("status" in data, false);
  assert.equal("slug" in data, false);
  assert.equal("registrations" in data, false);
  assert.equal(calls.logs[0].data.action, "event.updated");
  assert.ok(calls.revalidated.includes("/register/event-1"));
});

test("changing timezone uses full local days in the new timezone", async () => {
  const { calls, update } = createHarness();
  await assert.rejects(update(formData({ timezone: "Asia/Manila" })), (error) => error.url?.includes("?updated=1"));
  assert.equal(calls.updates[0].data.startsAt.toISOString(), "2026-10-31T16:00:00.000Z");
  assert.equal(calls.updates[0].data.endsAt.toISOString(), "2026-11-01T15:59:59.999Z");
  assert.equal(calls.updates[0].data.registrationDeadline.toISOString(), "2026-11-01T15:59:59.999Z");
});

test("creates a same-day event and deadline through the end of a DST transition day", async () => {
  const { calls, create } = createHarness();
  const day = "2026-03-08";
  await assert.rejects(create(formData({ startsAt: day, endsAt: day, registrationDeadline: day })), (error) => error.url === "/dashboard/events/event-1");
  const created = calls.creates[0].data;
  assert.equal(created.startsAt.toISOString(), "2026-03-08T05:00:00.000Z");
  assert.equal(created.endsAt.toISOString(), "2026-03-09T03:59:59.999Z");
  assert.equal(created.registrationDeadline.toISOString(), "2026-03-09T03:59:59.999Z");
});

test("changing a single date preserves the other existing timestamps", async () => {
  const { calls, update } = createHarness();
  await assert.rejects(update(formData({ endsAt: "2026-11-02" })), (error) => error.url?.includes("?updated=1"));
  const updated = calls.updates[0].data;
  assert.equal(updated.startsAt.toISOString(), event.startsAt.toISOString());
  assert.equal(updated.registrationDeadline.toISOString(), event.registrationDeadline.toISOString());
  assert.equal(updated.endsAt.toISOString(), "2026-11-03T04:59:59.999Z");
});

test("rejects unauthorized and cross-workspace updates", async () => {
  const viewer = createHarness({ role: "VIEWER" });
  assert.match((await viewer.update()).error, /permission/);
  assert.equal(viewer.calls.lookups.length, 0);
  const otherWorkspace = createHarness({ workspaceId: "workspace-2" });
  await assert.rejects(otherWorkspace.update(), /not found/);
  assert.equal(otherWorkspace.calls.updates.length, 0);
});

test("rejects invalid dates and stale updates without writing", async () => {
  const invalid = createHarness();
  assert.match((await invalid.update(formData({ endsAt: "2026-10-31" }))).error, /end date/);
  assert.equal(invalid.calls.updates.length, 0);
  assert.match((await invalid.update(formData({ startsAt: "2026-02-30" }))).error, /valid event dates/);
  assert.match((await invalid.update(formData({ registrationDeadline: "2026-11-02" }))).error, /registration deadline/);
  const stale = createHarness();
  assert.match((await stale.update(formData(), "2026-09-01T00:00:00.000Z")).error, /changed/);
  assert.equal(stale.calls.updates.length, 0);
  const race = createHarness({ updateCount: 0 });
  assert.match((await race.update()).error, /changed/);
  assert.equal(race.calls.logs.length, 0);
});
