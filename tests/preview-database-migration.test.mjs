import assert from "node:assert/strict";
import test from "node:test";
import { shouldPreparePreviewDatabase } from "../scripts/prepare-preview-database.mjs";

test("prepares the database only for the dedicated Vercel Preview branch", () => {
  assert.equal(shouldPreparePreviewDatabase({
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "paddle-sandbox-preview",
  }), true);
  assert.equal(shouldPreparePreviewDatabase({
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "paddle-sandbox-preview",
  }), false);
  assert.equal(shouldPreparePreviewDatabase({
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "main",
  }), false);
  assert.equal(shouldPreparePreviewDatabase({}), false);
});
