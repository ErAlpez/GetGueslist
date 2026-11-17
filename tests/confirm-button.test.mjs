import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/components/confirm-button.tsx"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
const react = { ...require("react"), useId: () => "test-id", useRef: (value) => ({ current: value }) };
const mocks = {
  react,
  "./confirm-button.css": {},
  "@/components/preferences-provider": { usePreferences: () => ({ t: (message) => `translated: ${message}` }) },
};
const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);

function harness(props) {
  const tree = loaded.exports.ConfirmButton(props);
  const [trigger, dialog] = tree.props.children;
  const actions = dialog.props.children[3].props.children;
  const [cancel, confirm] = actions;
  let open = false;
  let focused = false;
  let submitted = 0;
  dialog.props.ref.current = {
    showModal: () => { open = true; },
    close: () => { open = false; },
  };
  cancel.props.ref.current = { focus: () => { focused = true; } };
  const clickTrigger = () => {
    let prevented = false;
    trigger.props.onClick({ preventDefault: () => { prevented = true; } });
    if (!prevented && trigger.props.type === "submit") submitted += 1;
    return prevented;
  };
  trigger.props.ref.current = { disabled: false, click: clickTrigger };
  return { trigger, dialog, cancel, confirm, clickTrigger, isOpen: () => open, isFocused: () => focused, submissions: () => submitted };
}

test("cancel blocks submission; confirmation preserves the original submitter", () => {
  let clicks = 0;
  const h = harness({
    message: "Remove photo?", name: "removeImage", value: "true",
    onClick: () => { clicks += 1; }, children: "Remove photo",
  });
  assert.equal(h.clickTrigger(), true);
  assert.equal(h.isOpen(), true);
  assert.equal(h.isFocused(), true);
  assert.equal(h.dialog.props.children[2].props.children, "translated: Remove photo?");
  h.cancel.props.onClick();
  assert.equal(h.isOpen(), false);
  assert.equal(h.submissions(), 0);
  assert.equal(clicks, 0);

  h.clickTrigger();
  h.confirm.props.onClick();
  assert.equal(h.isOpen(), false);
  assert.equal(h.submissions(), 1);
  assert.equal(clicks, 1);
  assert.equal(h.trigger.props.type, "submit");
  assert.equal(h.trigger.props.name, "removeImage");
  assert.equal(h.trigger.props.value, "true");
});

test("non-submit actions run only after confirmation and respect a disabled trigger", () => {
  let removed = 0;
  const h = harness({ message: "Remove question?", type: "button", onClick: () => { removed += 1; } });
  h.clickTrigger();
  h.cancel.props.onClick();
  assert.equal(removed, 0);
  h.clickTrigger();
  let escapePrevented = false;
  h.dialog.props.onKeyDown({ key: "Escape", preventDefault: () => { escapePrevented = true; } });
  assert.equal(escapePrevented, true);
  assert.equal(h.isOpen(), false);
  assert.equal(removed, 0);
  h.clickTrigger();
  h.confirm.props.onClick();
  assert.equal(removed, 1);
  assert.equal(h.submissions(), 0);

  h.clickTrigger();
  h.trigger.props.ref.current.disabled = true;
  h.confirm.props.onClick();
  assert.equal(removed, 1);
});
