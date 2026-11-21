import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/app/dashboard/reports/registration-trend.ts"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
new Function("require", "module", "exports", output)(require, loaded, loaded.exports);
const { registrationTrend } = loaded.exports;

test("registration trend maps grouped counts across seven UTC days, including year boundaries", () => {
  const dailyCounts = [
    { day: "2025-12-27", count: 10 },
    { day: "2025-12-28", count: 2 },
    { day: "2026-01-03", count: 1n },
    { day: "2026-01-04", count: 5 },
  ];
  const result = registrationTrend(dailyCounts, "en-US", new Date("2026-01-03T23:59:59Z"));
  assert.deepEqual(result.map((day) => day.label), ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
  assert.deepEqual(result.map((day) => day.count), [2, 0, 0, 0, 0, 0, 1]);
});

test("registration trend preserves empty days and localized labels", () => {
  const result = registrationTrend([], "fr-FR", new Date("2026-01-03T12:00:00Z"));
  assert.equal(result.length, 7);
  assert.ok(result.every((day) => day.count === 0));
  assert.equal(result[6].label, new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" }).format(new Date("2026-01-03T00:00:00Z")));
});
