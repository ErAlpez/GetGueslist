"use client";

import { useActionState, useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { updateWorkspaceAction, type WorkspaceSettingsState } from "@/app/dashboard/settings/actions";
import { usePreferences } from "@/components/preferences-provider";
import { FormSaveSuccess } from "@/components/form-save-success";
import { localizeNode } from "@/lib/localization";

const initialState: WorkspaceSettingsState = {};

export function WorkspaceSettingsForm({
  workspace,
}: {
  workspace: {
    name: string;
    contactEmail: string | null;
    contactPhone: string | null;
    organizationType: string | null;
    address: string | null;
    timezone: string;
  };
}) {
  const { locale, t } = usePreferences();
  const [state, formAction, pending] = useActionState(updateWorkspaceAction, initialState);
  const [edited, setEdited] = useState(false);

  // React resets uncontrolled forms after actions, discarding saved and in-flight edits.
  return localizeNode((
    <form action={formAction} className="settings-form" onChange={() => setEdited(true)} onReset={(event) => event.preventDefault()} onSubmit={() => setEdited(false)}>
      {state.error && <p aria-live="polite" className="form-message form-error">{state.error}</p>}
      <label className="form-field">Workspace name <input defaultValue={workspace.name} maxLength={100} name="name" required /></label>
      <div className="form-grid">
        <label className="form-field">Contact email <input defaultValue={workspace.contactEmail ?? ""} name="contactEmail" type="email" /></label>
        <label className="form-field">Contact phone <input defaultValue={workspace.contactPhone ?? ""} name="contactPhone" type="tel" /></label>
        <label className="form-field">Organization type <input defaultValue={workspace.organizationType ?? ""} name="organizationType" placeholder="e.g. Community, company" /></label>
        <label className="form-field">Timezone <select defaultValue={workspace.timezone} name="timezone"><option value="Asia/Manila">Asia/Manila (PHT)</option><option value="UTC">UTC</option><option value="America/Los_Angeles">America/Los_Angeles</option><option value="America/New_York">America/New_York</option><option value="Europe/London">Europe/London</option><option value="Asia/Singapore">Asia/Singapore</option></select></label>
      </div>
      <label className="form-field">Address <textarea defaultValue={workspace.address ?? ""} name="address" rows={3} /></label>
      <div className="settings-form-footer">
        <span>Workspace members can be invited and managed from the section below.</span>
        <div className="form-save-actions">
          {state.success && !edited && !pending && <FormSaveSuccess message={t(state.success)} />}
          <button className="button button-dark app-primary-button" disabled={pending} type="submit">
            {pending ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />} Save changes
          </button>
        </div>
      </div>
    </form>
  ), locale);
}
