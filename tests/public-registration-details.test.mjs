import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
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

const localization = loadTypeScript("src/lib/localization.ts");
const datetime = loadTypeScript("src/lib/datetime.ts");
const event = {
  id: "event-1",
  name: "Test event",
  visibility: "PUBLIC",
  status: "PUBLISHED",
  startsAt: new Date("2030-01-02T03:00:00Z"),
  endsAt: new Date("2030-01-03T05:30:00Z"),
  registrationDeadline: new Date("2030-01-01T04:00:00Z"),
  timezone: "Asia/Manila",
  venue: "Main hall",
  address: "123 Event Street",
  settings: null,
  registrationForm: null,
};

async function renderEvent(overrides = {}, locale = "en") {
  const page = loadTypeScript("src/app/register/[eventId]/page.tsx", {
    "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) },
    "next/image": { __esModule: true, default: () => null },
    "next/navigation": { notFound: () => { throw new Error("not found"); } },
    "@/components/public-registration-form": { PublicRegistrationForm: () => null },
    "@/lib/prisma": { getPrisma: () => ({ event: { findFirst: async () => ({ ...event, ...overrides }) } }) },
    "@/lib/registration-form": {},
    "@/lib/preferences": { getPreferences: async () => ({ locale }) },
    "@/lib/event-logo": { readEventLogo: () => null },
    "@/lib/datetime": datetime,
    "@/lib/localization": localization,
  });
  return renderToStaticMarkup(await page.default({ params: Promise.resolve({ eventId: event.id }) }));
}

test("shows the requested date-only range and deadline in the event time zone", async () => {
  const html = await renderEvent({
    startsAt: new Date("2026-12-22T16:00:00Z"),
    endsAt: new Date("2026-12-25T09:01:00Z"),
    registrationDeadline: new Date("2026-12-20T15:59:00Z"),
  });
  const text = html.replace(/<[^>]*>/g, "");
  assert.ok(text.includes("Date: Weds, Dec 23 - Fri, Dec 25, 2026"));
  assert.ok(text.includes("Registration deadline: Sun, Dec 20, 2026"));
  assert.ok(text.includes("Venue: Main hall"));
  assert.ok(text.includes("Address: 123 Event Street"));
  for (const label of ["Date", "Registration deadline", "Venue", "Address"]) {
    assert.ok(html.includes(`<strong>${label}:</strong>`));
  }
  assert.ok(!text.includes("Asia/Manila"));
  assert.ok(!text.includes("11:59"));
});

test("shows both years for events spanning years in the event time zone", async () => {
  const html = await renderEvent({
    startsAt: new Date("2026-12-30T16:00:00Z"),
    endsAt: new Date("2026-12-31T16:00:00Z"),
    registrationDeadline: null,
  });
  const text = html.replace(/<[^>]*>/g, "");
  assert.ok(text.includes("Date: Thu, Dec 31, 2026 - Fri, Jan 1, 2027"));
});

test("omits an unset deadline and localizes labels", async () => {
  const html = await renderEvent({ registrationDeadline: null, venue: null, address: null }, "es");
  assert.ok(html.includes("<strong>Fecha:</strong>"));
  assert.ok(!html.includes("Fecha límite de inscripción"));
  const withDeadline = await renderEvent({}, "es");
  assert.ok(withDeadline.includes("<strong>Fecha límite de inscripción:</strong>"));
});
