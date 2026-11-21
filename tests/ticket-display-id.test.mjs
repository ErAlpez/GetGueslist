import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadTypeScript(file, mocks = {}) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}

const ticket = { id: "legacy-ticket-identifier", displayId: "42719583", status: "ACTIVE" };
const registration = {
  id: "registration-1",
  category: "GENERAL",
  registeredAt: new Date("2026-01-01T00:00:00Z"),
  attendee: { firstName: "Test", lastName: "Guest", email: "guest@example.test" },
  event: { name: "Test event", startsAt: new Date("2026-12-01T00:00:00Z"), endsAt: new Date("2026-12-02T00:00:00Z"), timezone: "UTC", venue: null },
  ticket: { ...ticket, attendanceLogs: [] },
};

test("manual check-in finds the display ID while preserving signed legacy tokens", async () => {
  let lookup;
  const route = loadTypeScript("src/app/api/check-in/search/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "@/lib/prisma": { getPrisma: () => ({ eventRegistration: { findMany: async (args) => { lookup = args; return [registration]; } } }) },
    "@/lib/tickets": { createTicketToken: (id) => `signed:${id}` },
    "@/lib/workspace": { getWorkspaceContext: async () => ({ workspace: { id: "workspace-1" }, membership: { role: "CHECKIN" } }) },
  });
  const response = await route.GET(new Request("http://localhost/api/check-in/search?event=event-1&q=42719583"));
  const body = await response.json();
  const ticketFilter = lookup.where.OR.at(-1).ticket.is.OR;
  assert.deepEqual(ticketFilter[0], { displayId: { equals: "42719583", mode: "insensitive" } });
  assert.deepEqual(ticketFilter[1], { id: { startsWith: "42719583", mode: "insensitive" } });
  assert.equal(body.attendees[0].ticketId, ticket.displayId);
  assert.equal(body.attendees[0].ticketToken, `signed:${ticket.id}`);
});

test("CSV export uses the display ID, not the underlying ticket ID", async () => {
  const route = loadTypeScript("src/app/api/guestlist/export/route.ts", {
    "@/lib/workspace": { getWorkspaceContext: async () => ({ workspace: { id: "workspace-1" }, membership: { role: "OWNER" }, subscription: { plan: { features: ["csv_exports", "workspace_exports", "checkin_activity"] } } }) },
    "@/lib/prisma": { getPrisma: () => ({ eventRegistration: { findMany: async () => [registration] } }) },
    "@/lib/date-range": loadTypeScript("src/lib/date-range.ts"),
  });
  const response = await route.GET(new Request("http://localhost/api/guestlist/export"));
  const csv = await response.text();
  assert.ok(csv.includes(`"${ticket.displayId}"`));
  assert.ok(!csv.includes(ticket.id));
});

test("existing public ticket links display the short ID without changing their lookup", async () => {
  let lookup;
  let event = {
    ...registration.event,
    startsAt: new Date("2026-12-22T16:00:00Z"),
    endsAt: new Date("2026-12-25T09:00:00Z"),
    timezone: "Asia/Manila",
  };
  const page = loadTypeScript("src/app/t/[token]/page.tsx", {
    "./public-ticket.css": {},
    "next/navigation": { notFound: () => { throw new Error("not found"); } },
    "@/components/ticket-qr": { TicketQr: () => null },
    "@/lib/prisma": { getPrisma: () => ({ ticket: { findFirst: async (args) => { lookup = args; return { ...ticket, registration: { ...registration, event } }; } } }) },
    "@/lib/preferences": { getPreferences: async () => ({ locale: "en" }) },
    "@/lib/localization": { localizeNode: (node) => node },
    "@/lib/datetime": loadTypeScript("src/lib/datetime.ts"),
    "@/lib/tickets": {
      verifyTicketToken: () => true,
      getTicketIdFromToken: () => ticket.id,
      hashTicketToken: () => "legacy-token-hash",
    },
  });
  const html = renderToStaticMarkup(await page.default({ params: Promise.resolve({ token: "legacy-token" }), searchParams: Promise.resolve({}) }));
  assert.deepEqual(lookup.where, { id: ticket.id, tokenHash: "legacy-token-hash" });
  assert.ok(html.includes(`<strong>${ticket.displayId}</strong>`));
  assert.ok(!html.includes(ticket.id));
  assert.match(html.replace(/<[^>]*>/g, ""), /Weds, Dec 23 - Fri, Dec 25, 2026/);
  event = { ...event, startsAt: new Date("2026-12-30T16:00:00Z"), endsAt: new Date("2026-12-31T16:00:00Z") };
  const spanningYears = renderToStaticMarkup(await page.default({ params: Promise.resolve({ token: "legacy-token" }), searchParams: Promise.resolve({ email: "failed" }) }));
  assert.match(spanningYears.replace(/<[^>]*>/g, ""), /Thu, Dec 31, 2026 - Fri, Jan 1, 2027/);
  assert.match(spanningYears, /role="alert"/);
  assert.match(spanningYears, /Registration succeeded, but we could not email your ticket/);
});

test("dashboard ticket card labels the display ID with a colon", async () => {
  const page = loadTypeScript("src/app/dashboard/tickets/page.tsx", {
    "./tickets.css": {},
    "./tickets-event-filter": { TicketsEventFilter: () => null },
    "next/link": { __esModule: true, default: ({ children }) => children },
    "@/components/download-button": { DownloadButton: () => null },
    "@/components/ticket-qr": { TicketQr: () => null },
    "@/lib/tickets": { createTicketToken: () => "signed-token" },
    "@/lib/prisma": { getPrisma: () => ({
      event: { findMany: async () => [] },
      eventRegistration: { count: async () => 1 },
      ticket: {
        count: async () => 1,
        findMany: async () => [{
          ...ticket,
          createdAt: new Date("2026-12-01T00:00:00Z"),
          registration: {
            ...registration,
            checkpointClaims: [],
          },
        }],
      },
    }) },
    "@/lib/preferences": { getPreferences: async () => ({ locale: "en" }) },
    "@/lib/localization": { localizeNode: (node) => node },
    "@/lib/workspace": { requireWorkspaceSection: async () => ({ workspace: { id: "workspace-1" }, membership: { role: "OWNER" }, subscription: { plan: { features: ["csv_exports", "workspace_exports", "checkin_activity"] } } }) },
  });
  const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({}) }));
  assert.ok(html.replace(/<[^>]*>/g, "").includes(`ID: ${ticket.displayId}`));
});
