import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/components/animated-metric.tsx"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function harness(initiallyReduced = false) {
  let state = null;
  let effect;
  let observer;
  let time = 0;
  let nextFrame = 0;
  let memo;
  let formatterCount = 0;
  let stateUpdateCount = 0;
  const frames = new Map();
  const media = {
    matches: initiallyReduced,
    addEventListener(_type, callback) { this.callback = callback; },
    removeEventListener() { this.callback = undefined; },
  };
  class Observer {
    constructor(callback) { observer = { trigger: (visible) => callback([{ isIntersecting: visible }]) }; }
    observe() {}
    disconnect() { observer.disconnected = true; }
  }
  const react = {
    ...require("react"),
    useRef: () => ({ current: {} }),
    useMemo: (callback, deps) => {
      if (!memo || deps.some((value, index) => value !== memo.deps[index])) {
        memo = { value: callback(), deps };
      }
      return memo.value;
    },
    useState: () => [state, (value) => { state = value; stateUpdateCount += 1; }],
    useEffect: (callback) => { effect = callback; },
  };
  const localRequire = (name) => name === "react" ? react : require(name);
  const loaded = { exports: {} };
  const raf = (callback) => { const id = ++nextFrame; frames.set(id, callback); return id; };
  const cancel = (id) => { frames.delete(id); };
  const intl = {
    NumberFormat: class {
      constructor(locale) {
        formatterCount += 1;
        return new Intl.NumberFormat(locale);
      }
    },
  };
  new Function("require", "module", "exports", "window", "IntersectionObserver", "performance", "requestAnimationFrame", "cancelAnimationFrame", "Intl", output)(
    localRequire, loaded, loaded.exports, { IntersectionObserver: Observer, matchMedia: () => media }, Observer, { now: () => time }, raf, cancel,
    intl,
  );
  const render = (value = 100, locale = "en") => loaded.exports.AnimatedMetric({ value, locale });
  const text = (value = 100, locale = "en") => render(value, locale).props.children.map((child) => child.props.children);
  render();
  const cleanup = effect();
  return {
    text,
    observer,
    media,
    cleanup,
    frames,
    formatterCount: () => formatterCount,
    stateUpdateCount: () => stateUpdateCount,
    advance(now) {
      time = now;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(now));
    },
  };
}

test("formatter is reused across frames and updates when the locale changes", () => {
  const h = harness();
  assert.deepEqual(h.text(1234), ["1,234", "1,234"]);
  h.observer.trigger(true);
  h.advance(225);
  h.text();
  assert.equal(h.formatterCount(), 1);
  assert.deepEqual(h.text(1234, "de"), ["1.234", "1.234"]);
  assert.equal(h.formatterCount(), 2);
  h.cleanup();
});

test("metrics count only in view, replay on re-entry and keep the accessible value stable", () => {
  const h = harness();
  assert.deepEqual(h.text(), ["100", "100"]);
  h.observer.trigger(true);
  assert.deepEqual(h.text(), ["0", "100"]);
  h.advance(225);
  assert.deepEqual(h.text(), ["88", "100"]);
  h.advance(900);
  assert.deepEqual(h.text(), ["100", "100"]);
  h.observer.trigger(false);
  h.observer.trigger(true);
  assert.deepEqual(h.text(), ["0", "100"]);
  h.cleanup();
  assert.equal(h.frames.size, 0);
  assert.equal(h.observer.disconnected, true);
});

test("metrics limit React updates while counting large values", () => {
  const h = harness();
  h.text(100000);
  h.observer.trigger(true);
  for (let time = 16; time <= 448; time += 16) h.advance(time);
  h.advance(464);
  assert.deepEqual(h.text(100000), ["100,000", "100,000"]);
  assert.ok(h.stateUpdateCount() <= 16);
  h.cleanup();
});

test("reduced motion stops animation and restores the actual value", () => {
  const h = harness(true);
  h.observer.trigger(true);
  assert.deepEqual(h.text(), ["100", "100"]);
  assert.equal(h.frames.size, 0);
  h.media.matches = false;
  h.media.callback();
  assert.deepEqual(h.text(), ["0", "100"]);
  h.media.matches = true;
  h.media.callback();
  assert.deepEqual(h.text(), ["100", "100"]);
  assert.equal(h.frames.size, 0);
  h.cleanup();
});
