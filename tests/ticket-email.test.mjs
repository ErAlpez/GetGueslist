import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function load(file, mocks = {}) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}

const ticket = {
  to: "guest@example.test",
  guestName: "Alex <Guest>",
  eventName: "Event & friends",
  startsAt: new Date("2026-12-22T16:00:00Z"),
  endsAt: new Date("2026-12-25T09:00:00Z"),
  timeZone: "Asia/Manila",
  ticketId: "12345678",
  ticketUrl: "https://guestlist.example.test/t/signed-ticket",
  locale: "en",
};

function emailModule(qrcode = require("qrcode")) {
  return load("src/lib/email.ts", {
    qrcode,
    "@/lib/datetime": load("src/lib/datetime.ts"),
    "@/lib/localization": load("src/lib/localization.ts"),
  });
}

test("sends an inline QR ticket and fallback link with escaped event details", async () => {
  const originalFetch = globalThis.fetch;
  const oldKey = process.env.RESEND_API_KEY;
  const oldFrom = process.env.EMAIL_FROM;
  let encodedUrl;
  let request;
  try {
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM = "VenuGuestPass <test@example.test>";
    globalThis.fetch = async (url, options) => { request = { url, ...options }; return { ok: true }; };
    const qr = require("qrcode");
    const { sendTicketEmail } = emailModule({ toBuffer: async (url, options) => {
      encodedUrl = url;
      return qr.toBuffer(url, options);
    } });
    await sendTicketEmail(ticket);
    const body = JSON.parse(request.body);
    assert.equal(request.url, "https://api.resend.com/emails");
    assert.deepEqual(body.to, [ticket.to]);
    assert.equal(encodedUrl, ticket.ticketUrl);
    assert.match(body.html, /src="cid:ticket-qr"/);
    assert.match(body.html, /Alex &lt;Guest&gt;/);
    assert.match(body.html, /Event &amp; friends/);
    assert.match(body.html, /Weds, Dec 23 - Fri, Dec 25, 2026, 5:00 PM/);
    assert.match(body.text, /Weds, Dec 23 - Fri, Dec 25, 2026, 5:00 PM/);
    assert.ok(body.html.includes(ticket.ticketUrl));
    assert.ok(body.text.includes(ticket.ticketUrl));
    assert.equal(body.attachments[0].content_id, "ticket-qr");
    assert.deepEqual([...Buffer.from(body.attachments[0].content, "base64").subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = oldKey;
    if (oldFrom === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = oldFrom;
  }
});

test("reports missing configuration and provider failures without a success fallback", async () => {
  const originalFetch = globalThis.fetch;
  const oldKey = process.env.RESEND_API_KEY;
  const oldFrom = process.env.EMAIL_FROM;
  try {
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    const { sendTicketEmail } = emailModule();
    await assert.rejects(sendTicketEmail(ticket), /Set RESEND_API_KEY and EMAIL_FROM/);
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM = "test@example.test";
    globalThis.fetch = async () => ({ ok: false, status: 503 });
    await assert.rejects(sendTicketEmail(ticket), /status 503/);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = oldKey;
    if (oldFrom === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = oldFrom;
  }
});

test("sends the scheduled reminder with a QR attachment and private ticket link", async () => {
  const originalFetch = globalThis.fetch;
  const oldKey = process.env.RESEND_API_KEY;
  const oldFrom = process.env.EMAIL_FROM;
  let request;
  let encodedUrl;
  try {
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM = "VenuGuestPass <test@example.test>";
    globalThis.fetch = async (url, options) => { request = { url, ...options }; return { ok: true }; };
    const { sendAutomatedReminderEmail } = emailModule({
      toBuffer: async (url) => {
        encodedUrl = url;
        return Buffer.from("qr-image");
      },
    });
    await sendAutomatedReminderEmail({
      to: ticket.to,
      guestName: ticket.guestName,
      eventName: ticket.eventName,
      startsAt: ticket.startsAt,
      endsAt: ticket.endsAt,
      timeZone: ticket.timeZone,
      ticketId: ticket.ticketId,
      ticketUrl: ticket.ticketUrl,
    });
    const body = JSON.parse(request.body);
    assert.equal(encodedUrl, ticket.ticketUrl);
    assert.deepEqual(body.to, [ticket.to]);
    assert.equal(body.subject, "Your event is tomorrow");
    assert.match(body.html, /Alex &lt;Guest&gt;/);
    assert.match(body.html, /Event &amp; friends/);
    assert.match(body.html, /src="cid:ticket-qr"/);
    assert.ok(body.text.includes(ticket.ticketUrl));
    assert.equal(body.attachments[0].content_id, "ticket-qr");
    assert.equal(Buffer.from(body.attachments[0].content, "base64").toString(), "qr-image");
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = oldKey;
    if (oldFrom === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = oldFrom;
  }
});

test("sends the post-event email with escaped details and a feedback link", async () => {
  const originalFetch = globalThis.fetch;
  const oldKey = process.env.RESEND_API_KEY;
  const oldFrom = process.env.EMAIL_FROM;
  let request;
  try {
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM = "VenuGuestPass <test@example.test>";
    globalThis.fetch = async (url, options) => { request = { url, ...options }; return { ok: true }; };
    const { sendAutomatedFollowupEmail } = emailModule();
    const feedbackUrl = "https://guestlist.example.test/feedback/signed-ticket";
    await sendAutomatedFollowupEmail({
      to: ticket.to,
      guestName: ticket.guestName,
      eventName: ticket.eventName,
      feedbackUrl,
    });
    const body = JSON.parse(request.body);
    assert.deepEqual(body.to, [ticket.to]);
    assert.match(body.html, /Alex &lt;Guest&gt;/);
    assert.match(body.html, /Event &amp; friends/);
    assert.ok(body.html.includes(feedbackUrl));
    assert.ok(body.text.includes(feedbackUrl));
  } finally {
    globalThis.fetch = originalFetch;
    if (oldKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = oldKey;
    if (oldFrom === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = oldFrom;
  }
});
