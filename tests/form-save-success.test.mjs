import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function renderSuccess(autoDismiss) {
  const source = fs.readFileSync(path.join(root, "src/components/form-save-success.tsx"), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loadedModule = { exports: {} };
  const mocks = { "lucide-react": { CircleCheck: () => null } };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  new Function("require", "module", "exports", output)(localRequire, loadedModule, loadedModule.exports);

  const element = require("react").createElement(loadedModule.exports.FormSaveSuccess, {
    autoDismiss,
    message: "Confirmation link sent.",
  });
  return require("react-dom/server").renderToStaticMarkup(element);
}

test("landing sign-in and signup success messages remain visible", () => {
  const landingModal = fs.readFileSync(path.join(root, "src/components/landing-auth-modal.tsx"), "utf8");
  const styles = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
  const markup = renderSuccess(false);

  assert.match(landingModal, /autoDismissSuccess=\{false\}/);
  assert.match(markup, /form-save-success/);
  assert.doesNotMatch(markup, /is-auto-dismissing/);
  assert.match(styles, /\.form-save-success\.is-auto-dismissing\s*\{\s*animation:/);
  assert.doesNotMatch(styles, /\.form-save-success\s*\{[^}]*animation:/);
});

test("auto-dismissing success messages retain their fade behavior", () => {
  assert.match(renderSuccess(true), /is-auto-dismissing/);
});
