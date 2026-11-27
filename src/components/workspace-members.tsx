"use client";

import { useActionState } from "react";
import { useActionToastFeedback } from "@/components/toast-provider";
import { LoaderCircle, MailPlus, Trash2 } from "lucide-react";
import {
  inviteWorkspaceMemberAction,
  removeWorkspaceMemberAction,
  revokeWorkspaceInvitationAction,
  type WorkspaceInvitationState,
} from "@/app/dashboard/settings/actions";

const initialState: WorkspaceInvitationState = {};

type Member = {
  id: string;
  role: string;
  user: { id: string; name: string; email: string };
};

type Invitation = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
};

export function WorkspaceMembers({
  members,
  invitations,
  canManage,
  ownerId,
}: {
  members: Member[];
  invitations: Invitation[];
  canManage: boolean;
  ownerId: string;
}) {
  const [state, formAction, pending] = useActionState(inviteWorkspaceMemberAction, initialState);
  useActionToastFeedback(pending, state);

  if (!canManage) {
    return (
      <div className="workspace-member-list">
        {members.map((member) => (
          <div className="workspace-member-row" key={member.id}>
            <span><strong>{member.user.name}</strong><small>{member.user.email}</small></span>
            <span className="status-pill">{member.role.toLowerCase()}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="workspace-members">
      <form action={formAction} className="workspace-invite-form">
        <label className="form-field">Email<input name="email" placeholder="teammate@example.com" required type="email" /></label>
        <label className="form-field">Role<select name="role" defaultValue="VIEWER"><option value="ADMIN">Admin</option><option value="MANAGER">Manager</option><option value="CHECKIN">Check-in</option><option value="VIEWER">Viewer</option></select></label>
        <button className="button button-dark app-primary-button" disabled={pending} type="submit">
          {pending ? <LoaderCircle className="spin" size={14} /> : <MailPlus size={14} />} Invite
        </button>
      </form>
      {state.error && <p className="form-message form-error" role="alert">{state.error}</p>}

      <div className="workspace-member-list">
        {members.map((member) => (
          <div className="workspace-member-row" key={member.id}>
            <span><strong>{member.user.name}</strong><small>{member.user.email}</small></span>
            <span className="status-pill">{member.role.toLowerCase()}</span>
            {member.role !== "OWNER" && member.user.id !== ownerId && (
              <form action={removeWorkspaceMemberAction}>
                <input name="memberId" type="hidden" value={member.id} />
                <button aria-label={`Remove ${member.user.name}`} className="icon-button" type="submit"><Trash2 size={14} /></button>
              </form>
            )}
          </div>
        ))}
        {invitations.map((invitation) => (
          <div className="workspace-member-row workspace-invite-row" key={invitation.id}>
            <span><strong>{invitation.email}</strong><small>Pending · expires {new Date(invitation.expiresAt).toLocaleDateString()}</small></span>
            <span className="status-pill">{invitation.role.toLowerCase()}</span>
            <form action={revokeWorkspaceInvitationAction}>
              <input name="invitationId" type="hidden" value={invitation.id} />
              <button aria-label={`Revoke invitation for ${invitation.email}`} className="icon-button" type="submit"><Trash2 size={14} /></button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
