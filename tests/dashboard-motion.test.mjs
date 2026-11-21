import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const rootPath = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(rootPath, "src/components/dashboard-motion.tsx"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function harness() {
  let effect;
  let intersection;
  let mutations;
  const media = {
    matches: false,
    addEventListener(_type, callback) { this.callback = callback; },
    removeEventListener() { this.callback = undefined; },
  };
  class Element {
    constructor(kind = "") {
      this.kind = kind;
      this.children = [];
      this.isConnected = true;
      this.animations = [];
    }
    matches(selector) {
      if (selector.startsWith(".app-content :is(.usage-bar")) return this.kind === "horizontal";
      if (selector.startsWith(".app-content :is(.overview-chart-column")) return this.kind === "chart";
      if (selector === ".app-content :is(.statistic-circle, .statistic-icon-circle)") {
        return this.kind === "circle" || this.kind === "icon-circle";
      }
      return ["panel", "horizontal", "chart", "circle", "icon-circle"].includes(this.kind);
    }
    querySelector(selector) {
      if (selector === ":scope > span" && this.kind === "horizontal") return this.children[0] ?? null;
      if (selector === ":scope > i" && this.kind === "chart") return this.children[0] ?? null;
      if (selector === ":scope > svg > circle[stroke-dashoffset]" && this.kind === "circle") return this.children[0] ?? null;
      if (selector === ":scope > svg > circle[stroke-dashoffset]" && this.kind === "icon-circle") {
        return this.children.find((child) => child.kind === "icon-circle-fill") ?? null;
      }
      return null;
    }
    getAttribute(name) {
      return name === "stroke-dashoffset" && ["circle-fill", "icon-circle-fill"].includes(this.kind) ? "25" : null;
    }
    querySelectorAll(selector) {
      return this.children.flatMap((child) => [
        ...(child.matches(selector) ? [child] : []),
        ...child.querySelectorAll(selector),
      ]);
    }
    contains(element) {
      return this === element || this.children.some((child) => child.contains(element));
    }
    addEventListener(_type, callback) { this.focusCallback = callback; }
    removeEventListener() { this.focusCallback = undefined; }
    animate(keyframes, options) {
      const animation = { keyframes, options, cancelled: false, cancel() { this.cancelled = true; } };
      this.animations.push(animation);
      return animation;
    }
  }
  class IntersectionObserver {
    constructor(callback) {
      intersection = {
        observed: new Set(),
        trigger: (target, isIntersecting) => callback([{ target, isIntersecting }]),
        observe(element) { this.observed.add(element); },
        unobserve(element) { this.observed.delete(element); },
        disconnect() { this.disconnected = true; },
      };
      return intersection;
    }
  }
  class MutationObserver {
    constructor(callback) {
      mutations = { trigger: callback, observe() {}, disconnect() { this.disconnected = true; } };
      return mutations;
    }
  }
  const root = new Element();
  const panel = new Element("panel");
  const horizontal = new Element("horizontal");
  const chart = new Element("chart");
  const circle = new Element("circle");
  const circleFill = new Element("circle-fill");
  const iconCircle = new Element("icon-circle");
  const iconCircleTrack = new Element("icon-circle-track");
  const iconCircleFill = new Element("icon-circle-fill");
  const horizontalFill = new Element("fill");
  const chartFill = new Element("fill");
  horizontal.children.push(horizontalFill);
  chart.children.push(chartFill);
  circle.children.push(circleFill);
  iconCircle.children.push(iconCircleTrack, iconCircleFill);
  root.children.push(panel, horizontal, chart, circle, iconCircle);
  const document = { querySelector: () => root, activeElement: null, documentElement: { dir: "ltr" } };
  const window = { IntersectionObserver, matchMedia: () => media };
  const react = { ...require("react"), useEffect: (callback) => { effect = callback; } };
  const localRequire = (name) => name === "react" ? react : name.endsWith(".css") ? {} : require(name);
  const loaded = { exports: {} };
  new Function("require", "module", "exports", "window", "document", "Element", "IntersectionObserver", "MutationObserver", output)(
    localRequire, loaded, loaded.exports, window, document, Element, IntersectionObserver, MutationObserver,
  );
  loaded.exports.DashboardMotion();
  const cleanup = effect();
  return {
    Element,
    root,
    panel,
    horizontal,
    horizontalFill,
    chart,
    chartFill,
    circle,
    circleFill,
    iconCircle,
    iconCircleTrack,
    iconCircleFill,
    intersection,
    mutations,
    media,
    cleanup,
  };
}

test("statistic circles animate their fill from zero on entry and replay without observing the fill", () => {
  const h = harness();
  assert.equal(h.intersection.observed.has(h.circle), true);
  assert.equal(h.intersection.observed.has(h.circleFill), false);
  assert.equal(h.intersection.observed.has(h.iconCircle), true);
  assert.equal(h.intersection.observed.has(h.iconCircleFill), false);
  h.intersection.trigger(h.circle, true);
  assert.deepEqual(h.circleFill.animations[0].keyframes, [{ strokeDashoffset: "100" }, { strokeDashoffset: "25" }]);
  h.intersection.trigger(h.iconCircle, true);
  assert.deepEqual(h.iconCircleFill.animations[0].keyframes, [{ strokeDashoffset: "100" }, { strokeDashoffset: "25" }]);
  assert.equal(h.iconCircleTrack.animations.length, 0);
  assert.ok(h.circleFill.animations[0].options.delay > 0);
  assert.ok(h.circleFill.animations[0].options.duration > 900);
  assert.equal(h.circleFill.animations[0].options.fill, "backwards");
  assert.equal(h.circle.animations.length, 0);
  h.intersection.trigger(h.circle, false);
  assert.equal(h.circleFill.animations[0].cancelled, true);
  h.intersection.trigger(h.circle, true);
  assert.equal(h.circleFill.animations.length, 2);
  h.media.matches = true;
  h.media.callback();
  assert.equal(h.circleFill.animations[1].cancelled, true);
  h.intersection.trigger(h.circle, true);
  assert.equal(h.circleFill.animations.length, 2);
  h.cleanup();
});

test("dashboard reveals replay and bars fill only after intersection", () => {
  const h = harness();
  assert.equal(h.panel.animations.length, 0);
  assert.equal(h.intersection.observed.has(h.horizontal), true);
  assert.equal(h.intersection.observed.has(h.chart), true);
  assert.equal(h.intersection.observed.has(h.horizontalFill), false);
  assert.equal(h.intersection.observed.has(h.chartFill), false);
  h.intersection.trigger(h.panel, true);
  h.intersection.trigger(h.horizontal, true);
  h.intersection.trigger(h.chart, true);
  assert.deepEqual(h.horizontalFill.animations[0].keyframes[0], { clipPath: "inset(0 100% 0 0)" });
  assert.deepEqual(h.chartFill.animations[0].keyframes[0], { clipPath: "inset(100% 0 0 0)" });
  for (const fill of [h.horizontalFill, h.chartFill]) {
    assert.ok(fill.animations[0].options.delay > 0);
    assert.ok(fill.animations[0].options.duration > 750);
    assert.equal(fill.animations[0].options.fill, "backwards");
  }
  assert.equal(h.panel.animations[0].options.delay, 0);
  assert.deepEqual(h.panel.animations[0].keyframes, [
    { opacity: 0.35, translate: "0 12px" },
    { opacity: 1, translate: "0 0" },
  ]);
  assert.equal(h.horizontal.animations.length, 0);
  assert.equal(h.chart.animations.length, 0);
  h.intersection.trigger(h.horizontal, false);
  assert.equal(h.horizontalFill.animations[0].cancelled, true);
  h.intersection.trigger(h.horizontal, true);
  assert.equal(h.horizontalFill.animations.length, 2);
  h.intersection.trigger(h.panel, false);
  assert.equal(h.panel.animations[0].cancelled, false);
  h.intersection.trigger(h.panel, true);
  assert.equal(h.panel.animations.length, 1);
  h.panel.animations[0].onfinish();
  h.intersection.trigger(h.panel, true);
  assert.equal(h.panel.animations.length, 1);
  h.intersection.trigger(h.panel, false);
  h.intersection.trigger(h.panel, true);
  assert.equal(h.panel.animations.length, 2);
  h.media.matches = true;
  h.media.callback();
  assert.equal(h.panel.animations[1].cancelled, true);
  assert.equal(h.horizontalFill.animations[1].cancelled, true);
  h.intersection.trigger(h.panel, true);
  assert.equal(h.panel.animations.length, 2);
  h.cleanup();
  assert.equal(h.intersection.disconnected, true);
  assert.equal(h.mutations.disconnected, true);
  assert.equal(h.root.focusCallback, undefined);
});

test("focusing an animating control stops its reveal without replaying it", () => {
  const h = harness();
  h.intersection.trigger(h.panel, true);
  h.root.focusCallback({ target: h.panel });
  assert.equal(h.panel.animations[0].cancelled, true);
  h.intersection.trigger(h.panel, true);
  assert.equal(h.panel.animations.length, 1);
  h.cleanup();
});

test("dynamically added and removed dashboard elements are observed and cleaned up", () => {
  const h = harness();
  const added = new h.Element("panel");
  h.root.children.push(added);
  h.mutations.trigger([{ addedNodes: [added], removedNodes: [] }]);
  assert.equal(h.intersection.observed.has(added), true);
  h.intersection.trigger(added, true);
  added.isConnected = false;
  h.root.children.pop();
  h.mutations.trigger([{ addedNodes: [], removedNodes: [added] }]);
  assert.equal(h.intersection.observed.has(added), false);
  assert.equal(added.animations[0].cancelled, true);
  h.cleanup();
});
