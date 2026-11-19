import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function load(file, mocks = {}) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}

const schedule = load("src/lib/automated-followup-schedule.ts");

test("sets the reminder and feedback deliveries at their requested event-relative times", () => {
  const startsAt = new Date("2026-12-24T18:00:00.000Z");
  const endsAt = new Date("2026-12-24T21:00:00.000Z");
  assert.equal(
    schedule.getAutomatedFollowupScheduledAt("PRE_EVENT_REMINDER", startsAt, endsAt).toISOString(),
    "2026-12-23T18:00:00.000Z",
  );
  assert.equal(
    schedule.getAutomatedFollowupScheduledAt("POST_EVENT_FOLLOWUP", startsAt, endsAt).toISOString(),
    "2026-12-24T23:00:00.000Z",
  );
});

test("does not schedule a reminder for registrations made after the reminder time", () => {
  const reminderAt = new Date("2026-12-23T18:00:00.000Z");
  assert.equal(schedule.shouldScheduleReminder(new Date("2026-12-23T18:00:00.000Z"), reminderAt), true);
  assert.equal(schedule.shouldScheduleReminder(new Date("2026-12-23T18:00:00.001Z"), reminderAt), false);
});

test("protects the cron endpoint with the configured bearer secret", async () => {
  const oldSecret = process.env.CRON_SECRET;
  let runs = 0;
  try {
    process.env.CRON_SECRET = "test-cron-secret-at-least-thirty-two-characters";
    const route = load("src/app/api/cron/automated-followups/route.ts", {
      "@/lib/automated-followups": {
        runAutomatedFollowups: async () => {
          runs += 1;
          return { sent: 0 };
        },
      },
    });
    process.env.CRON_SECRET = "too-short";
    const misconfigured = await route.GET(new Request("https://guestlist.example.test/api/cron/automated-followups"));
    assert.equal(misconfigured.status, 500);
    process.env.CRON_SECRET = "test-cron-secret-at-least-thirty-two-characters";
    const unauthorized = await route.GET(new Request("https://guestlist.example.test/api/cron/automated-followups"));
    assert.equal(unauthorized.status, 401);
    const authorized = await route.GET(new Request("https://guestlist.example.test/api/cron/automated-followups", {
      headers: { authorization: "Bearer test-cron-secret-at-least-thirty-two-characters" },
    }));
    assert.equal(authorized.status, 200);
    assert.deepEqual(await authorized.json(), { sent: 0 });
    assert.equal(runs, 1);
  } finally {
    if (oldSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = oldSecret;
  }
});

test("enables automated follow-ups for Starter and higher plans only", () => {
  const { workspaceHasFeature } = load("src/lib/plan-features.ts");
  assert.equal(workspaceHasFeature({ plan: { features: ["automated_followups"] } }, "automated_followups"), true);
  assert.equal(workspaceHasFeature({ plan: { features: ["includes_free"] } }, "automated_followups"), false);
  assert.equal(workspaceHasFeature({ plan: { features: ["includes_starter"] } }, "automated_followups"), true);
  assert.equal(workspaceHasFeature({ plan: { features: ["includes_starter", "advanced_reports"] } }, "automated_followups"), true);
});

test("keeps Starter reports available and moves all Enterprise features to Max", () => {
  const { workspaceHasFeature } = load("src/lib/plan-features.ts");
  const starter = { plan: { features: ["includes_free", "custom_forms", "event_branding", "guestlist_filters", "csv_exports", "basic_reports", "event_lifecycle", "automated_followups"] } };
  const maxPlan = { plan: { features: ["includes_starter", "advanced_reports", "multi_event_reporting", "checkin_activity", "custom_limits", "workspace_settings", "workspace_exports", "support"] } };

  for (const feature of ["basic_reports", "csv_exports"]) {
    assert.equal(workspaceHasFeature(starter, feature), true);
    assert.equal(workspaceHasFeature(maxPlan, feature), true);
  }
  for (const feature of ["custom_limits", "workspace_settings", "workspace_exports", "support"]) {
    assert.equal(workspaceHasFeature(starter, feature), false);
    assert.equal(workspaceHasFeature(maxPlan, feature), true);
  }
});
