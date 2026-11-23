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

const logo = "data:image/webp;base64,UklGRkAAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAIAAAAAAFZQOCAYAAAAMAEAnQEqAQABAAFAJiWkAANwAP79NmgA";
const logoLib = loadTypeScript("src/lib/event-logo.ts");
const eventAttachment = loadTypeScript("src/lib/event-attachment.ts");
const followupSchedule = loadTypeScript("src/lib/automated-followup-schedule.ts");
const storedLogo = `${logoLib.eventLogoPrefix}${Buffer.from("encoded-avif").toString("base64")}`;

function harness({ role = "ADMIN", workspace = "workspace-1", branding = { color: "green" } } = {}) {
  const calls = { lookups: [], updates: [], logs: [], paths: [], conversions: [] };
  const transaction = {
    event: {
      findFirst: async (args) => {
        calls.lookups.push(args.where);
        return args.where.id === "event-1" && args.where.workspaceId === "workspace-1"
          ? { id: "event-1", settings: { customBranding: branding } }
          : null;
      },
    },
    eventSettings: { upsert: async (args) => calls.updates.push(args) },
    activityLog: { create: async (args) => calls.logs.push(args) },
  };
  const actions = loadTypeScript("src/app/dashboard/events/actions.ts", {
    "next/cache": { revalidatePath: (value) => calls.paths.push(value) },
    "next/navigation": {
      redirect: (url) => { throw Object.assign(new Error("redirect"), { url }); },
      notFound: () => { throw new Error("not found"); },
    },
    "@/lib/datetime": {},
    "@/lib/date-range": {},
    "@/lib/automated-followup-schedule": followupSchedule,
    "@/lib/event-attachment": eventAttachment,
    "@/lib/event-logo": logoLib,
    "@/lib/image-optimization": {
      convertImageToAvif: async (...args) => {
        calls.conversions.push(args);
        return Buffer.from("encoded-avif");
      },
    },
    "@/lib/supabase-storage": {
      uploadSupabaseObject: async () => {},
      downloadSupabaseObject: async () => new Uint8Array(),
      deleteSupabaseObject: async () => {},
    },
    "@/lib/prisma": { getPrisma: () => ({ $transaction: async (fn) => fn(transaction) }) },
    "@/lib/plan-features": { workspaceHasFeature: () => true },
    "@/lib/registration-form": { registrationQuestionTypes: ["TEXT"] },
    "@/lib/workspace": { getWorkspaceContext: async () => ({ membership: { role }, workspace: { id: workspace }, user: { id: "user-1" } }) },
  });
  return {
    calls,
    save: async (image, remove = false) => {
      const data = new FormData();
      data.set("eventId", "event-1");
      data.set("imageData", image);
      if (remove) data.set("removeLogo", "true");
      return actions.saveEventLogoAction({}, data);
    },
  };
}

test("saves a logo without overwriting other event branding", async () => {
  const { calls, save } = harness();
  const result = await save(logo);
  assert.equal(result.logo, storedLogo);
  assert.deepEqual(calls.lookups[0], { id: "event-1", workspaceId: "workspace-1", archivedAt: null });
  assert.deepEqual(calls.updates[0].update.customBranding, { color: "green", logo: storedLogo });
  assert.equal(calls.logs[0].data.action, "event.logo_updated");
  assert.deepEqual(calls.paths, ["/dashboard/events/event-1", "/register/event-1"]);
  assert.equal(calls.conversions.length, 1);
  assert.equal(logoLib.readEventLogo(calls.updates[0].update.customBranding), storedLogo);
});

test("removes the logo and preserves other branding", async () => {
  const { calls, save } = harness({ branding: { color: "green", logo } });
  const result = await save("", true);
  assert.equal(result.logo, null);
  assert.deepEqual(calls.updates[0].update.customBranding, { color: "green", logo: null });
  assert.equal(logoLib.readEventLogo(calls.updates[0].update.customBranding), null);
});

test("continues to read logos stored in the legacy WebP format", () => {
  assert.equal(logoLib.readEventLogo({ logo }), logo);
});

test("rejects malformed or oversized image data without writing", async () => {
  const { calls, save } = harness();
  assert.ok((await save("data:image/webp;base64,SGVsbG8=")).error);
  assert.ok((await save(`data:image/webp;base64,${"A".repeat(300_000)}`)).error);
  assert.equal(calls.updates.length, 0);
  assert.equal(logoLib.readEventLogo({ logo: "javascript:alert(1)" }), null);
});

test("enforces event manager role and workspace ownership", async () => {
  await assert.rejects(harness({ role: "VIEWER" }).save(logo), (error) => error.url === "/dashboard/events?error=permission");
  const foreign = harness({ workspace: "workspace-2" });
  await assert.rejects(foreign.save(logo), /not found/);
  assert.equal(foreign.calls.updates.length, 0);
});
