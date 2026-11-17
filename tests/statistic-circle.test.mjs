import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/components/statistic-circle.tsx"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
const localRequire = (name) => name === "@/components/animated-metric"
  ? { AnimatedMetric: ({ value }) => React.createElement("span", null, value) }
  : require(name);
new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);

function render(value, total, percentage = false) {
  return renderToStaticMarkup(React.createElement(loaded.exports.StatisticCircle, {
    value, total, locale: "en", percentage,
  }));
}

test("statistic circles represent their share and provide an accessible percentage", () => {
  const markup = render(3, 4);
  assert.match(markup, /aria-label="75%"/);
  assert.match(markup, /stroke-dashoffset="25"/);
  assert.match(markup, /<span>3<\/span>/);
  assert.match(render(80, 100, true), /<span>80<\/span>%/);
  assert.match(render(1, 1000), /aria-label="0\.1%"/);
  assert.match(render(1, 1000), /stroke-dashoffset="99\.9"/);
});

test("empty totals and out-of-range shares produce bounded rings", () => {
  assert.match(render(0, 0), /stroke-dashoffset="100"/);
  assert.match(render(5, 5), /stroke-dashoffset="0"/);
  assert.match(render(7, 5), /stroke-dashoffset="0"/);
});
