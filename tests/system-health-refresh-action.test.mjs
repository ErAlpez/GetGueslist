import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadAction({
  requireSuperAdmin,
  getPrisma = () => ({ id: "prisma" }),
  runSuperAdminHealthChecks,
  getSuperAdminHealthDashboard = async () => ({ runCount: 1 }),
}) {
  const source = fs.readFileSync(
    path.join(root, "src/app/dashboard/admin/plans/health-actions.ts"),
    "utf8",
  );
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loadedModule = { exports: {} };
  const mocks = {
    "@/lib/prisma": { getPrisma },
    "@/lib/super-admin": { requireSuperAdmin },
    "@/lib/super-admin-health": { runSuperAdminHealthChecks, getSuperAdminHealthDashboard },
  };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  new Function("require", "module", "exports", output)(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports.refreshSystemHealthAction;
}

test("live health refresh checks super-admin authorization before running probes", async () => {
  let probes = 0;
  const action = loadAction({
    requireSuperAdmin: async () => { throw new Error("forbidden"); },
    runSuperAdminHealthChecks: async () => { probes += 1; },
  });

  await assert.rejects(action(), /forbidden/);
  assert.equal(probes, 0);
});

test("authorized live health refresh runs and records probes", async () => {
  const calls = [];
  const dashboard = { runCount: 1 };
  const prisma = { id: "prisma" };
  const action = loadAction({
    requireSuperAdmin: async () => { calls.push("authorize"); },
    getPrisma: () => { calls.push("prisma"); return prisma; },
    runSuperAdminHealthChecks: async (fetcher, actualPrisma) => {
      calls.push("probe");
      assert.equal(typeof fetcher, "function");
      assert.equal(actualPrisma, prisma);
    },
    getSuperAdminHealthDashboard: async (actualPrisma) => {
      calls.push("dashboard");
      assert.equal(actualPrisma, prisma);
      return dashboard;
    },
  });

  assert.deepEqual(await action(), dashboard);
  assert.deepEqual(calls, ["authorize", "prisma", "probe", "dashboard"]);
});
