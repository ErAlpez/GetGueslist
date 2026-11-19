import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = fs.readFileSync(path.join(root, "src/lib/guest-registration.ts"), "utf8");
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function loadGuestRegistration(transaction) {
  const loaded = { exports: {} };
  new Function("require", "module", "exports", output)(
    (name) => {
      if (name === "server-only") return {};
      if (name === "@/lib/prisma") {
        return { getPrisma: () => ({ $transaction: (callback) => callback(transaction) }) };
      }
      if (name === "@/lib/tickets") {
        return { createTicketToken: (id) => `${id}.token`, hashTicketToken: (token) => token };
      }
      if (name === "@/lib/attendee-categories") return { attendeeCategories: ["GENERAL", "WALK_IN"] };
      if (name === "@/lib/registration-details") {
        return {
          registrationAge: require("zod").z.string().transform((value) => value === "" ? null : Number(value)),
          registrationGender: require("zod").z.string().transform((value) => value || null),
        };
      }
      return require(name);
    },
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

const input = {
  eventId: "event-1",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phone: "",
  age: null,
  gender: null,
  category: "GENERAL",
};

test("offline registration sync is idempotent for a previously committed queue ID", async () => {
  let created = false;
  const transaction = {
    eventRegistration: {
      findUnique: async ({ where }) => where.offlineSyncId === "sync-1"
        ? { eventId: "event-1", ticket: { id: "ticket-1" } }
        : null,
      create: async () => { created = true; },
    },
  };
  const { createGuestRegistration } = loadGuestRegistration(transaction);

  assert.deepEqual(
    await createGuestRegistration(input, "workspace-1", "user-1", "sync-1"),
    { ticketId: "ticket-1", alreadyProcessed: true },
  );
  assert.equal(created, false);
});

test("an offline queue ID cannot be replayed against a different event", async () => {
  const transaction = {
    eventRegistration: {
      findUnique: async () => ({ eventId: "other-event", ticket: { id: "ticket-1" } }),
    },
  };
  const { createGuestRegistration } = loadGuestRegistration(transaction);
  assert.deepEqual(
    await createGuestRegistration(input, "workspace-1", "user-1", "sync-1"),
    { error: "This offline change has already been used." },
  );
});

test("only event managers can register guests through online or offline workflows", () => {
  const { rolesAllowedToRegister } = loadGuestRegistration({});
  assert.deepEqual([...rolesAllowedToRegister].sort(), ["ADMIN", "MANAGER", "OWNER"]);
});
