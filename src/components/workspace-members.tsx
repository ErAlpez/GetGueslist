"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, MailPlus, Trash2 } from "lucide-react";
import type { WorkspaceInvitationState } from "@/app/dashboard/settings/actions";
import { submitSettingsMutation } from "@/components/settings-mutation-request";
import { useRouter } from "next/navigation";

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
  const router = useRouter();
  const [state, setState] = useState<WorkspaceInvitationState>(initialState);
  const [pendingAction, setPendingAction] = useState("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  async function submitMutation(
    event: FormEvent<HTMLFormElement>,
    operation: string,
    actionKey: string,
    loadingMessage: string,
    successMessage: string,
  ) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("_operation", operation);
    if (mounted.current) {
      setPendingAction(actionKey);
      if (operation === "invite-member") setState({});
    }

    const result = await submitSettingsMutation(formData, loadingMessage, successMessage);
    if (!mounted.current) return;
    if (operation === "invite-member") setState(result);
    setPendingAction("");
    if (result.success) router.refresh();
  }

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
      <form
        className="workspace-invite-form"
        data-toast-managed
        onSubmit={(event) => submitMutation(event, "invite-member", "invite", "Sending workspace invitation...", "Invitation created and sent.")}
      >
        <label className="form-field">Email<input name="email" placeholder="teammate@example.com" required type="email" /></label>
        <label className="form-field">Role<select name="role" defaultValue="VIEWER"><option value="ADMIN">Admin</option><option value="MANAGER">Manager</option><option value="CHECKIN">Check-in</option><option value="VIEWER">Viewer</option></select></label>
        <button className="button button-dark app-primary-button" disabled={pendingAction !== ""} type="submit">
          {pendingAction === "invite" ? <LoaderCircle className="spin" size={14} /> : <MailPlus size={14} />} Invite
        </button>
      </form>
      {state.error && <p className="form-message form-error" role="alert">{state.error}</p>}

      <div className="workspace-member-list">
        {members.map((member) => (
          <div className="workspace-member-row" key={member.id}>
            <span><strong>{member.user.name}</strong><small>{member.user.email}</small></span>
            <span className="status-pill">{member.role.toLowerCase()}</span>
            {member.role !== "OWNER" && member.user.id !== ownerId && (
              <form
                data-toast-managed
                onSubmit={(event) => submitMutation(event, "remove-member", `member:${member.id}`, "Removing workspace member...", "Workspace member removed.")}
              >
                <input name="memberId" type="hidden" value={member.id} />
                <button aria-label={`Remove ${member.user.name}`} className="icon-button" disabled={pendingAction !== ""} type="submit">
                  {pendingAction === `member:${member.id}` ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />}
                </button>
              </form>
            )}
          </div>
        ))}
        {invitations.map((invitation) => (
          <div className="workspace-member-row workspace-invite-row" key={invitation.id}>
            <span><strong>{invitation.email}</strong><small>Pending · expires {new Date(invitation.expiresAt).toLocaleDateString()}</small></span>
            <span className="status-pill">{invitation.role.toLowerCase()}</span>
            <form
              data-toast-managed
              onSubmit={(event) => submitMutation(event, "revoke-invitation", `invitation:${invitation.id}`, "Revoking invitation...", "Invitation revoked.")}
            >
              <input name="invitationId" type="hidden" value={invitation.id} />
              <button aria-label={`Revoke invitation for ${invitation.email}`} className="icon-button" disabled={pendingAction !== ""} type="submit">
                {pendingAction === `invitation:${invitation.id}` ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />}
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
