import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadTypeScript(file, mocks = {}) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
  return loaded.exports;
}

function harness() {
  const calls = { updates: [], conversions: [] };
  const actions = loadTypeScript("src/app/dashboard/settings/actions.ts", {
    "next/cache": { revalidatePath: () => {} },
    "next/navigation": { redirect: () => { throw new Error("redirect"); } },
    "@/lib/prisma": {
      getPrisma: () => ({ user: { update: async (args) => calls.updates.push(args) } }),
    },
    "@/lib/workspace": {
      getWorkspaceContext: async () => ({ user: { id: "user-1" }, membership: { role: "ADMIN" } }),
    },
    "@/lib/workspace-roles": { workspaceRoleHasPermission: () => true },
    "@/lib/plan-features": { workspaceHasFeature: () => true },
    "@/lib/image-optimization": {
      convertImageToAvif: async (...args) => {
        calls.conversions.push(args);
        return Buffer.from("encoded-avif");
      },
    },
  });
  return {
    calls,
    save: (imageData) => {
      const formData = new FormData();
      formData.set("imageData", imageData);
      return actions.updateProfilePictureAction({}, formData);
    },
  };
}

test("stores profile photos as AVIF after server-side conversion", async () => {
  const { calls, save } = harness();
  const jpeg = Buffer.from([0xff, 0xd8, 0x00, 0xff, 0xd9]);
  const result = await save(`data:image/jpeg;base64,${jpeg.toString("base64")}`);

  assert.equal(result.success, "Profile photo updated.");
  assert.equal(calls.updates[0].data.image, `data:image/avif;base64,${Buffer.from("encoded-avif").toString("base64")}`);
  assert.equal(calls.conversions.length, 1);
});

test("does not save malformed image data", async () => {
  const { calls, save } = harness();
  const result = await save("data:image/jpeg;base64,SGVsbG8=");

  assert.ok(result.error);
  assert.equal(calls.updates.length, 0);
  assert.equal(calls.conversions.length, 0);
});
