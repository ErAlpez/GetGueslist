import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/lib/paddle-js-client.ts"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
new Function("require", "module", "exports", output)(createRequire(import.meta.url), loaded, loaded.exports);
const { initializePaddle } = loaded.exports;

test("Paddle initialization sends Retain the stored customer ID", () => {
  const previousWindow = globalThis.window;
  let initializeOptions;
  globalThis.window = {
    Paddle: {
      Environment: { set() {} },
      Initialize(options) {
        initializeOptions = options;
      },
      Checkout: { open() {}, close() {} },
    },
  };

  try {
    initializePaddle(
      "live-client-token",
      "live",
      undefined,
      "ctm_abcdefghijklmnopqrstuvwxyz",
    );
    assert.deepEqual(initializeOptions.pwCustomer, { id: "ctm_abcdefghijklmnopqrstuvwxyz" });
  } finally {
    globalThis.window = previousWindow;
  }
});

test("Paddle initialization rejects a malformed stored customer ID", () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    Paddle: {
      Environment: { set() {} },
      Initialize() {},
      Checkout: { open() {}, close() {} },
    },
  };

  try {
    assert.throws(
      () => initializePaddle("live-client-token", "live", undefined, "ctm_bad"),
      /stored Paddle customer ID is invalid/,
    );
  } finally {
    globalThis.window = previousWindow;
  }
});
