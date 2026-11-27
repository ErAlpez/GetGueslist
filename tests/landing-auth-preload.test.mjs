import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/components/landing-auth-modal.tsx"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function harness() {
  const state = [];
  let stateCursor = 0;
  let contextValue;
  const lazyAuthForm = () => null;
  const react = {
    ...require("react"),
    useState(initial) {
      const index = stateCursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value) => { state[index] = value; }];
    },
    useRef: () => ({ current: null }),
    useEffect: () => {},
    useContext: () => contextValue,
  };
  const mocks = {
    react,
    "next/dynamic": { default: () => lazyAuthForm },
    "next/link": { __esModule: true, default: () => null },
    "lucide-react": { X: () => null },
  };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  const loaded = { exports: {} };
  new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
  const renderModal = () => {
    stateCursor = 0;
    return loaded.exports.LandingAuthModal({ children: null, authenticated: false });
  };

  const initial = renderModal();
  contextValue = initial.props.value;
  return {
    lazyAuthForm,
    renderModal,
    trigger: () => loaded.exports.LandingAuthTrigger({ children: "Sign in", className: "sign-in", mode: "sign-in" }),
  };
}

function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  if (predicate(node)) return node;
  return find(node.props?.children, predicate);
}

test("hovering or focusing a sign-in trigger loads the form before opening the dialog", () => {
  const h = harness();
  const trigger = h.trigger();
  assert.equal(typeof trigger.props.onPointerEnter, "function");
  assert.equal(typeof trigger.props.onFocus, "function");
  trigger.props.onPointerEnter();

  const dialog = find(h.renderModal(), (node) => node.type === "dialog");
  assert.equal(dialog.props.open, undefined);
  assert.ok(find(dialog, (node) => node.type === h.lazyAuthForm));
});
