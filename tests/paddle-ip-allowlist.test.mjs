import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/lib/paddle-ip-allowlist.ts"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
new Function("require", "module", "exports", output)(require, loaded, loaded.exports);
const { isIpv4InCidr, isPaddleWebhookIpAllowed } = loaded.exports;

test("Paddle IPv4 CIDR matching handles exact addresses and ranges", () => {
  assert.equal(isIpv4InCidr("34.237.3.244", "34.237.3.244/32"), true);
  assert.equal(isIpv4InCidr("34.237.3.245", "34.237.3.244/32"), false);
  assert.equal(isIpv4InCidr("192.0.2.42", "192.0.2.0/24"), true);
  assert.equal(isIpv4InCidr("192.0.3.42", "192.0.2.0/24"), false);
  assert.equal(isIpv4InCidr("not-an-ip", "0.0.0.0/0"), false);
  assert.equal(isIpv4InCidr("192.0.2.42", "192.0.2.0/"), false);
  assert.equal(isIpv4InCidr("192.0.2.42", "192.0.2.0/33"), false);
});

test("Paddle webhook IP checks fetch the allowlist from the supplied endpoint", async () => {
  const previousFetch = globalThis.fetch;
  let requestedEndpoint = "";
  globalThis.fetch = async (endpoint, options) => {
    requestedEndpoint = String(endpoint);
    assert.equal(options.cache, "no-store");
    return {
      ok: true,
      json: async () => ({ data: { ipv4_cidrs: ["34.237.3.244/32"] } }),
    };
  };

  try {
    const endpoint = "https://api.paddle.com/ips?test=allowlist";
    assert.equal(await isPaddleWebhookIpAllowed("34.237.3.244", endpoint), true);
    assert.equal(requestedEndpoint, endpoint);
    assert.equal(await isPaddleWebhookIpAllowed("34.237.3.245", endpoint), false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Paddle webhook IP checks fail closed on invalid allowlist data", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ data: { ipv4_cidrs: ["not-a-cidr"] } }),
  });

  try {
    await assert.rejects(
      isPaddleWebhookIpAllowed("34.237.3.244", "https://api.paddle.com/ips?test=invalid"),
      /invalid IPv4 CIDR list/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
