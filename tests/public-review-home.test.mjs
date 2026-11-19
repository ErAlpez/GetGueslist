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
const source = fs.readFileSync(path.join(root, "src/app/page.tsx"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

async function renderHome(reviews) {
  let reviewQuery;
  const mocks = {
    "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) },
    "@/components/brand-mark": { BrandMark: () => React.createElement("span") },
    "@/components/landing-frame-header": { LandingFrameHeader: () => React.createElement("header", { className: "site-header" }) },
    "@/components/landing-sections": { LandingSections: ({ children }) => React.createElement("div", { className: "landing-experience" }, children) },
    "@/components/landing-auth-modal": {
      LandingAuthModal: ({ children }) => children,
      LandingAuthTrigger: ({ children }) => React.createElement("button", null, children),
    },
    "@/components/statistic-circle": { StatisticCircle: () => React.createElement("span") },
    "@/components/plan-pricing-period": {
      PlanPrice: () => React.createElement("span"),
      PlanPricingPeriod: ({ children }) => children,
    },
    "@/lib/preferences": { getPreferences: async () => ({ locale: "en" }) },
    "@/lib/auth": { getCurrentSession: async () => null },
    "@/lib/landing-navigation": {
      landingNavigationItems: [
        { id: "home", label: "Home" },
        { id: "features", label: "Features" },
        { id: "solutions", label: "Solutions" },
        { id: "how-it-works", label: "How it works" },
        { id: "modules", label: "Modules" },
        { id: "check-in", label: "Check-in" },
        { id: "reports", label: "Reports" },
        { id: "pricing", label: "Pricing" },
        { id: "reviews", label: "Reviews" },
        { id: "faq", label: "FAQ" },
        { id: "get-started", label: "Get started" },
      ],
    },
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
    "@/lib/localization": { localizeNode: (node) => node, translate: (_locale, text) => text },
    "./landing.css": {},
    "./landing-experience.css": {},
  };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  const loaded = { exports: {} };
  new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
  const html = renderToStaticMarkup(await loaded.exports.default({ searchParams: Promise.resolve({}) }));
  return { html, reviewQuery };
}

test("homepage renders only the approved, consented five-star reviews query returns", async () => {
  const { html, reviewQuery } = await renderHome([{
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
  const { html } = await renderHome([]);
  assert.match(html, /Owner reviews will appear here when shared and approved\./);
  assert.doesNotMatch(html, /public-review-card/);
});
