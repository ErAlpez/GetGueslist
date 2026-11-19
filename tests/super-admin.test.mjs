import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadSuperAdmin(session) {
  const source = fs.readFileSync(path.join(root, "src/lib/super-admin.ts"), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = { exports: {} };
  const mocks = {
    "server-only": {},
    "next/navigation": {
      notFound: () => { throw new Error("not found"); },
      redirect: (url) => { throw Object.assign(new Error("redirect"), { url }); },
    },
    "@/lib/auth": { getCurrentSession: async () => session },
  };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}

test("Super Admin requires an exact allowlisted email and verified account", async () => {
  const previous = process.env.SUPER_ADMIN_EMAILS;
  process.env.SUPER_ADMIN_EMAILS = "calperwin@gmail.com, venuguestpass@gmail.com";
  try {
    const { isSuperAdminEmail, requireSuperAdmin } = loadSuperAdmin({
      user: { id: "admin-1", email: " CALPERWIN@gmail.com ", emailVerified: true },
    });
    assert.equal(isSuperAdminEmail("calperwin@gmail.com", true), true);
    assert.equal(isSuperAdminEmail("calperwin@gmail.com", false), false);
    assert.equal(isSuperAdminEmail("other@example.com", true), false);
    assert.equal((await requireSuperAdmin()).user.id, "admin-1");
  } finally {
    if (previous === undefined) delete process.env.SUPER_ADMIN_EMAILS;
    else process.env.SUPER_ADMIN_EMAILS = previous;
  }
});

test("Super Admin access stays closed when no allowlist is configured", () => {
  const previous = process.env.SUPER_ADMIN_EMAILS;
  delete process.env.SUPER_ADMIN_EMAILS;
  try {
    const { isSuperAdminEmail } = loadSuperAdmin(null);
    assert.equal(isSuperAdminEmail("calperwin@gmail.com", true), false);
  } finally {
    if (previous !== undefined) process.env.SUPER_ADMIN_EMAILS = previous;
  }
});

test("unauthenticated Super Admin requests are redirected to login", async () => {
  const { requireSuperAdmin } = loadSuperAdmin(null);
  await assert.rejects(requireSuperAdmin(), (error) => error.url === "/login");
});
