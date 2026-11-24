import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/lib/auth-origin.ts"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function("require", "module", "exports", output)(require, loaded, loaded.exports);
const { getTrustedAuthOrigins, resolveAuthBaseURL } = loaded.exports;

test("Preview auth uses and trusts only its Vercel branch and deployment origins", () => {
  const environment = {
    VERCEL_ENV: "preview",
    VERCEL_BRANCH_URL: "venuguestpass-git-paddle-sandbox-preview-erwin-project.vercel.app",
    VERCEL_URL: "venuguestpass-abc123-erwin-project.vercel.app",
    BETTER_AUTH_URL: "https://venuguestpass.com",
  };
  const baseURL = resolveAuthBaseURL(environment);
  const trustedOrigins = getTrustedAuthOrigins(baseURL, environment);

  assert.equal(baseURL, `https://${environment.VERCEL_BRANCH_URL}`);
  assert.deepEqual(trustedOrigins, [
    `https://${environment.VERCEL_BRANCH_URL}`,
    `https://${environment.VERCEL_URL}`,
  ]);
});

test("Production auth keeps its configured base URL without trusting Preview hosts", () => {
  const environment = {
    VERCEL_ENV: "production",
    VERCEL_BRANCH_URL: "venuguestpass-git-paddle-sandbox-preview-erwin-project.vercel.app",
    VERCEL_URL: "venuguestpass-production-abc123-erwin-project.vercel.app",
    BETTER_AUTH_URL: "https://venuguestpass.com",
  };
  const baseURL = resolveAuthBaseURL(environment);

  assert.equal(baseURL, environment.BETTER_AUTH_URL);
  assert.deepEqual(getTrustedAuthOrigins(baseURL, environment), ["https://venuguestpass.com"]);
});

test("Preview auth falls back to its deployment URL when no branch URL exists", () => {
  const environment = {
    VERCEL_ENV: "preview",
    VERCEL_URL: "venuguestpass-abc123-erwin-project.vercel.app",
    BETTER_AUTH_URL: "https://venuguestpass.com",
  };

  assert.equal(resolveAuthBaseURL(environment), `https://${environment.VERCEL_URL}`);
});
