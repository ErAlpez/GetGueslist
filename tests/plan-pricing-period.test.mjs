import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/components/plan-pricing-period.tsx"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const react = {
  ...require("react"),
  useContext: () => "annual",
  useState: (initial) => [initial, () => {}],
};
const mocks = {
  react,
  "@/lib/currency-format": {
    formatCurrencyMinorUnits: (_locale, amountMinor) => `$${(amountMinor / 100).toFixed(2)}`,
  },
};
const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
const loaded = { exports: {} };
new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);

function textContent(node) {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (Array.isArray(node)) return node.map(textContent).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  return textContent(node.props?.children);
}

test("annual prices show the year unit without a savings badge", () => {
  const tree = loaded.exports.PlanPrice({
    monthlyPriceMinor: 1990,
    annualPriceMinor: 19900,
    currencyCode: "USD",
    locale: "en-US",
    className: "price",
  });

  assert.equal(textContent(tree), "$199.00/ year");
  assert.doesNotMatch(textContent(tree), /2 months free/i);
});

test("billing toggle shows the free months badge only inside the annual option", () => {
  const tree = loaded.exports.PlanPricingPeriod({ children: null });
  const [monthlyButton, , annualButton] = tree.props.children[0].props.children;

  assert.equal(textContent(monthlyButton), "Monthly");
  assert.equal(textContent(annualButton), "Annual2 months free");
  assert.equal(annualButton.props.children[1].props.className, "plan-pricing-save");
});
