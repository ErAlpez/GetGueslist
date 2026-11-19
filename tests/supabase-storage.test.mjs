import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/lib/supabase-storage.ts"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
new Function("require", "module", "exports", output)(
  (name) => name === "server-only" ? {} : require(name),
  loaded,
  loaded.exports,
);
const storage = loaded.exports;

const originalEnv = {
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  bucket: process.env.SUPABASE_STORAGE_BUCKET,
};

function configureStorage() {
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.SUPABASE_STORAGE_BUCKET = "workspace-files";
}

test.after(() => {
  for (const [key, value] of [
    ["SUPABASE_URL", originalEnv.url],
    ["SUPABASE_SERVICE_ROLE_KEY", originalEnv.key],
    ["SUPABASE_STORAGE_BUCKET", originalEnv.bucket],
  ]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("uploads private objects with service credentials in headers and safe encoded paths", async () => {
  configureStorage();
  let requestUrl;
  let requestOptions;
  await storage.uploadSupabaseObject(
    "workspaces/workspace-1/files/file-1/report & notes.pdf",
    new Uint8Array([37, 80, 68, 70]),
    "application/pdf",
    async (url, options) => {
      requestUrl = url;
      requestOptions = options;
      return new Response(null, { status: 200 });
    },
  );

  assert.equal(requestUrl.pathname, "/storage/v1/object/workspace-files/workspaces/workspace-1/files/file-1/report%20%26%20notes.pdf");
  assert.equal(requestOptions.method, "POST");
  assert.equal(requestOptions.headers.Authorization, "Bearer test-service-role-key");
  assert.equal(requestOptions.headers["x-upsert"], "true");
  assert.equal(requestOptions.headers["Content-Type"], "application/pdf");
});

test("rejects unsafe paths and missing storage configuration", async () => {
  configureStorage();
  await assert.rejects(
    storage.uploadSupabaseObject("workspaces/../outside/file.pdf", new Uint8Array([1]), "application/pdf"),
    /invalid object path/,
  );

  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  await assert.rejects(
    storage.downloadSupabaseObject("workspaces/workspace-1/file.pdf"),
    /is not configured/,
  );
});

test("downloads private objects and reports provider failures", async () => {
  configureStorage();
  const bytes = await storage.downloadSupabaseObject(
    "workspaces/workspace-1/file.pdf",
    async (url, options) => {
      assert.equal(url.pathname, "/storage/v1/object/authenticated/workspace-files/workspaces/workspace-1/file.pdf");
      assert.equal(options.headers.apikey, "test-service-role-key");
      return new Response(new Uint8Array([1, 2, 3]));
    },
  );
  assert.deepEqual([...bytes], [1, 2, 3]);

  await assert.rejects(
    storage.deleteSupabaseObject("workspaces/workspace-1/file.pdf", async () => new Response(null, { status: 503 })),
    /delete failed with HTTP 503/,
  );
});
