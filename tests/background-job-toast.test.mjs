import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/components/background-job-toast.ts"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const toastEvents = [];
const mocks = {
  "@/components/toast-provider": {
    showToast: (...args) => {
      toastEvents.push(["show", ...args]);
      return "toast-1";
    },
    updateToast: (...args) => toastEvents.push(["update", ...args]),
  },
};
const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
const loaded = { exports: {} };
new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);

function response(payload) {
  return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
}

test("background-job toast remains loading until the persisted job completes", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const replies = [
    response({ id: "job-1", status: "PENDING", progress: 0, result: null, error: null }),
    response({ id: "job-1", status: "COMPLETED", progress: 100, result: { importedCount: 3 }, error: null }),
  ];
  toastEvents.length = 0;
  globalThis.fetch = async () => replies.shift();
  globalThis.setTimeout = (callback) => {
    queueMicrotask(callback);
    return 1;
  };

  try {
    const toastId = loaded.exports.beginBackgroundJobToast("Importing guests...");
    const job = await loaded.exports.watchBackgroundJob(toastId === "toast-1" ? "job-1" : "", toastId, () => "Imported 3 guests.");
    assert.equal(job.status, "COMPLETED");
    assert.deepEqual(toastEvents[0], ["show", "Importing guests...", "loading", { deduplicate: false }]);
    assert.deepEqual(toastEvents.at(-1), ["update", "toast-1", "Imported 3 guests.", "success"]);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("background-job toast surfaces persisted worker errors", async () => {
  const originalFetch = globalThis.fetch;
  toastEvents.length = 0;
  globalThis.fetch = async () => response({
    id: "job-2",
    status: "FAILED",
    progress: 0,
    result: null,
    error: "The event is no longer available.",
  });

  try {
    const job = await loaded.exports.watchBackgroundJob("job-2", "toast-2", () => "Completed.");
    assert.equal(job.status, "FAILED");
    assert.deepEqual(toastEvents.at(-1), ["update", "toast-2", "The event is no longer available.", "error"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
