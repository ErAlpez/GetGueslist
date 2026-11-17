import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/components/recent-check-ins.tsx"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function harness() {
  let state;
  let changed = false;
  const mocks = {
    react: {
      ...require("react"),
      useState: (initial) => {
        state ??= initial();
        return [state, (value) => { state = value; changed = true; }];
      },
    },
    "@/lib/localization": { localizeNode: (node) => node },
    "./recent-check-ins.css": {},
  };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  const loaded = { exports: {} };
  new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
  return (logs) => {
    let tree;
    do {
      changed = false;
      tree = loaded.exports.RecentCheckIns({ logs, locale: "en" });
    } while (changed);
    return renderToStaticMarkup(tree);
  };
}

const log = (id) => ({ id, name: `Guest ${id}`, method: "QR", time: "1:00 PM" });

test("highlights newly arrived rows, not existing rows, across refreshes", () => {
  const render = harness();
  assert.doesNotMatch(render([log("old")]), /recent-checkin-new/);
  let html = render([log("new"), log("old")]);
  assert.match(html, /recent-checkin-row recent-checkin-new[^>]*>[\s\S]*?Guest new/);
  assert.equal((html.match(/recent-checkin-new/g) || []).length, 1);
  html = render([log("newer"), log("new"), log("old")]);
  assert.equal((html.match(/recent-checkin-new/g) || []).length, 2);
  assert.equal(render([log("newer"), log("new"), log("old")]), html);
});

test("highlights the first check-in after an initially empty log", () => {
  const render = harness();
  assert.match(render([]), /Check-ins will appear here/);
  assert.match(render([log("first")]), /recent-checkin-row recent-checkin-new/);
});
