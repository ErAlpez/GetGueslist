import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/app/dashboard/settings/actions.ts"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

const currentWorkspace = {
  id: "workspace-1",
  name: "Workspace",
  contactEmail: null,
  contactPhone: null,
  organizationType: null,
  address: null,
  timezone: "UTC",
};
let dbAccesses = 0;
let transactions = 0;
let updatedSettings;
const prisma = {
  workspace: {
    update: ({ data }) => {
      updatedSettings = data;
      return Promise.resolve();
    },
  },
  activityLog: { create: () => Promise.resolve() },
  $transaction: async (operations) => {
    transactions += 1;
    await Promise.all(operations);
  },
};
const mocks = {
  "next/cache": { revalidatePath: () => {} },
  "next/navigation": { redirect: () => {} },
  "@/lib/prisma": {
    getPrisma: () => {
      dbAccesses += 1;
      return prisma;
    },
  },
  "@/lib/workspace": {
    getWorkspaceContext: async () => ({
      workspace: currentWorkspace,
      subscription: {},
      membership: { role: "OWNER" },
      user: { id: "user-1" },
    }),
  },
  "@/lib/workspace-roles": { workspaceRoleHasPermission: () => true },
  "@/lib/plan-features": { workspaceHasFeature: () => true },
  "@/lib/image-optimization": { convertImageToAvif: async () => Buffer.alloc(0) },
};
const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
const loaded = { exports: {} };
new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);

function settingsFormData(overrides = {}) {
  const data = new FormData();
  const values = {
    name: currentWorkspace.name,
    contactEmail: "",
    contactPhone: "",
    organizationType: "",
    address: "",
    timezone: currentWorkspace.timezone,
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

test("saving unchanged workspace settings skips database writes and success state", async () => {
  dbAccesses = 0;
  transactions = 0;

  const result = await loaded.exports.updateWorkspaceAction({}, settingsFormData());

  assert.deepEqual(result, { unchanged: true });
  assert.equal(dbAccesses, 0);
  assert.equal(transactions, 0);
});

test("changed workspace settings are still saved", async () => {
  dbAccesses = 0;
  transactions = 0;
  updatedSettings = undefined;

  const result = await loaded.exports.updateWorkspaceAction({}, settingsFormData({ name: "Updated workspace" }));

  assert.deepEqual(result, { success: "Workspace settings saved." });
  assert.equal(dbAccesses, 1);
  assert.equal(transactions, 1);
  assert.equal(updatedSettings.name, "Updated workspace");
});
