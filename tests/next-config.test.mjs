import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadNextConfig() {
  const source = fs.readFileSync(path.join(root, "next.config.ts"), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loadedModule = { exports: {} };
  new Function("require", "module", "exports", output)(require, loadedModule, loadedModule.exports);
  return loadedModule.exports.default;
}

test("security headers apply to every route and preserve same-origin camera access", async () => {
  const config = loadNextConfig();
  const rules = await config.headers();
  const securityRule = rules.find(({ source }) => source === "/:path*");
  const headers = new Map(securityRule?.headers.map(({ key, value }) => [key, value]));

  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.equal(headers.get("Referrer-Policy"), "no-referrer");
  assert.equal(headers.get("Permissions-Policy"), "camera=(self), microphone=(), geolocation=()");
  assert.equal(config.poweredByHeader, false);
});
