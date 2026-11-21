import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/lib/currency-format.ts"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
new Function("require", "module", "exports", output)(require, loaded, loaded.exports);
const { formatCurrencyMinorUnits, getAnnualDiscountPercent } = loaded.exports;

test("USD plan prices use the dollar symbol instead of the currency code", () => {
  assert.equal(formatCurrencyMinorUnits("en-US", 199, "USD"), "$1.99");
});

test("annual pricing shows the catalog discount against twelve monthly payments", () => {
  assert.equal(getAnnualDiscountPercent(1000, 10000), 17);
  assert.equal(getAnnualDiscountPercent(1000, 12000), null);
  assert.equal(getAnnualDiscountPercent(1000, 13000), null);
  assert.equal(getAnnualDiscountPercent(null, 10000), null);
});
