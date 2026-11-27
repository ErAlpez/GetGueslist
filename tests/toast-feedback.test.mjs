import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/components/toast-provider.tsx"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const hookRefs = [];
let hookCursor = 0;
const react = {
  ...require("react"),
  useEffect(effect) {
    effect();
  },
  useRef(initial) {
    const index = hookCursor++;
    if (!(index in hookRefs)) hookRefs[index] = { current: initial };
    return hookRefs[index];
  },
  useSyncExternalStore(_subscribe, getSnapshot) {
    return getSnapshot();
  },
};
const mocks = {
  react,
  "@/components/preferences-provider": { usePreferences: () => ({ t: (text) => text }) },
};
const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
const loaded = { exports: {} };
new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);

const messages = { loading: "Working...", success: "Completed.", error: "Could not complete the action." };

function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  if (predicate(node)) return node;
  return find(node.props?.children, predicate);
}

test("action errors become error toasts instead of success toasts", () => {
  assert.deepEqual(loaded.exports.resolveActionToastResult({ error: "Permission denied." }, messages), {
    kind: "error",
    message: "Permission denied.",
  });
});

test("structured action errors preserve their message", () => {
  assert.deepEqual(loaded.exports.resolveActionToastResult({ error: { message: "Session expired." } }, messages), {
    kind: "error",
    message: "Session expired.",
  });
});

test("unreadable action errors use the explicit error message", () => {
  assert.deepEqual(loaded.exports.resolveActionToastResult({ error: { code: "NETWORK" } }, messages), {
    kind: "error",
    message: messages.error,
  });
});

test("successful action messages are preserved", () => {
  assert.deepEqual(loaded.exports.resolveActionToastResult({ success: "Event created." }, messages), {
    kind: "success",
    message: "Event created.",
  });
});

test("controls with their own toast are skipped by the generic observer", () => {
  assert.equal(loaded.exports.shouldObserveGlobalToast({
    closest: (selector) => selector === "[data-toast-managed]" ? {} : null,
  }), false);
  assert.equal(loaded.exports.shouldObserveGlobalToast({ closest: () => null }), true);
});

test("unchanged actions dismiss their loading toast without showing success", () => {
  hookCursor = 0;
  loaded.exports.useActionToastFeedback(true, {}, messages);
  const loadingTree = loaded.exports.ToastProvider({ children: null });
  assert.ok(find(loadingTree, (node) => node.props?.className === "app-toast app-toast-loading"));

  hookCursor = 0;
  loaded.exports.useActionToastFeedback(false, { unchanged: true }, messages);
  const settledTree = loaded.exports.ToastProvider({ children: null });
  assert.equal(find(settledTree, (node) => node.props?.className?.startsWith("app-toast-")), undefined);
});
