import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const avif = Buffer.from("0000ftypavif0000");

function loadTypeScript(file, mocks = {}) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}

const eventAttachment = loadTypeScript("src/lib/event-attachment.ts");

function harness({ existing = null, fileCount = 0, failOldDelete = false } = {}) {
  const calls = { created: [], updated: [], restores: [], uploads: [], deletions: [], conversions: [] };
  const findFile = async (args) => {
    if (!existing) return null;
    if (args.where.id) return args.where.id === existing.id ? existing : null;
    if (args.where.originalFileName) return existing;
    return null;
  };
  const transaction = {
    workspaceFile: {
      count: async () => fileCount,
      findFirst: findFile,
      create: async (args) => calls.created.push(args),
      update: async (args) => calls.updated.push(args),
      updateMany: async (args) => {
        calls.restores.push(args);
        return { count: 1 };
      },
    },
    activityLog: { create: async () => {} },
  };
  const prisma = {
    workspaceFile: {
      count: async () => fileCount,
      findFirst: findFile,
      updateMany: async (args) => {
        calls.restores.push(args);
        return { count: 1 };
      },
    },
    $transaction: async (callback) => callback(transaction),
  };
  const actions = loadTypeScript("src/app/dashboard/files/actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: (url) => { throw Object.assign(new Error("redirect"), { url }); } },
    "@/lib/event-attachment": eventAttachment,
    "@/lib/image-optimization": {
      convertImageToAvif: async (...args) => {
        calls.conversions.push(args);
        return avif;
      },
    },
    "@/lib/supabase-storage": {
      uploadSupabaseObject: async (...args) => calls.uploads.push(args),
      downloadSupabaseObject: async () => Buffer.from("previous bytes"),
      deleteSupabaseObject: async (value) => {
        calls.deletions.push(value);
        if (failOldDelete && value === existing?.storagePath) throw new Error("storage delete failed");
      },
    },
    "@/lib/prisma": { getPrisma: () => prisma },
    "@/lib/workspace": {
      getWorkspaceContext: async () => ({
        membership: { role: "ADMIN" },
        workspace: { id: "workspace-1" },
        user: { id: "user-1" },
      }),
    },
    "@/lib/workspace-roles": { workspaceRoleCanManageFiles: () => true },
  });
  return {
    calls,
    upload: (file) => {
      const formData = new FormData();
      formData.set("file", file);
      return actions.uploadWorkspaceFileAction({}, formData);
    },
  };
}

test("stores workspace images as AVIF while retaining the source filename", async () => {
  const { calls, upload } = harness();
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const result = await upload(new File([png], "poster.png", { type: "image/png" }));

  assert.equal(result.success, "File uploaded.");
  assert.equal(calls.created[0].data.fileName, "poster.avif");
  assert.equal(calls.created[0].data.originalFileName, "poster.png");
  assert.equal(calls.created[0].data.contentType, "image/avif");
  assert.equal(calls.uploads[0][2], "image/avif");
  assert.deepEqual(calls.uploads[0][1], avif);
  assert.equal(calls.conversions.length, 1);
});

test("replaces a same-name PDF without converting it and removes the old storage object", async () => {
  const existing = {
    id: "file-1",
    fileName: "agenda.pdf",
    originalFileName: "agenda.pdf",
    contentType: "application/pdf",
    size: 12,
    storagePath: "workspaces/workspace-1/files/file-1/agenda.pdf",
  };
  const { calls, upload } = harness({ existing, fileCount: 100 });
  const result = await upload(new File([Buffer.from("%PDF-1.7 replacement")], "agenda.pdf", { type: "application/pdf" }));

  assert.equal(result.success, "File replaced.");
  assert.equal(calls.created.length, 0);
  assert.equal(calls.updated[0].where.id, existing.id);
  assert.equal(calls.updated[0].data.contentType, "application/pdf");
  assert.equal(calls.uploads[0][2], "application/pdf");
  assert.equal(calls.deletions[0], existing.storagePath);
  assert.equal(calls.conversions.length, 0);
});

test("rolls back a workspace replacement when old storage cleanup fails", async () => {
  const existing = {
    id: "file-1",
    fileName: "agenda.pdf",
    originalFileName: "agenda.pdf",
    contentType: "application/pdf",
    size: 12,
    storagePath: "workspaces/workspace-1/files/file-1/agenda.pdf",
  };
  const { calls, upload } = harness({ existing, failOldDelete: true });
  const result = await upload(new File([Buffer.from("%PDF-1.7 replacement")], "agenda.pdf", { type: "application/pdf" }));

  assert.match(result.error, /replacement was rolled back/);
  assert.equal(calls.uploads[1][0], existing.storagePath);
  assert.equal(calls.restores[0].where.storagePath, calls.uploads[0][0]);
  assert.equal(calls.deletions[1], calls.uploads[0][0]);
});
