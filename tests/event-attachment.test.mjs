import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
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
const {
  detectEventAttachmentContentType,
  eventAttachmentContentDisposition,
  maxEventAttachmentBytes,
  maxEventAttachmentsPerEvent,
  normalizeEventAttachmentFileName,
  normalizeEventAttachmentOriginalFileName,
} = eventAttachment;
const avif = Buffer.from("0000ftypavif0000");

test("accepts only supported file signatures", () => {
  assert.equal(detectEventAttachmentContentType(Buffer.from("%PDF-1.7")), "application/pdf");
  assert.equal(detectEventAttachmentContentType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(detectEventAttachmentContentType(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), "image/jpeg");
  assert.equal(detectEventAttachmentContentType(Buffer.from("RIFF1234WEBP")), "image/webp");
  assert.equal(detectEventAttachmentContentType(avif), "image/avif");
  assert.equal(detectEventAttachmentContentType(Buffer.from("<svg></svg>")), null);
});

test("normalizes attachment names and safely encodes download headers", () => {
  assert.equal(normalizeEventAttachmentFileName("../agenda.exe", "application/pdf"), "agenda.pdf");
  assert.equal(normalizeEventAttachmentOriginalFileName("../agenda.exe"), "agenda.exe");
  assert.throws(() => normalizeEventAttachmentFileName("script.js", "text/javascript"));
  assert.match(eventAttachmentContentDisposition('résumé "final".pdf'), /^attachment; filename=".*"; filename\*=UTF-8''/);
});

function createActionHarness({ attachmentCount = 0, existing = null, failOldDelete = false } = {}) {
  const calls = { created: [], updated: [], restores: [], activity: [], revalidated: [], uploads: [], deletions: [], conversions: [] };
  const findAttachment = async (args) => {
    if (!existing) return null;
    if (args.where.id) return args.where.id === existing.id ? existing : null;
    if (args.where.originalFileName) return existing;
    return null;
  };
  const transaction = {
    event: { findFirst: async () => ({ id: "event-1" }) },
    eventAttachment: {
      count: async () => attachmentCount,
      findFirst: findAttachment,
      create: async (args) => calls.created.push(args),
      update: async (args) => calls.updated.push(args),
      updateMany: async (args) => {
        calls.restores.push(args);
        return { count: 1 };
      },
    },
    activityLog: { create: async (args) => calls.activity.push(args) },
  };
  const prisma = {
    event: { findFirst: async () => ({ id: "event-1" }) },
    eventAttachment: {
      count: async () => attachmentCount,
      findFirst: findAttachment,
      updateMany: async (args) => {
        calls.restores.push(args);
        return { count: 1 };
      },
    },
    $transaction: async (callback) => callback(transaction),
  };
  const actions = loadTypeScript("src/app/dashboard/events/actions.ts", {
    "next/cache": { revalidatePath: (path) => calls.revalidated.push(path) },
    "next/navigation": {
      redirect: (url) => { throw Object.assign(new Error("redirect"), { url }); },
      notFound: () => { throw new Error("not found"); },
    },
    "@/lib/automated-followup-schedule": {},
    "@/lib/datetime": {},
    "@/lib/event-attachment": eventAttachment,
    "@/lib/event-logo": {},
    "@/lib/image-optimization": {
      convertImageToAvif: async (...args) => {
        calls.conversions.push(args);
        return avif;
      },
    },
    "@/lib/supabase-storage": {
      uploadSupabaseObject: async (...args) => calls.uploads.push(args),
      downloadSupabaseObject: async () => Buffer.from("previous file"),
      deleteSupabaseObject: async (path) => {
        calls.deletions.push(path);
        if (failOldDelete && path === existing?.storagePath) throw new Error("storage delete failed");
      },
    },
    "@/lib/plan-features": { workspaceHasFeature: () => true },
    "@/lib/prisma": { getPrisma: () => prisma },
    "@/lib/registration-form": { registrationQuestionTypes: ["TEXT"] },
    "@/lib/workspace": {
      getWorkspaceContext: async () => ({
        membership: { role: "ADMIN" },
        workspace: { id: "workspace-1" },
        user: { id: "user-1" },
      }),
    },
  });
  return {
    calls,
    upload: (file) => {
      const formData = new FormData();
      formData.set("eventId", "event-1");
      formData.set("file", file);
      return actions.uploadEventAttachmentAction({}, formData);
    },
  };
}

test("stores a signature-verified file with a safe name and activity record", async () => {
  const { calls, upload } = createActionHarness();
  const file = new File([Buffer.from("%PDF-1.7")], "../agenda.exe", { type: "image/png" });
  const result = await upload(file);

  assert.equal(result.success, "File uploaded.");
  assert.equal(calls.created[0].data.fileName, "agenda.pdf");
  assert.equal(calls.created[0].data.contentType, "application/pdf");
  assert.equal(calls.created[0].data.size, file.size);
  assert.equal(calls.created[0].data.data, undefined);
  assert.equal(calls.created[0].data.storagePath, calls.uploads[0][0]);
  assert.equal(calls.uploads[0][2], "application/pdf");
  assert.equal(calls.activity[0].data.action, "event.attachment_uploaded");
  assert.deepEqual(calls.revalidated, ["/dashboard/events/event-1", "/dashboard/files"]);
});

test("rejects files over the cap and uploads after the event attachment limit", async () => {
  const full = createActionHarness({ attachmentCount: maxEventAttachmentsPerEvent });
  const pdf = new File([Buffer.from("%PDF-1.7")], "agenda.pdf", { type: "application/pdf" });
  assert.deepEqual(await full.upload(pdf), { error: "This event has reached its attachment limit." });
  assert.equal(full.calls.created.length, 0);
  assert.equal(full.calls.uploads.length, 0);

  const harness = createActionHarness();
  const oversized = new File([new Uint8Array(maxEventAttachmentBytes + 1)], "large.pdf", { type: "application/pdf" });
  assert.deepEqual(await harness.upload(oversized), { error: "Files can’t exceed 2 MB." });
  assert.equal(harness.calls.created.length, 0);
});

test("accepts a file at the configured per-file size boundary", async () => {
  const { calls, upload } = createActionHarness();
  const bytes = new Uint8Array(maxEventAttachmentBytes);
  bytes.set(Buffer.from("%PDF-1.7"));
  const file = new File([bytes], "large.pdf", { type: "application/pdf" });
  const result = await upload(file);

  assert.equal(result.success, "File uploaded.");
  assert.equal(calls.created[0].data.size, maxEventAttachmentBytes);
});

test("converts uploaded images to AVIF and keeps the original filename for replacement", async () => {
  const { calls, upload } = createActionHarness();
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const result = await upload(new File([png], "poster.png", { type: "image/png" }));

  assert.equal(result.success, "File uploaded.");
  assert.equal(calls.created[0].data.fileName, "poster.avif");
  assert.equal(calls.created[0].data.originalFileName, "poster.png");
  assert.equal(calls.created[0].data.contentType, "image/avif");
  assert.deepEqual(calls.uploads[0][1], avif);
  assert.equal(calls.uploads[0][2], "image/avif");
  assert.equal(calls.conversions.length, 1);
});

test("replaces a same-name event file even at the attachment limit and deletes its old object", async () => {
  const existing = {
    id: "attachment-1",
    fileName: "agenda.pdf",
    originalFileName: "agenda.pdf",
    contentType: "application/pdf",
    size: 12,
    data: null,
    storagePath: "workspaces/workspace-1/events/event-1/attachment-1/agenda.pdf",
  };
  const { calls, upload } = createActionHarness({
    attachmentCount: maxEventAttachmentsPerEvent,
    existing,
  });
  const result = await upload(new File([Buffer.from("%PDF-1.7 replacement")], "agenda.pdf", { type: "application/pdf" }));

  assert.equal(result.success, "File replaced.");
  assert.equal(calls.created.length, 0);
  assert.equal(calls.updated[0].where.id, existing.id);
  assert.equal(calls.updated[0].data.fileName, "agenda.pdf");
  assert.equal(calls.updated[0].data.contentType, "application/pdf");
  assert.equal(calls.deletions[0], existing.storagePath);
  assert.equal(calls.conversions.length, 0);
});

test("rolls back an event replacement when old storage cleanup fails", async () => {
  const existing = {
    id: "attachment-1",
    fileName: "agenda.pdf",
    originalFileName: "agenda.pdf",
    contentType: "application/pdf",
    size: 12,
    data: null,
    storagePath: "workspaces/workspace-1/events/event-1/attachment-1/agenda.pdf",
  };
  const { calls, upload } = createActionHarness({ existing, failOldDelete: true });
  const result = await upload(new File([Buffer.from("%PDF-1.7 replacement")], "agenda.pdf", { type: "application/pdf" }));

  assert.match(result.error, /replacement was rolled back/);
  assert.equal(calls.uploads[1][0], existing.storagePath);
  assert.equal(calls.restores[0].where.storagePath, calls.uploads[0][0]);
  assert.equal(calls.deletions[1], calls.uploads[0][0]);
});
