import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function loadRoute(context = { membership: { role: "OWNER" } }) {
  const calls = [];
  const actions = {
    updateWorkspaceAction: async (_state, formData) => {
      calls.push(["workspace", formData.get("name")]);
      return { success: "Workspace settings saved." };
    },
    updateProfilePictureAction: async () => {
      calls.push(["profile-picture"]);
      return { success: "Profile photo updated." };
    },
    inviteWorkspaceMemberAction: async () => {
      calls.push(["invite-member"]);
      return { success: "Invitation created and sent." };
    },
    revokeWorkspaceInvitationAction: async () => {
      calls.push(["revoke-invitation"]);
    },
    removeWorkspaceMemberAction: async () => {
      calls.push(["remove-member"]);
    },
  };
  const mocks = {
    "@/app/dashboard/settings/actions": actions,
    "@/lib/workspace": {
      getWorkspaceContext: async () => context,
    },
    "@/lib/workspace-roles": {
      workspaceRoleHasPermission: (role) => role === "OWNER" || role === "ADMIN",
    },
  };
  const source = fs.readFileSync(path.join(root, "src/app/api/settings/route.ts"), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  new Function("require", "module", "exports", output)(localRequire, loaded, loaded.exports);
  return { calls, POST: loaded.exports.POST };
}

function request(operation, headers = { origin: "https://app.example", host: "app.example" }) {
  const body = new FormData();
  body.set("_operation", operation);
  body.set("name", "Updated workspace");
  return new Request("https://app.example/api/settings", { method: "POST", headers, body });
}

test("settings mutation route rejects requests from another origin", async () => {
  const { calls, POST } = loadRoute();
  const response = await POST(request("workspace", { origin: "https://attacker.example", host: "app.example" }));

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "This request was not accepted." });
  assert.deepEqual(calls, []);
});

test("settings mutation route rejects requests with a different origin scheme", async () => {
  const { calls, POST } = loadRoute();
  const response = await POST(request("workspace", { origin: "http://app.example", host: "app.example" }));

  assert.equal(response.status, 403);
  assert.deepEqual(calls, []);
});

test("settings mutations use the existing server-side action validation", async () => {
  const { calls, POST } = loadRoute();
  const response = await POST(request("workspace"));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: "Workspace settings saved." });
  assert.deepEqual(calls, [["workspace", "Updated workspace"]]);
});

test("settings mutation route dispatches every Settings action", async () => {
  const { calls, POST } = loadRoute();
  for (const [operation, success] of [
    ["profile-picture", "Profile photo updated."],
    ["invite-member", "Invitation created and sent."],
    ["revoke-invitation", "Invitation revoked."],
    ["remove-member", "Workspace member removed."],
  ]) {
    const response = await POST(request(operation));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success });
  }
  assert.deepEqual(calls, [
    ["profile-picture"],
    ["invite-member"],
    ["revoke-invitation"],
    ["remove-member"],
  ]);
});

test("member management route rejects users without the required role", async () => {
  const { calls, POST } = loadRoute({ membership: { role: "ADMIN" } });
  const response = await POST(request("remove-member"));

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Only the workspace owner can remove members." });
  assert.deepEqual(calls, []);
});
