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

function feedbackForm({ rating = 5, consent = false } = {}) {
  const formData = new FormData();
  formData.set("rating", String(rating));
  formData.set("message", "The event team saved time.");
  if (consent) formData.set("publicationConsent", "on");
  return formData;
}

function loadFeedbackAction({ role = "OWNER", emailError = false } = {}) {
  const calls = [];
  const context = {
    user: { id: "owner-1", name: "Avery Owner", email: "owner@example.test" },
    membership: { role },
    workspace: { id: "workspace-1", name: "North Studio" },
  };
  const actions = loadTypeScript("src/app/dashboard/feedback/actions.ts", {
    "next/navigation": { redirect: () => { throw new Error("redirect"); } },
    "@/lib/email": {
      sendFeedbackEmail: async () => {
        calls.push("email");
        if (emailError) throw new Error("mail unavailable");
      },
    },
    "@/lib/prisma": {
      getPrisma: () => ({
        platformReview: {
          create: async ({ data }) => {
            calls.push(data);
          },
        },
      }),
    },
    "@/lib/workspace": { getWorkspaceContext: async () => context },
  });
  return { ...actions, calls };
}

function loadModerationAction(review) {
  const calls = { updates: [], audits: [], revalidated: [] };
  const transaction = {
    platformReview: {
      findUnique: async () => review,
      update: async ({ data }) => calls.updates.push(data),
    },
    superAdminAuditLog: {
      create: async ({ data }) => calls.audits.push(data),
    },
  };
  const actions = loadTypeScript("src/app/dashboard/admin/plans/review-actions.ts", {
    "next/cache": { revalidatePath: (path) => calls.revalidated.push(path) },
    "@/lib/prisma": { getPrisma: () => ({ $transaction: async (callback) => callback(transaction) }) },
    "@/lib/super-admin": { requireSuperAdmin: async () => ({ user: { id: "admin-1" } }) },
  });
  return { ...actions, calls };
}

test("owner feedback is stored pending and includes only explicitly granted publication consent", async () => {
  const { submitFeedbackAction, calls } = loadFeedbackAction();
  const result = await submitFeedbackAction({}, feedbackForm({ consent: true }));

  assert.deepEqual(result, { success: true, notificationError: false });
  assert.deepEqual(calls[0], {
    ownerId: "owner-1",
    workspaceId: "workspace-1",
    authorName: "Avery Owner",
    workspaceName: "North Studio",
    rating: 5,
    message: "The event team saved time.",
    publicationConsent: true,
  });
  assert.equal(calls[1], "email");
});

test("a non-owner cannot grant homepage publication consent", async () => {
  const { submitFeedbackAction, calls } = loadFeedbackAction({ role: "MANAGER" });
  const result = await submitFeedbackAction({}, feedbackForm({ consent: true }));

  assert.deepEqual(result, { error: "Only workspace owners may submit a public review." });
  assert.equal(calls.length, 0);
});

test("saved feedback stays successful while a failed email alert is reported", async () => {
  const { submitFeedbackAction, calls } = loadFeedbackAction({ emailError: true });
  const originalError = console.error;
  console.error = () => {};
  let result;
  try {
    result = await submitFeedbackAction({}, feedbackForm());
  } finally {
    console.error = originalError;
  }

  assert.deepEqual(result, { success: true, notificationError: true });
  assert.equal(typeof calls[0], "object");
});

test("moderators cannot approve non-five-star or non-consented reviews", async () => {
  for (const review of [
    { id: "review-1", rating: 4, publicationConsent: true, status: "PENDING", workspaceName: "North Studio" },
    { id: "review-1", rating: 5, publicationConsent: false, status: "PENDING", workspaceName: "North Studio" },
  ]) {
    const { moderatePlatformReviewAction, calls } = loadModerationAction(review);
    const formData = new FormData();
    formData.set("reviewId", "review-1");
    formData.set("status", "APPROVED");
    await assert.rejects(moderatePlatformReviewAction(formData), /Only opted-in 5-star reviews/);
    assert.equal(calls.updates.length, 0);
    assert.equal(calls.audits.length, 0);
  }
});

test("approved reviews are updated and audited, then both public and admin pages refresh", async () => {
  const { moderatePlatformReviewAction, calls } = loadModerationAction({
    id: "review-1",
    rating: 5,
    publicationConsent: true,
    status: "PENDING",
    workspaceName: "North Studio",
  });
  const formData = new FormData();
  formData.set("reviewId", "review-1");
  formData.set("status", "APPROVED");
  await moderatePlatformReviewAction(formData);

  assert.equal(calls.updates[0].status, "APPROVED");
  assert.equal(calls.updates[0].moderatedById, "admin-1");
  assert.equal(calls.audits[0].action, "platform_review.approved");
  assert.deepEqual(calls.revalidated, ["/dashboard/admin/plans", "/"]);
});

test("moderators can hide reviews of any rating", async () => {
  const { moderatePlatformReviewAction, calls } = loadModerationAction({
    id: "review-1",
    rating: 2,
    publicationConsent: false,
    status: "PENDING",
    workspaceName: "North Studio",
  });
  const formData = new FormData();
  formData.set("reviewId", "review-1");
  formData.set("status", "HIDDEN");
  await moderatePlatformReviewAction(formData);

  assert.equal(calls.updates[0].status, "HIDDEN");
  assert.equal(calls.audits[0].action, "platform_review.hidden");
});
