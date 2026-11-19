import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/lib/workspace-roles.ts"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
new Function("require", "module", "exports", output)(require, loaded, loaded.exports);
const { workspaceRoleCanAccessSection, workspaceRoleHasPermission, workspaceRoleHome } = loaded.exports;

test("Viewer can read workspace sections but cannot access billing or check-in", () => {
  for (const section of ["overview", "events", "attendees", "tickets", "reports", "files", "settings"]) {
    assert.equal(workspaceRoleCanAccessSection("VIEWER", section), true, section);
  }
  assert.equal(workspaceRoleCanAccessSection("VIEWER", "billing"), false);
  assert.equal(workspaceRoleCanAccessSection("VIEWER", "check-in"), false);
  assert.equal(workspaceRoleHasPermission("VIEWER", "attendees.manage"), false);
});

test("Check-in role is restricted to check-in and returns there from other routes", () => {
  assert.equal(workspaceRoleCanAccessSection("CHECKIN", "check-in"), true);
  for (const section of ["overview", "events", "attendees", "tickets", "reports", "files", "billing", "settings"]) {
    assert.equal(workspaceRoleCanAccessSection("CHECKIN", section), false, section);
  }
  assert.equal(workspaceRoleHasPermission("CHECKIN", "checkin.perform"), true);
  assert.equal(workspaceRoleHasPermission("CHECKIN", "checkin.pair_device"), true);
  assert.equal(workspaceRoleHasPermission("CHECKIN", "events.manage"), false);
  assert.equal(workspaceRoleHasPermission("MANAGER", "checkin.pair_device"), false);
  assert.equal(workspaceRoleHasPermission("OWNER", "checkin.pair_device"), true);
  assert.equal(workspaceRoleHasPermission("ADMIN", "checkin.pair_device"), true);
  assert.equal(workspaceRoleHome("CHECKIN"), "/dashboard/check-in");
});

test("billing is owner-only while managers retain event and attendee management", () => {
  assert.equal(workspaceRoleHasPermission("OWNER", "billing.manage"), true);
  assert.equal(workspaceRoleHasPermission("ADMIN", "billing.manage"), false);
  assert.equal(workspaceRoleHasPermission("MANAGER", "billing.manage"), false);
  assert.equal(workspaceRoleHasPermission("MANAGER", "events.manage"), true);
  assert.equal(workspaceRoleHasPermission("MANAGER", "attendees.manage"), true);
});
