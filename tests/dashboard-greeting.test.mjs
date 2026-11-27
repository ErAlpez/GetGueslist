import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/components/dashboard-greeting.tsx"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mocks = { "@/components/preferences-provider": {} };
const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
const loaded = { exports: {} };
new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);

test("dashboard greeting follows the browser's local time of day", () => {
  const { getDashboardGreeting } = loaded.exports;

  assert.equal(getDashboardGreeting(0), "Good morning,");
  assert.equal(getDashboardGreeting(11), "Good morning,");
  assert.equal(getDashboardGreeting(12), "Good afternoon,");
  assert.equal(getDashboardGreeting(17), "Good afternoon,");
  assert.equal(getDashboardGreeting(18), "Good evening,");
  assert.equal(getDashboardGreeting(23), "Good evening,");
});
