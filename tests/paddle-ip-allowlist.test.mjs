import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { isPaddleWebhookIpAllowed } = require(path.join(root, "src/lib/paddle-ip-allowlist.ts"));

test("Paddle webhook IP checks use the live endpoint list", async () => {
  const previousFetch = globalThis.fetch;
  const endpoint = "https://api.paddle.com/ips?test=dynamic";
  let requestedEndpoint;
  globalThis.fetch = async (url) => {
    requestedEndpoint = String(url);
    return {
      ok: true,
      json: async () => ({ data: { ipv4_cidrs: ["34.237.3.244/32", "52.11.166.252/32"] } }),
    };
  };

  try {
    assert.equal(await isPaddleWebhookIpAllowed("34.237.3.244", endpoint), true);
    assert.equal(await isPaddleWebhookIpAllowed("34.237.3.245", endpoint), false);
    assert.equal(requestedEndpoint, endpoint);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Paddle webhook IP checks fail closed on invalid IP lists", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ data: { ipv4_cidrs: ["not-an-ip/32"] } }),
  });

  try {
    await assert.rejects(
      isPaddleWebhookIpAllowed("34.237.3.244", "https://api.paddle.com/ips?test=invalid"),
      /invalid IPv4 CIDR list/,
    );
    assert.equal(
      await isPaddleWebhookIpAllowed("not-an-ip", "https://api.paddle.com/ips?test=invalid-address"),
      false,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
