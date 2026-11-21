import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/lib/auth-errors.ts"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
new Function("require", "module", "exports", output)(require, loaded, loaded.exports);

test("explains the sign-in lockout wait time", () => {
  assert.equal(
    loaded.exports.getSignInErrorMessage("Too many requests. Please try again later."),
    "Too many sign-in attempts. Please wait at least 15 minutes before trying again.",
  );
});

test("preserves other sign-in errors and the fallback message", () => {
  assert.equal(loaded.exports.getSignInErrorMessage("Invalid credentials"), "Invalid credentials");
  assert.equal(loaded.exports.getSignInErrorMessage(undefined), "We couldn’t sign you in.");
});
