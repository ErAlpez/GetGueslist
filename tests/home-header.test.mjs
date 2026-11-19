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

async function renderHome(session) {
  const mocks = {
    "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) },
    "@/components/preference-controls": {
      LanguageControl: () => React.createElement("button", { "aria-label": "Choose language" }),
      ThemeToggle: () => React.createElement("button", { "aria-label": "Use light theme" }),
    },
    "@/components/brand-mark": { BrandMark: () => React.createElement("span", null, "V") },
    "@/components/landing-sections": {
      LandingSections: ({ children }) => React.createElement(
        "div",
        { className: "landing-experience" },
        children,
        React.createElement("nav", { className: "landing-navigation" }),
      ),
    },
    "@/components/landing-frame-header": {
      LandingFrameHeader: ({ session }) => React.createElement(
        "header",
        { className: "site-header" },
        React.createElement("div", { className: "header-inner" },
          React.createElement("span", { className: "landing-frame-mark" }, "VENUGUESTPASS"),
          React.createElement("div", { className: "header-actions" },
            React.createElement("button", { "aria-label": "Choose language" }),
            React.createElement("button", { "aria-label": "Use light theme" }),
            session
              ? React.createElement("button", { className: "account-trigger", "aria-label": `${session.user.name}, ${session.user.email}`, "data-show-overview": "true" }, session.user.image ? React.createElement("img", { src: session.user.image }) : session.user.name.charAt(0))
              : React.createElement(React.Fragment, null,
                  React.createElement("a", { href: "/login", "aria-label": "Sign in" }, "Sign in"),
                  React.createElement("a", { href: "/sign-up" }, "Get started"),
                ),
          ),
        ),
      ),
    },
    "@/components/landing-auth-modal": {
      LandingAuthModal: ({ children }) => React.createElement(React.Fragment, null, children),
      LandingAuthTrigger: ({ children }) => React.createElement("a", { href: "/login" }, children),
    },
    "@/components/account-menu": {
      AccountMenu: ({ name, email, image, showOverview }) => React.createElement(
        "button",
        { className: "account-trigger", "aria-label": `${name}, ${email}`, "data-show-overview": String(showOverview) },
        image ? React.createElement("img", { alt: "", src: image }) : name.charAt(0).toUpperCase(),
      ),
    },
    "@/lib/preferences": { getPreferences: async () => ({ locale: "en" }) },
    "@/lib/prisma": { getPrisma: () => ({
      plan: { findMany: async () => [] },
      platformReview: { findMany: async () => [] },
    }) },
    "@/lib/auth": { getCurrentSession: async () => session },
    "@/lib/localization": { localizeNode: (node) => node, translate: (_locale, text) => text },
    "./home-header.css": {},
    "./landing.css": {},
    "./landing-experience.css": {},
  };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  const loaded = { exports: {} };
  new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
  return renderToStaticMarkup(await loaded.exports.default({ searchParams: Promise.resolve({}) }));
}

async function renderHeader(session) {
  const html = await renderHome(session);
  return html.match(/<header class="site-header">[\s\S]*?<\/header>/)[0];
}

test("signed-out header retains sign-in and sign-up links", async () => {
  const header = await renderHeader(null);
  assert.match(header, /href="\/login"/);
  assert.match(header, /aria-label="Sign in"/);
  assert.match(header, /href="\/sign-up"/);
  assert.doesNotMatch(header, /account-trigger/);
});

test("header groups language before theme beside the centered wordmark", async () => {
  const header = await renderHeader(null);
  assert.match(header, /class="landing-frame-mark">VENUGUESTPASS<\/span>[\s\S]*class="header-actions"[\s\S]*aria-label="Choose language"[\s\S]*aria-label="Use light theme"/);
  assert.doesNotMatch(header, /class="brand/);
});

test("the frame encloses both the header and persistent navigation", async () => {
  const html = await renderHome(null);
  assert.match(html, /<div class="landing-frame"><header class="site-header">[\s\S]*<\/header><div class="landing-experience">[\s\S]*<nav class="landing-navigation"><\/nav><\/div><\/div><\/main>/);
});

test("landing kickers use plain text without decorative dots", async () => {
  const html = await renderHome(null);
  assert.match(html, /class="section-kicker hero-kicker">A calmer way to run events<\/div>/);
  assert.doesNotMatch(html, /class="section-kicker(?: hero-kicker)?"><span/);
  assert.match(html, /class="section-kicker">YOUR NEXT EVENT STARTS HERE<\/span>/);
});

test("get started ends with the compact copyright and policy links", async () => {
  const html = await renderHome(null);
  const footer = html.match(/<div class="footer-bottom">[\s\S]*?<\/div><\/div><\/footer>/)[0];
  assert.match(footer, /© \d{4} VenuGuestPass\./);
  assert.match(footer, /href="\/privacy"[^>]*>Privacy<\/a><span aria-hidden="true">\|<\/span><a href="\/terms"[^>]*>Terms<\/a>/);
  assert.doesNotMatch(footer, /Made for bringing people together|Built with care/);
});

test("dashboard preview shows the overview with illustrative statistics", async () => {
  const html = await renderHome(null);
  assert.match(html, /aria-label="Illustrative preview of the VenuGuestPass event dashboard"[^>]*role="img"/);
  assert.equal((html.match(/class="preview-dashboard-stat preview-tone-/g) ?? []).length, 8);
  assert.match(html, /preview-dashboard-stat-label">Total events/);
  assert.match(html, /preview-dashboard-stat-label">Attendance rate/);
  assert.ok(html.includes(" Attendees</span>"));
  assert.match(html, /preview-dashboard-panel-heading"><strong>Upcoming events<\/strong>/);
  assert.match(html, /preview-dashboard-panel-heading"><strong>Your plan<\/strong>/);
});

test("the community card uses a decorative people icon", async () => {
  const html = await renderHome(null);
  assert.match(html, /class="audience-card aqua"><span class="audience-emoji"><svg[^>]*aria-hidden="true"/);
  assert.match(html, /COMMUNITY<\/span><strong>Meetups &amp;<br\/>workshops<\/strong>/);
});

test("the modules illustration has no spark decorations", async () => {
  const html = await renderHome(null);
  const modules = html.match(/<section class="module-section" id="modules">[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(modules, /module-spark|✳/);
  assert.match(modules, /Your event\.<br\/><span>Your mix of modules\.<\/span>/);
});

test("signed-in header shows the account menu with dashboard access", async () => {
  const header = await renderHeader({ user: { name: "Alex", email: "alex@example.test", image: "/avatar.png" } });
  assert.match(header, /class="account-trigger"/);
  assert.match(header, /aria-label="Choose language"[\s\S]*aria-label="Use light theme"[\s\S]*class="account-trigger"/);
  assert.match(header, /data-show-overview="true"/);
  assert.match(header, /src="\/avatar.png"/);
  assert.doesNotMatch(header, /href="\/(?:login|sign-up)"/);
  assert.match(header, /aria-label="Alex, alex@example.test"/);
});

test("signed-in header falls back to the user's initial without a photo", async () => {
  const header = await renderHeader({ user: { name: "Alex", email: "alex@example.test", image: null } });
  assert.match(header, /class="account-trigger"[^>]*>A<\/button>/);
  assert.doesNotMatch(header, /href="\/(?:login|sign-up)"/);
});
