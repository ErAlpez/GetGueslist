import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/components/account-menu.tsx"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function harness(showOverview, signOutResult = {}) {
  const slots = [];
  let cursor = 0;
  const navigation = [];
  const mocks = {
    react: {
      ...require("react"),
      useState(initial) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
      },
      useRef: () => ({ current: null }),
      useEffect: () => {},
      useId: () => `test-${cursor++}`,
    },
    "next/link": { __esModule: true, default: () => null },
    "next/image": { __esModule: true, default: () => null },
    "next/navigation": { useRouter: () => ({ replace: (url) => navigation.push(url), refresh: () => navigation.push("refresh") }) },
    "@/lib/auth-client": { authClient: { signOut: async () => signOutResult } },
    "@/components/preferences-provider": { usePreferences: () => ({ t: (text) => text }) },
    "./account-tooltip.css": {},
  };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  const loaded = { exports: {} };
  new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
  return {
    navigation,
    render() {
      cursor = 0;
      return loaded.exports.AccountMenu({ name: "Alex", email: "alex@example.test", image: "/avatar.png", showOverview });
    },
  };
}

function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  if (predicate(node)) return node;
  return find(node.props?.children, predicate);
}

test("landing menu opens with overview, settings, and sign out", async () => {
  const h = harness(true);
  let tree = h.render();
  const trigger = find(tree, (node) => node.props?.className === "account-trigger");
  assert.equal(trigger.props["aria-expanded"], false);
  trigger.props.onClick();
  tree = h.render();
  const dialog = find(tree, (node) => node.props?.role === "dialog");
  assert.equal(dialog.props.id, trigger.props["aria-controls"]);
  assert.ok(find(dialog, (node) => node.props?.href === "/dashboard"));
  assert.ok(find(dialog, (node) => node.props?.href === "/dashboard/settings"));
  await find(dialog, (node) => node.props?.className === "account-popover-sign-out").props.onClick();
  assert.deepEqual(h.navigation, ["/", "refresh"]);
});

test("dashboard menu retains its existing links and reports sign-out failures", async () => {
  const h = harness(false, { error: { message: "Failed" } });
  find(h.render(), (node) => node.props?.className === "account-trigger").props.onClick();
  const dialog = find(h.render(), (node) => node.props?.role === "dialog");
  assert.equal(find(dialog, (node) => node.props?.href === "/dashboard"), undefined);
  assert.ok(find(dialog, (node) => node.props?.href === "/dashboard/settings"));
  await find(dialog, (node) => node.props?.className === "account-popover-sign-out").props.onClick();
  assert.deepEqual(h.navigation, []);
  assert.equal(find(h.render(), (node) => node.props?.role === "alert").props.children, "Sign out failed. Please try again.");
});
