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

const categories = load("src/lib/attendee-categories.ts");
const details = load("src/lib/registration-details.ts");
const localization = load("src/lib/localization.ts");
process.env.NEXT_PUBLIC_APP_URL = "https://guestlist.example.test";

test("public form offers the manual categories and defaults to General", () => {
  const form = load("src/components/public-registration-form.tsx", {
    react: { ...React, useActionState: () => [{}, () => {}, false] },
    "@/app/register/[eventId]/actions": {},
    "@/components/preferences-provider": { usePreferences: () => ({ t: (text) => localization.translate("es", text) }) },
    "@/lib/attendee-categories": categories,
  });
  const html = renderToStaticMarkup(React.createElement(form.PublicRegistrationForm, { eventId: "event-1", questions: [] }));
  assert.match(html, /<select name="category" required="">/);
  assert.match(html, /<option value="GENERAL" selected="">General<\/option>/);
  assert.match(html, /<option value="SPEAKER">Ponente<\/option>/);
  for (const category of categories.attendeeCategories) assert.ok(html.includes(`value="${category}"`));
});

test("existing custom questions remain on the public registration form", () => {
  const form = load("src/components/public-registration-form.tsx", {
    react: { ...React, useActionState: () => [{}, () => {}, false] },
    "@/app/register/[eventId]/actions": {},
    "@/components/preferences-provider": { usePreferences: () => ({ t: (text) => text }) },
    "@/lib/attendee-categories": categories,
  });
  const html = renderToStaticMarkup(React.createElement(form.PublicRegistrationForm, {
    eventId: "event-1",
    questions: [{ id: "question-1", label: "Existing question", type: "SHORT_TEXT", required: true, options: [] }],
  }));
  assert.match(html, /Existing question/);
  assert.match(html, /<input(?=[^>]*name="question_question-1")(?=[^>]*required="")[^>]*>/);
});

function registrationHarness({ manual = false, existingAttendee = false, emailFails = false } = {}) {
  const created = {};
  const sentEmails = [];
  let committed = false;
  const transaction = {
    event: { findFirst: async () => ({ id: "event-1", name: "Test event", timezone: "UTC", startsAt: new Date("2098-12-30"), workspaceId: "workspace-1", capacity: null, endsAt: new Date("2099-01-01"), registrationDeadline: null, status: "PUBLISHED", visibility: "PUBLIC", settings: null, registrationForm: null }) },
    subscription: { findUnique: async () => ({ plan: { attendeePerEventLimit: null } }) },
    eventRegistration: {
      count: async () => 0,
      findUnique: async () => null,
      create: async ({ data }) => { created.registration = data; return { id: "registration-1", ticket: { displayId: "12345678" } }; },
    },
    attendee: {
      findUnique: async () => existingAttendee ? { id: "attendee-1" } : null,
      create: async ({ data }) => { created.attendee = data; return { id: "attendee-1" }; },
    },
    ticketType: { findFirst: async () => ({ id: "type-1", capacity: null }) },
    activityLog: { create: async ({ data }) => { created.activity = data; } },
  };
  const action = load(manual ? "src/app/dashboard/guestlist/actions.ts" : "src/app/register/[eventId]/actions.ts", {
    "next/navigation": { redirect: (url) => { throw new Error(`redirect:${url}`); } },
    "@/lib/prisma": { getPrisma: () => ({ $transaction: async (callback) => { const result = await callback(transaction); committed = true; return result; } }) },
    "@/lib/registration-form": {},
    "@/lib/tickets": { createTicketToken: () => "ticket-token", hashTicketToken: () => "hash" },
    "@/lib/attendee-categories": categories,
    "@/lib/registration-details": details,
    "@/lib/preferences": { getPreferences: async () => ({ locale: "en" }) },
    "@/lib/email": { sendTicketEmail: async (email) => {
      assert.equal(committed, true);
      sentEmails.push(email);
      if (emailFails) throw new Error("Delivery failed");
    } },
    "@/lib/workspace": { getWorkspaceContext: async () => ({ workspace: { id: "workspace-1" }, user: { id: "user-1" }, membership: { role: "MANAGER" } }) },
  })[manual ? "registerAttendeeAction" : "registerForEventAction"];
  return { action, created, sentEmails };
}

function input(category) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ eventId: "event-1", firstName: "Alex", lastName: "Guest", email: "alex@example.test" })) form.set(key, value);
  form.set("phone", "");
  if (category !== undefined) form.set("category", category);
  return form;
}

test("selected category is saved with the registration and activity", async () => {
  const { action, created } = registrationHarness();
  await assert.rejects(action({}, input("SPEAKER")), /redirect:\/t\/ticket-token/);
  assert.equal(created.registration.category, "SPEAKER");
  assert.equal(created.activity.metadata.category, "SPEAKER");
  assert.equal(created.registration.registrationSource, "online");
});

test("public registration emails the committed ticket to the submitted address", async () => {
  const h = registrationHarness();
  await assert.rejects(h.action({}, input("GENERAL")), /redirect:\/t\/ticket-token$/);
  assert.equal(h.sentEmails.length, 1);
  assert.equal(h.sentEmails[0].to, "alex@example.test");
  assert.equal(h.sentEmails[0].ticketUrl, "https://guestlist.example.test/t/ticket-token");
  assert.equal(h.sentEmails[0].ticketId, "12345678");
});

test("failed email delivery retains the registration and redirects to a warning", async () => {
  const h = registrationHarness({ emailFails: true });
  await assert.rejects(h.action({}, input("GENERAL")), /redirect:\/t\/ticket-token\?email=failed$/);
  assert.ok(h.created.registration);
  assert.equal(h.sentEmails.length, 1);
});

test("does not email a ticket with an inaccessible local application URL", async () => {
  const originalUrl = process.env.NEXT_PUBLIC_APP_URL;
  try {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    const h = registrationHarness();
    await assert.rejects(h.action({}, input("GENERAL")), /redirect:\/t\/ticket-token\?email=failed$/);
    assert.ok(h.created.registration);
    assert.equal(h.sentEmails.length, 0);
  } finally {
    process.env.NEXT_PUBLIC_APP_URL = originalUrl;
  }
});

test("older forms default to General and invalid categories are rejected", async () => {
  const h = registrationHarness();
  await assert.rejects(h.action({}, input()), /redirect:\/t\/ticket-token/);
  assert.equal(h.created.registration.category, "GENERAL");
  const invalid = registrationHarness();
  assert.deepEqual(await invalid.action({}, input("NOT_A_CATEGORY")), { error: "Choose a valid category." });
  assert.equal(invalid.created.registration, undefined);
});

test("manual and public forms show optional age and gender fields", () => {
  const react = { ...React, useActionState: () => [{}, () => {}, false] };
  const publicForm = load("src/components/public-registration-form.tsx", {
    react,
    "@/app/register/[eventId]/actions": {},
    "@/components/preferences-provider": { usePreferences: () => ({ t: (text) => text }) },
    "@/lib/attendee-categories": categories,
  });
  const manualForm = load("src/components/attendee-form.tsx", {
    react,
    "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) },
    "@/app/dashboard/guestlist/actions": {},
    "@/components/preferences-provider": { usePreferences: () => ({ locale: "en" }) },
    "@/lib/localization": localization,
    "@/lib/attendee-categories": categories,
  });
  for (const html of [
    renderToStaticMarkup(React.createElement(publicForm.PublicRegistrationForm, { eventId: "event-1", questions: [] })),
    renderToStaticMarkup(React.createElement(manualForm.AttendeeForm, { eventId: "event-1", eventName: "Event" })),
  ]) {
    assert.match(html, /<input(?=[^>]*name="age")(?=[^>]*type="number")[^>]*>/);
    assert.match(html, /name="gender"/);
    assert.match(html, /value="MALE"/);
    assert.match(html, /value="FEMALE"/);
    assert.doesNotMatch(html, /name="(?:company|position)"/);
  }
});

test("both registration paths save age and gender per event without changing an existing attendee", async () => {
  for (const manual of [false, true]) {
    const h = registrationHarness({ manual, existingAttendee: true });
    const form = input("GENERAL");
    form.set("age", "29");
    form.set("gender", "FEMALE");
    await assert.rejects(h.action({}, form), /redirect:/);
    assert.equal(h.created.registration.age, 29);
    assert.equal(h.created.registration.gender, "FEMALE");
    assert.equal(h.created.attendee, undefined);
  }
});

test("both registration paths accept blank fields and reject invalid ages and genders", async () => {
  for (const manual of [false, true]) {
    const h = registrationHarness({ manual });
    await assert.rejects(h.action({}, input("GENERAL")), /redirect:/);
    assert.equal(h.created.registration.age, null);
    assert.equal(h.created.registration.gender, null);
    for (const [field, value, error] of [
      ["age", "-1", "Enter an age between 0 and 150."],
      ["age", "151", "Enter an age between 0 and 150."],
      ["age", "1.5", "Enter an age between 0 and 150."],
      ["gender", "INVALID", "Choose a valid gender."],
    ]) {
      const invalid = registrationHarness({ manual });
      const form = input("GENERAL");
      form.set(field, value);
      assert.deepEqual(await invalid.action({}, form), { error });
      assert.equal(invalid.created.registration, undefined);
    }
  }
});

test("guestlist export includes the saved details without dropping legacy columns", async () => {
  const route = load("src/app/api/guestlist/export/route.ts", {
    "@/lib/workspace": { getWorkspaceContext: async () => ({ workspace: { id: "workspace-1" } }) },
    "@/lib/prisma": {
      getPrisma: () => ({
        eventRegistration: {
          findMany: async () => [{
            attendee: { firstName: "Alex", lastName: "Guest", email: "alex@example.test", phone: null, company: "Existing company", position: "Existing position" },
            event: { name: "Event" }, category: "GENERAL", ticket: null, registeredAt: new Date("2030-01-01T00:00:00Z"),
            age: 0, gender: "MALE",
          }],
        },
      }),
    },
    "@/lib/date-range": { parseDateParam: () => undefined, exclusiveDateEnd: () => undefined },
  });
  const response = await route.GET(new Request("http://localhost/api/guestlist/export"));
  const csv = await response.text();
  assert.match(csv, /"Company","Position"/);
  assert.match(csv, /"Age","Gender"/);
  assert.match(csv, /"Existing company","Existing position"/);
  assert.match(csv, /"0","MALE"/);
});
