import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadCheckoutForm(getBillingPeriod) {
  const source = fs.readFileSync(path.join(root, "src/app/dashboard/billing/plan-checkout-form.tsx"), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mocks = {
    "lucide-react": { ExternalLink: () => React.createElement("svg") },
    "@/components/plan-pricing-period": { useBillingPeriod: getBillingPeriod },
    "./actions": { startPlanCheckoutAction: async () => {} },
  };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  const loaded = { exports: {} };
  new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
  return loaded.exports.PlanCheckoutForm;
}

test("checkout form submits the currently selected billing period", () => {
  let billingPeriod = "monthly";
  const PlanCheckoutForm = loadCheckoutForm(() => billingPeriod);
  const render = () => renderToStaticMarkup(React.createElement(PlanCheckoutForm, { planCode: "STARTER" }));

  assert.match(render(), /name="billingPeriod" value="monthly"/);

  billingPeriod = "annual";
  const annualForm = render();
  assert.match(annualForm, /name="billingPeriod" value="annual"/);
  assert.match(annualForm, /name="planCode" value="STARTER"/);
});
