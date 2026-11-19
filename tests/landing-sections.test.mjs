import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/components/landing-sections.tsx"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function harness(initialHash = "") {
  const states = [];
  const refs = [];
  const previousDependencies = [];
  const listeners = new Map();
  const focused = [];
  let stateIndex;
  let refIndex;
  let effectIndex;
  let pendingEffects;
  const window = {
    location: { hash: initialHash },
    history: { pushState(_state, _title, hash) { window.location.hash = hash; } },
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name) { listeners.delete(name); },
  };
  class Element {
    constructor(href, inNavigation = false) {
      this.href = href;
      this.inNavigation = inNavigation;
    }
    closest(selector) {
      if (selector === "a") return this;
      if (selector === ".landing-navigation") return this.inNavigation ? this : null;
      return null;
    }
    getAttribute(name) { return name === "href" ? this.href : null; }
  }
  const react = {
    ...React,
    useSyncExternalStore: () => true,
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = initial;
      return [states[index], (value) => { states[index] = value; }];
    },
    useRef(initial) {
      const index = refIndex++;
      if (!refs[index]) refs[index] = { current: initial };
      return refs[index];
    },
    useEffect(callback, dependencies) {
      const index = effectIndex++;
      const previous = previousDependencies[index];
      if (!previous || dependencies.some((value, i) => value !== previous[i])) pendingEffects.push(callback);
      previousDependencies[index] = dependencies;
    },
  };
  const labels = ["Home", "Features", "Solutions", "How it works", "Modules", "Check-in", "Reports", "Pricing", "Reviews", "FAQ", "Get started"];
  const ids = ["home", "features", "solutions", "how-it-works", "modules", "check-in", "reports", "pricing", "reviews", "faq", "get-started"];
  const localRequire = (name) => {
    if (name === "react") return react;
    if (name === "@/lib/landing-navigation") {
      return { landingNavigationItems: ids.map((id, index) => ({ id, label: labels[index] })) };
    }
    return require(name);
  };
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "window", "Element", output)(
    localRequire, loaded, loaded.exports, window, Element,
  );
  const children = labels.map((label) => React.createElement("section", { key: label }, label));

  function render() {
    stateIndex = 0;
    refIndex = 0;
    effectIndex = 0;
    pendingEffects = [];
    const tree = loaded.exports.LandingSections({ children, labels });
    const slides = tree.props.children[0].props.children;
    slides.forEach((slide, index) => slide.props.ref({ focus: (options) => focused.push({ index, options }) }));
    pendingEffects.forEach((callback) => callback());
    return { tree, slides, links: tree.props.children[1].props.children };
  }

  function click(tree, href, inNavigation = false, extra = {}) {
    let prevented = false;
    tree.props.onClick({
      target: new Element(href, inNavigation),
      button: 0,
      preventDefault() { prevented = true; },
      ...extra,
    });
    return prevented;
  }

  return { render, click, focused, listeners, window };
}

test("deep links and browser history select one accessible slide", () => {
  const h = harness("#faq");
  h.render();
  let view = h.render();
  assert.equal(view.links[9].props["aria-current"], "page");
  assert.equal(view.slides.filter((slide) => !slide.props.inert).length, 1);
  assert.equal(view.slides[7].props["data-position"], "before");
  assert.equal(view.slides[10].props["data-position"], "after");

  h.window.location.hash = "#solutions";
  h.listeners.get("popstate")();
  view = h.render();
  assert.equal(view.links[2].props["aria-current"], "page");
  assert.equal(view.slides[9].props["aria-hidden"], true);
});

test("in-page links update the section and focus, while modified clicks remain native", () => {
  const h = harness();
  h.render();
  let view = h.render();
  assert.equal(h.click(view.tree, "#features", false, { ctrlKey: true }), false);
  assert.equal(h.window.location.hash, "");
  assert.equal(h.click(view.tree, "#features"), true);
  view = h.render();
  assert.equal(h.window.location.hash, "#features");
  assert.equal(view.links[1].props["aria-current"], "page");
  assert.deepEqual(h.focused.at(-1), { index: 1, options: { preventScroll: true } });
  assert.equal(h.click(view.tree, "#pricing", true), true);
  view = h.render();
  assert.equal(view.links[7].props["aria-current"], "page");
  assert.equal(h.focused.length, 1);
});
