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
const source = fs.readFileSync(path.join(root, "src/components/landing-data-sections.tsx"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

async function renderReviews(reviews) {
  let reviewQuery;
  const mocks = {
    "server-only": {},
    "@/components/plan-pricing-period": {
      PlanPrice: () => React.createElement("span"),
      PlanPricingPeriod: ({ children }) => children,
    },
    "@/components/landing-auth-modal": { LandingAuthTrigger: ({ children }) => React.createElement("button", null, children) },
    "@/lib/currency-format": { getAnnualDiscountPercent: () => null },
    "@/lib/plan-features": { getPlanFeatureLabels: () => [] },
    "@/lib/prisma": {
      getPrisma: () => ({
        plan: { findMany: async () => [] },
        platformReview: {
          findMany: async (query) => {
            reviewQuery = query;
            return reviews;
          },
        },
      }),
    },
    "@/lib/localization": { localizeNode: (node) => node },
  };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  const loaded = { exports: {} };
  new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
  const tree = await loaded.exports.LandingReviewsSection({ locale: "en" });
  const html = renderToStaticMarkup(tree);
  return { html, reviewQuery };
}

test("homepage renders only the approved, consented five-star reviews query returns", async () => {
  const { html, reviewQuery } = await renderReviews([{
    id: "review-1",
    authorName: "Avery Owner",
    workspaceName: "North Studio",
    message: "Our event team saved hours with VenuGuestPass.",
  }]);

  assert.deepEqual(reviewQuery.where, { rating: 5, status: "APPROVED", publicationConsent: true });
  assert.match(html, /Our event team saved hours with VenuGuestPass\./);
  assert.match(html, /Avery Owner/);
  assert.match(html, /North Studio/);
});

test("homepage shows no testimonial content until a review is approved", async () => {
  const { html } = await renderReviews([]);
  assert.match(html, /Owner reviews will appear here when shared and approved\./);
  assert.doesNotMatch(html, /public-review-card/);
});
