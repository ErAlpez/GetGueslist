import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/components/registration-form-builder.tsx"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function harness(initialQuestions) {
  const slots = [];
  let cursor = 0;
  const mocks = {
    react: {
      ...require("react"),
      useState(initial) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
        return [slots[index], (value) => { slots[index] = typeof value === "function" ? value(slots[index]) : value; }];
      },
      useRef(initial) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = { current: initial };
        return slots[index];
      },
      useActionState: () => [{}, () => {}, false],
    },
    "@/app/dashboard/events/actions": {},
    "@/components/preferences-provider": { usePreferences: () => ({ t: (text) => text }) },
    "@/components/event-logo-form": { EventLogoForm: () => null },
    "@/components/form-save-success": { FormSaveSuccess: () => null },
    "@/components/confirm-button": { ConfirmButton: () => null },
    "@/lib/registration-form": { registrationQuestionTypes: ["SHORT_TEXT"], isRegistrationQuestionType: () => true },
    "./registration-form-builder.css": {},
  };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  const loaded = { exports: {} };
  new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
  return () => {
    cursor = 0;
    return loaded.exports.RegistrationFormBuilder({
      eventId: "event",
      registrationUrl: "/register/event",
      logo: null,
      questions: initialQuestions,
      canShareRegistration: true,
    });
  };
}

function findAll(node, predicate) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => findAll(child, predicate));
  return [...(predicate(node) ? [node] : []), ...findAll(node.props?.children, predicate)];
}

test("existing questions start collapsed and new questions start expanded", () => {
  const render = harness([{ id: "saved", label: "Age", type: "SHORT_TEXT", required: false, options: [] }]);
  let tree = render();
  assert.equal(findAll(tree, (node) => node.type === "details")[0].props.open, false);
  findAll(tree, (node) => node.props?.className === "button button-light registration-add-question")[0].props.onClick();
  tree = render();
  assert.deepEqual(findAll(tree, (node) => node.type === "details").map((node) => node.props.open), [false, true]);
  const serialized = findAll(tree, (node) => node.props?.name === "questions")[0].props.value;
  assert.ok(JSON.parse(serialized).every((question) => !("localKey" in question)));
});

test("removing a new question preserves the identity of the remaining question", () => {
  const render = harness([]);
  const add = () => findAll(render(), (node) => node.props?.className === "button button-light registration-add-question")[0].props.onClick();
  add();
  add();
  let editors = findAll(render(), (node) => node.type === "article" && node.props.className === "registration-question-editor");
  const remainingKey = editors[1].key;
  findAll(editors[0], (node) => node.props?.className === "registration-question-remove")[0].props.onClick();
  editors = findAll(render(), (node) => node.type === "article" && node.props.className === "registration-question-editor");
  assert.equal(editors.length, 1);
  assert.equal(editors[0].key, remainingKey);
});
