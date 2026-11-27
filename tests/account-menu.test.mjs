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
const roleSource = fs.readFileSync(path.join(root, "src/lib/workspace-roles.ts"), "utf8");
const roleOutput = ts.transpileModule(roleSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const roleModule = { exports: {} };
new Function("require", "module", "exports", roleOutput)(require, roleModule, roleModule.exports);

function harness(showOverview, signOutResult = {}, demoRole = null, readOfflineGuestQueue = () => []) {
  const slots = [];
  let cursor = 0;
  const navigation = [];
  const signOut = typeof signOutResult === "function"
    ? signOutResult
    : async () => signOutResult;
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
    "next/navigation": {
      usePathname: () => "/dashboard",
      useRouter: () => ({ replace: (url) => navigation.push(url), refresh: () => navigation.push("refresh") }),
    },
    "@/lib/auth-client": { authClient: { signOut } },
    "@/components/preferences-provider": { usePreferences: () => ({ t: (text) => text }) },
    "@/app/dashboard/demo-role/actions": { switchDemoRoleAction: () => {} },
    "@/app/dashboard/demo-plan/actions": { switchDemoPlanAction: () => {} },
    "@/app/dashboard/workspaces/actions": { switchWorkspaceAction: () => {} },
    "@/lib/offline-venuguestpass": {
      offlineVenuGuestPassCacheKey: "cache",
      offlineVenuGuestPassIdentityKey: "identity",
      offlineVenuGuestPassQueueKey: "queue",
      readOfflineGuestQueue,
    },
    "@/lib/workspace-roles": roleModule.exports,
    "./account-tooltip.css": {},
  };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  const loaded = { exports: {} };
  new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
  return {
    navigation,
    render() {
      cursor = 0;
      return loaded.exports.AccountMenu({ name: "Alex", email: "alex@example.test", image: "/avatar.png", showOverview, demoRole });
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
  const originalWindow = globalThis.window;
  globalThis.window = {
    localStorage: { removeItem() {} },
    location: { replace: (url) => h.navigation.push(url) },
  };
  try {
    await find(dialog, (node) => node.props?.className === "account-popover-sign-out").props.onClick();
  } finally {
    if (originalWindow) globalThis.window = originalWindow;
    else delete globalThis.window;
  }
  assert.deepEqual(h.navigation, ["/"]);
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

test("sign out disables the button and ignores repeated clicks while the request is pending", async () => {
  let resolveSignOut;
  let calls = 0;
  const h = harness(true, () => {
    calls += 1;
    return new Promise((resolve) => { resolveSignOut = resolve; });
  });
  const originalWindow = globalThis.window;
  globalThis.window = {
    localStorage: { removeItem() {} },
    location: { replace: (url) => h.navigation.push(url) },
  };

  try {
    find(h.render(), (node) => node.props?.className === "account-trigger").props.onClick();
    const button = find(h.render(), (node) => node.props?.className === "account-popover-sign-out");
    const pending = button.props.onClick();
    assert.equal(find(h.render(), (node) => node.props?.className === "account-popover-sign-out").props.disabled, true);
    await button.props.onClick();
    assert.equal(calls, 1);
    resolveSignOut({});
    await pending;
    assert.deepEqual(h.navigation, ["/"]);
  } finally {
    if (originalWindow) globalThis.window = originalWindow;
    else delete globalThis.window;
  }
});

test("sign out can continue after the offline queue check fails with explicit confirmation", async () => {
  let signOutCalls = 0;
  const h = harness(
    true,
    async () => { signOutCalls += 1; return {}; },
    null,
    () => { throw new Error("storage unavailable"); },
  );
  const originalWindow = globalThis.window;
  globalThis.window = {
    confirm: () => true,
    localStorage: { removeItem() {} },
    location: { replace: (url) => h.navigation.push(url) },
  };
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    find(h.render(), (node) => node.props?.className === "account-trigger").props.onClick();
    await find(h.render(), (node) => node.props?.className === "account-popover-sign-out").props.onClick();
    assert.equal(signOutCalls, 1);
    assert.deepEqual(h.navigation, ["/"]);
  } finally {
    console.error = originalConsoleError;
    if (originalWindow) globalThis.window = originalWindow;
    else delete globalThis.window;
  }
});

test("demo role selector explains the selected role and updates the description", () => {
  const h = harness(false, {}, "VIEWER");
  find(h.render(), (node) => node.props?.className === "account-trigger").props.onClick();
  let dialog = find(h.render(), (node) => node.props?.role === "dialog");
  const selector = find(dialog, (node) => node.props?.name === "role");
  assert.equal(selector.props.value, "VIEWER");
  assert.ok(find(dialog, (node) => node.type === "small" && node.props?.children === roleModule.exports.workspaceRoleDetails.VIEWER.description));

  selector.props.onChange({ currentTarget: { value: "MANAGER" } });
  dialog = find(h.render(), (node) => node.props?.role === "dialog");
  assert.ok(find(dialog, (node) => node.type === "small" && node.props?.children === roleModule.exports.workspaceRoleDetails.MANAGER.description));
});
