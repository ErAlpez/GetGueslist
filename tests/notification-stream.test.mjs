import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/app/api/notifications/stream/route.ts"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function loadRoute() {
  const mocks = {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/prisma": {
      getPrisma: () => ({
        activityLog: {
          findFirst: async () => null,
          findMany: async () => [],
        },
      }),
    },
    "@/lib/workspace": {
      getWorkspaceContext: async () => ({
        membership: { role: "OWNER" },
        workspace: { id: "workspace-1" },
      }),
    },
    "@/lib/workspace-roles": { workspaceRoleCanAccessSection: () => true },
  };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  const loaded = { exports: {} };
  new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}

test("notification stream closes before the Vercel runtime limit", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const timers = new Map();
  let nextTimerId = 0;
  globalThis.setTimeout = (callback, delay) => {
    const id = ++nextTimerId;
    timers.set(id, { callback, delay });
    return id;
  };
  globalThis.clearTimeout = (id) => timers.delete(id);

  try {
    const response = await loadRoute().GET();
    const reader = response.body.getReader();
    const initial = await reader.read();
    assert.equal(new TextDecoder().decode(initial.value), "retry: 3000\n\nevent: sync\ndata: {}\n\n");

    const [closeTimerId, closeTimer] = [...timers].find(([, timer]) => timer.delay === 240_000);
    timers.delete(closeTimerId);
    closeTimer.callback();

    assert.equal((await reader.read()).done, true);
    assert.equal(timers.size, 0);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
