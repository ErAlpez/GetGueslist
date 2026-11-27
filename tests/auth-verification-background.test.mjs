import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadAuth() {
  const scheduledTasks = [];
  const sentEmails = [];
  let options;
  const mocks = {
    "server-only": {},
    "@better-auth/prisma-adapter": { prismaAdapter: () => ({}) },
    "better-auth": {
      APIError: { from: () => new Error("API error") },
      betterAuth: (authOptions) => {
        options = authOptions;
        return authOptions;
      },
    },
    "better-auth/api": { createAuthMiddleware: (callback) => callback },
    "better-auth/next-js": { nextCookies: () => ({}) },
    "better-auth/plugins": { twoFactor: () => ({}) },
    "next/headers": { headers: async () => new Headers() },
    "next/server": { after: (task) => scheduledTasks.push(task) },
    "@/lib/email": { sendAuthEmail: async (email) => sentEmails.push(email) },
    "@/lib/prisma": { getPrisma: () => ({}) },
  };
  const source = fs.readFileSync(path.join(root, "src/lib/auth.ts"), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loadedModule = { exports: {} };
  const localRequire = (name) => {
    if (!Object.hasOwn(mocks, name)) throw new Error(`Unexpected dependency: ${name}`);
    return mocks[name];
  };
  const previous = new Map(
    ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL"].map((key) => [key, process.env[key]]),
  );

  try {
    process.env.BETTER_AUTH_SECRET = "test-secret-with-more-than-32-characters";
    process.env.BETTER_AUTH_URL = "https://auth.example.test";
    new Function("require", "module", "exports", output)(localRequire, loadedModule, loadedModule.exports);
    loadedModule.exports.getAuth();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  return { options, scheduledTasks, sentEmails };
}

test("signup schedules a verification email without waiting for delivery", async () => {
  const { options, scheduledTasks, sentEmails } = loadAuth();
  const { emailVerification } = options;

  assert.equal(emailVerification.sendOnSignUp, true);
  await emailVerification.sendVerificationEmail({
    user: { email: "attendee@example.test" },
    url: "https://auth.example.test/verify-email?token=test",
  });

  assert.equal(scheduledTasks.length, 1);
  assert.equal(sentEmails.length, 0);

  await scheduledTasks[0]();
  assert.deepEqual(sentEmails, [{
    to: "attendee@example.test",
    subject: "Verify your VenuGuestPass email",
    url: "https://auth.example.test/verify-email?token=test",
  }]);
});
