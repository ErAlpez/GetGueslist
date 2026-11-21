import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/app/dashboard/tickets/tickets-event-filter.tsx"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
const state = [];
let stateCursor = 0;
const react = {
  ...require("react"),
  useState(initial) {
    const index = stateCursor++;
    if (!(index in state)) state[index] = initial;
    return [state[index], (value) => { state[index] = value; }];
  },
};
const mocks = {
  react,
  "next/link": { __esModule: true, default: "a" },
  "lucide-react": { ArrowRight: "svg", Search: "svg" },
  "@/components/preferences-provider": { usePreferences: () => ({ t: (text) => text }) },
};
const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);

function find(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) return node.map((child) => find(child, predicate)).find(Boolean);
  if (predicate(node)) return node;
  return find(node.props?.children, predicate);
}

function findAll(node, predicate, result = []) {
  if (!node || typeof node !== "object") return result;
  if (Array.isArray(node)) {
    for (const child of node) findAll(child, predicate, result);
  } else {
    if (predicate(node)) result.push(node);
    findAll(node.props?.children, predicate, result);
  }
  return result;
}

function renderFilter() {
  stateCursor = 0;
  return loaded.exports.TicketsEventFilter({
    allGuestCount: 36,
    events,
    selectedEventId: undefined,
  });
}

const events = [
  { id: "spring", name: "Spring Showcase", _count: { registrations: 12 } },
  { id: "summer", name: "Summer Concert", _count: { registrations: 24 } },
];

test("event filter searches names case-insensitively and ignores surrounding whitespace", () => {
  assert.deepEqual(loaded.exports.filterTicketEvents(events, "  SHOW "), [events[0]]);
  assert.deepEqual(loaded.exports.filterTicketEvents(events, "concert"), [events[1]]);
});

test("empty or unmatched event searches keep all events or return no matches", () => {
  assert.deepEqual(loaded.exports.filterTicketEvents(events, ""), events);
  assert.deepEqual(loaded.exports.filterTicketEvents(events, "conference"), []);
});

test("event filter applies a search when the form is submitted", () => {
  state.length = 0;
  let tree = renderFilter();
  const search = find(tree, (node) => node.type === "input" && node.props["aria-label"] === "Search events");
  search.props.onChange({ target: { value: "show" } });
  tree = renderFilter();
  assert.equal(findAll(tree, (node) => node.type === "a" && node.props.href.startsWith("/dashboard/tickets?event=")).length, 2);

  let prevented = false;
  find(tree, (node) => node.type === "form").props.onSubmit({ preventDefault: () => { prevented = true; } });
  tree = renderFilter();
  assert.equal(prevented, true);
  assert.deepEqual(
    findAll(tree, (node) => node.type === "a" && node.props.href.startsWith("/dashboard/tickets?event=")).map((node) => node.props.href),
    ["/dashboard/tickets?event=spring"],
  );
});
