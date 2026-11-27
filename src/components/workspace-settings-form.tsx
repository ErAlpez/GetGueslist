"use client";

import { useEffect, useState, type FormEvent } from "react";
import { LoaderCircle, Save } from "lucide-react";
import type { WorkspaceSettingsState } from "@/app/dashboard/settings/actions";
import { usePreferences } from "@/components/preferences-provider";
import { localizeNode } from "@/lib/localization";
import { useRouter } from "next/navigation";
import { submitSettingsMutation } from "@/components/settings-mutation-request";

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
  const { locale } = usePreferences();
  const router = useRouter();
  const [state, setState] = useState<WorkspaceSettingsState>(initialState);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state.success]);

  async function saveWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("_operation", "workspace");
    setState({});
    setPending(true);
    const result = await submitSettingsMutation(formData, "Saving workspace details...", "Workspace settings saved.");
    setState(result);
    setPending(false);
  }

  return localizeNode((
    <form className="settings-form" data-toast-managed onReset={(event) => event.preventDefault()} onSubmit={saveWorkspace}>
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
          <button className="button button-dark app-primary-button" disabled={pending} type="submit">
            {pending ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />} Save changes
          </button>
        </div>
      </div>
    </form>
  ), locale);
}
