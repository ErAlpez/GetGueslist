import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function harness(file, exportName, props) {
  const slots = [];
  let cursor = 0;
  let actionState = { success: "Saved." };
  let pending = false;
  const react = {
    ...require("react"),
    useEffect() {},
    useRef(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = { current: initial };
      return slots[index];
    },
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], (value) => {
        slots[index] = typeof value === "function" ? value(slots[index]) : value;
      }];
    },
    useActionState: () => [actionState, () => {}, pending],
  };
  const mocks = {
    react,
    "@/app/dashboard/events/actions": {},
    "@/app/dashboard/settings/actions": {},
    "@/components/preferences-provider": { usePreferences: () => ({ locale: "en", t: (text) => text }) },
    "@/components/toast-provider": { useActionToastFeedback: () => {} },
    "@/components/settings-mutation-request": { submitSettingsMutation: async () => ({ success: "Saved." }) },
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "@/components/event-logo-form": { EventLogoForm: () => null },
    "@/components/confirm-button": { ConfirmButton: () => null },
    "@/lib/localization": { localizeNode: (node) => node },
    "@/lib/registration-form": {
      isRegistrationQuestionType: () => true,
      registrationQuestionTypes: ["SHORT_TEXT"],
    },
  };
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
  return {
    render() {
      cursor = 0;
      return loaded.exports[exportName](props);
    },
    setResult(result, isPending = false) {
      actionState = result;
      pending = isPending;
      if (file === "src/components/workspace-settings-form.tsx") slots[0] = result;
    },
  };
}

function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  if (predicate(node)) return node;
  return find(node.props?.children, predicate);
}

const classIs = (name) => (node) => node.props?.className === name;

test("registration saves do not render duplicate inline success feedback", () => {
  const h = harness("src/components/registration-form-builder.tsx", "RegistrationFormBuilder", {
    eventId: "event", registrationUrl: "https://example.test", logo: null, questions: [], canShareRegistration: false,
    canCustomForms: true, canBranding: true,
  });
  let tree = h.render();
  const actions = find(tree, classIs("form-save-actions"));
  assert.ok(find(actions, (node) => node.type === "button" && node.props.type === "submit"));

  find(tree, classIs("button button-light registration-add-question")).props.onClick();
  tree = h.render();
  h.setResult({ success: "Saved." }, true);
  h.render();
  h.setResult({ success: "Saved." });
  tree = h.render();
  assert.equal(find(tree, (node) => node.props?.className === "form-success"), undefined);
});

test("custom questions can be added and existing answered questions stay locked", () => {
  const h = harness("src/components/registration-form-builder.tsx", "RegistrationFormBuilder", {
    eventId: "event", registrationUrl: "https://example.test", logo: null, canShareRegistration: false,
    canCustomForms: true, canBranding: true,
    questions: [{ id: "saved", label: "Existing question", type: "SHORT_TEXT", required: false, options: [], locked: true }],
  });
  for (let index = 0; index < 2; index += 1) {
    find(h.render(), classIs("button button-light registration-add-question")).props.onClick();
  }
  const tree = h.render();
  const entries = find(tree, classIs("registration-question-list")).props.children;
  assert.equal(entries.length, 3);
  assert.ok(find(entries[0], (node) => node.type === "input" && node.props.value === "Existing question" && node.props.disabled));
  const data = JSON.parse(find(tree, (node) => node.type === "input" && node.props.name === "questions").props.value);
  assert.equal(data.length, 3);
  assert.equal(data[0].id, "saved");
});

test("workspace action errors remain visible without inline success feedback", () => {
  const h = harness("src/components/workspace-settings-form.tsx", "WorkspaceSettingsForm", {
    workspace: { name: "Workspace", contactEmail: null, contactPhone: null, organizationType: null, address: null, timezone: "UTC" },
  });
  h.setResult({ error: "Save failed." });
  const tree = h.render();
  assert.ok(find(tree, classIs("form-message form-error")));
  assert.equal(find(tree, (node) => node.props?.className === "form-success"), undefined);
});

test("workspace form prevents action resets from discarding edits", () => {
  const h = harness("src/components/workspace-settings-form.tsx", "WorkspaceSettingsForm", {
    workspace: { name: "Workspace", contactEmail: null, contactPhone: null, organizationType: null, address: null, timezone: "UTC" },
  });
  let prevented = false;
  h.render().props.onReset({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
});

test("workspace settings submit without dispatching a Server Action", () => {
  const h = harness("src/components/workspace-settings-form.tsx", "WorkspaceSettingsForm", {
    workspace: { name: "Workspace", contactEmail: null, contactPhone: null, organizationType: null, address: null, timezone: "UTC" },
  });
  const form = find(h.render(), classIs("settings-form"));

  assert.equal(typeof form.props.onSubmit, "function");
  assert.equal(form.props.action, undefined);
  assert.equal(form.props["data-toast-managed"], true);
});
