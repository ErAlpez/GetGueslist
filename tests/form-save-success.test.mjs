import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/components/form-save-success.tsx"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const timers = [];
const react = {
  ...require("react"),
  useEffect(effect) {
    effect();
  },
  useState(initial) {
    return [initial, () => {}];
  },
};
const loaded = { exports: {} };
const localRequire = (name) => name === "react" ? react : require(name);
new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
const { FormSaveSuccess } = loaded.exports;

test("persistent success feedback is not animated away or scheduled for dismissal", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    setTimeout(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimeout() {},
  };

  try {
    const element = FormSaveSuccess({ message: "Check your email.", autoDismiss: false });
    const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");

    assert.match(element.props.className, /form-save-success-persistent/);
    assert.match(css, /\.form-save-success-persistent\s*\{\s*animation:\s*none\s*;\s*\}/);
    assert.equal(timers.length, 0);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("success feedback keeps its existing auto-dismiss behavior by default", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    setTimeout(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimeout() {},
  };

  try {
    const element = FormSaveSuccess({ message: "Saved." });

    assert.doesNotMatch(element.props.className, /form-save-success-persistent/);
    assert.equal(timers.at(-1)?.delay, 3_400);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
