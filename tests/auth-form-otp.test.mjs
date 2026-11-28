import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function createHarness() {
  const states = [];
  let stateIndex = 0;
  const navigation = [];
  const mocks = {
    react: {
      useState(initial) {
        const index = stateIndex++;
        if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
        return [states[index], (value) => {
          states[index] = typeof value === "function" ? value(states[index]) : value;
        }];
      },
    },
    "next/link": { __esModule: true, default: () => null },
    "next/navigation": {
      useRouter: () => ({
        push: (url) => navigation.push(url),
        replace: (url) => navigation.push(`replace:${url}`),
        refresh: () => navigation.push("refresh"),
      }),
    },
    "lucide-react": Object.fromEntries(
      ["ArrowLeft", "ArrowRight", "Check", "LoaderCircle", "LockKeyhole", "UserRound"]
        .map((name) => [name, () => null]),
    ),
    "@/lib/auth-client": {
      authClient: {
        signUp: { email: async () => ({ data: {} }) },
        signIn: { email: async () => ({ data: { twoFactorRedirect: true } }) },
        twoFactor: {
          sendOtp: async () => ({ data: {} }),
          verifyOtp: async () => ({ data: {} }),
        },
      },
    },
    "@/components/brand-mark": { BrandMark: () => null },
    "@/components/preferences-provider": { usePreferences: () => ({ locale: "en", t: (text) => text }) },
    "@/lib/auth-errors": { getSignInErrorMessage: (message) => message },
    "@/lib/localization": { localizeNode: (node) => node },
  };
  const source = fs.readFileSync(path.join(root, "src/components/auth-form.tsx"), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loadedModule = { exports: {} };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  new Function("require", "module", "exports", output)(localRequire, loadedModule, loadedModule.exports);

  return {
    navigation,
    render(mode = "sign-in") {
      stateIndex = 0;
      return loadedModule.exports.AuthForm({ mode });
    },
  };
}

function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  if (predicate(node)) return node;
  return find(node.props?.children, predicate);
}

test("successful OTP verification navigates without an artificial delay or extra refresh", async () => {
  const h = createHarness();
  const originalFormData = globalThis.FormData;
  globalThis.FormData = class {
    get(key) {
      return { email: "alex@example.test", password: "password123" }[key] ?? null;
    }
  };

  try {
    let form = find(h.render(), (node) => node.type === "form");
    await form.props.onSubmit({ preventDefault() {}, currentTarget: {} });

    let otpInput = find(h.render(), (node) => node.type === "input" && node.props.name === "otp");
    otpInput.props.onChange({ target: { value: "123456" } });
    form = find(h.render(), (node) => node.type === "form");
    await form.props.onSubmit({ preventDefault() {} });

    assert.deepEqual(h.navigation, ["/dashboard"]);
  } finally {
    if (originalFormData) globalThis.FormData = originalFormData;
    else delete globalThis.FormData;
  }
});

test("successful signup immediately confirms the verification email was sent", async () => {
  const h = createHarness();
  const originalFormData = globalThis.FormData;
  globalThis.FormData = class {
    get(key) {
      return {
        name: "Alex Morgan",
        email: "alex@example.test",
        password: "password123",
        confirmPassword: "password123",
      }[key] ?? null;
    }
  };

  try {
    const form = find(h.render("sign-up"), (node) => node.type === "form");
    await form.props.onSubmit({ preventDefault() {}, currentTarget: {} });

    const confirmation = find(h.render("sign-up"), (node) => node.props?.role === "status");
    assert.ok(confirmation);
    assert.match(JSON.stringify(confirmation), /Verification email sent automatically to/);
    assert.match(JSON.stringify(confirmation), /alex@example\.test/);
    assert.equal((JSON.stringify(h.render("sign-up")).match(/alex@example\.test/g) ?? []).length, 1);
  } finally {
    if (originalFormData) globalThis.FormData = originalFormData;
    else delete globalThis.FormData;
  }
});
