import { getWorkspaceContext } from "@/lib/workspace";
import { workspaceRoleHasPermission } from "@/lib/workspace-roles";
import {
  inviteWorkspaceMemberAction,
  removeWorkspaceMemberAction,
  revokeWorkspaceInvitationAction,
  updateProfilePictureAction,
  updateWorkspaceAction,
} from "@/app/dashboard/settings/actions";

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const requestHost = (request.headers.get("x-forwarded-host") ?? request.headers.get("host"))
    ?.split(",")[0]
    .trim()
    .toLowerCase();
  const requestUrl = new URL(request.url);
  const protocol = (request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.slice(0, -1))
    .split(",")[0]
    .trim()
    .toLowerCase();
  if (!origin || !requestHost || !protocol) return false;

  try {
    return new URL(origin).origin.toLowerCase() === `${protocol}://${requestHost}`;
  } catch {
    return false;
  }
}

function jsonResponse(body: object, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return jsonResponse({ error: "This request was not accepted." }, 403);
  }

  const formData = await request.formData();
  const operation = formData.get("_operation");

  switch (operation) {
    case "workspace": {
      return jsonResponse(await updateWorkspaceAction({}, formData));
    }
    case "profile-picture": {
      return jsonResponse(await updateProfilePictureAction({}, formData));
    }
    case "invite-member": {
      return jsonResponse(await inviteWorkspaceMemberAction({}, formData));
    }
    case "revoke-invitation": {
      const context = await getWorkspaceContext();
      if (!context) return jsonResponse({ error: "Your session has expired. Sign in again to continue." }, 401);
      if (!workspaceRoleHasPermission(context.membership.role, "workspace.manage")) {
        return jsonResponse({ error: "Only workspace owners and admins can manage invitations." }, 403);
      }
      await revokeWorkspaceInvitationAction(formData);
      return jsonResponse({ success: "Invitation revoked." });
    }
    case "remove-member": {
      const context = await getWorkspaceContext();
      if (!context) return jsonResponse({ error: "Your session has expired. Sign in again to continue." }, 401);
      if (context.membership.role !== "OWNER") {
        return jsonResponse({ error: "Only the workspace owner can remove members." }, 403);
      }
      await removeWorkspaceMemberAction(formData);
      return jsonResponse({ success: "Workspace member removed." });
    }
    default:
      return jsonResponse({ error: "Choose a valid settings action." }, 400);
  }
}
