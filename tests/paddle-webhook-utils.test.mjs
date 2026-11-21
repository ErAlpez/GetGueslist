import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/lib/paddle-webhook-utils.ts"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
new Function("require", "module", "exports", output)(require, loaded, loaded.exports);
const { mapPaddleSubscriptionStatus, verifyPaddleWebhookSignature } = loaded.exports;

test("Paddle webhook signatures require the raw-body HMAC and a recent timestamp", () => {
  const secret = "sandbox-webhook-secret";
  const payload = '{"event_type":"subscription.created"}';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", secret).update(`${timestamp}:${payload}`).digest("hex");

  assert.equal(verifyPaddleWebhookSignature(payload, `ts=${timestamp};h1=${signature}`, secret), true);
  assert.equal(verifyPaddleWebhookSignature(`${payload} `, `ts=${timestamp};h1=${signature}`, secret), false);
  assert.equal(verifyPaddleWebhookSignature(payload, `ts=${timestamp};h1=${signature}`, "wrong-secret"), false);
  assert.equal(verifyPaddleWebhookSignature(payload, `ts=1;h1=${signature}`, secret), false);
});

test("Paddle subscription states map to the app's access statuses", () => {
  assert.equal(mapPaddleSubscriptionStatus("trialing"), "TRIALING");
  assert.equal(mapPaddleSubscriptionStatus("active"), "ACTIVE");
  assert.equal(mapPaddleSubscriptionStatus("past_due"), "PAST_DUE");
  assert.equal(mapPaddleSubscriptionStatus("paused"), "PAUSED");
  assert.equal(mapPaddleSubscriptionStatus("canceled"), "CANCELLED");
  assert.equal(mapPaddleSubscriptionStatus("unknown"), null);
});
