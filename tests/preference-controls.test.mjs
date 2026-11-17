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
const source = fs.readFileSync(path.join(root, "src/components/preference-controls.tsx"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const mocks = {
  "@/lib/localization": { locales: [{ code: "en", name: "English" }] },
  "@/components/preferences-provider": {
    usePreferences: () => ({ locale: "en", theme: "dark", setLocale() {}, toggleTheme() {}, t: (text) => text }),
  },
};
const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
const loaded = { exports: {} };
new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);

test("combined preferences retain both controls for existing dashboard callers", () => {
  const html = renderToStaticMarkup(React.createElement(loaded.exports.PreferenceControls));
  assert.match(html, /class="preference-controls"/);
  assert.match(html, /aria-label="Choose language: English"/);
  assert.match(html, /aria-label="Use light theme"/);
});

test("landing can render the language and theme controls independently", () => {
  const language = renderToStaticMarkup(React.createElement(loaded.exports.LanguageControl));
  const theme = renderToStaticMarkup(React.createElement(loaded.exports.ThemeToggle));
  assert.match(language, /aria-label="Choose language: English"/);
  assert.doesNotMatch(language, /theme-toggle/);
  assert.match(theme, /aria-label="Use light theme"/);
  assert.doesNotMatch(theme, /language-trigger/);
});
