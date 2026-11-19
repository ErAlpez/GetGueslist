"use client";

import { useActionState, useEffect, useRef } from "react";
import { Download, FileText, Image, LoaderCircle, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  deleteEventAttachmentAction,
  type EventAttachmentActionState,
} from "@/app/dashboard/events/actions";
import {
  deleteWorkspaceFileAction,
  uploadWorkspaceFileAction,
  type WorkspaceFileActionState,
} from "@/app/dashboard/files/actions";
import { ConfirmButton } from "@/components/confirm-button";
import { usePreferences } from "@/components/preferences-provider";

type FileSummary = {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  createdAt: Date;
};

type EventAttachmentSummary = FileSummary & {
  eventId: string;
  eventName: string;
};

const initialState: WorkspaceFileActionState = {};
const initialAttachmentState: EventAttachmentActionState = {};

function formatFileSize(size: number, locale: string) {
  if (size >= 1024 * 1024) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(size / (1024 * 1024))} MB`;
  }
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function WorkspaceFileRow({ file, canManage }: { file: FileSummary; canManage: boolean }) {
  const { locale, t } = usePreferences();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(deleteWorkspaceFileAction, initialState);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(file.createdAt);
  const FileIcon = file.contentType.startsWith("image/") ? Image : FileText;

  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state.success]);

  return (
    <article className="event-attachment-row">
      <span aria-hidden="true" className="event-attachment-icon"><FileIcon size={17} /></span>
      <div className="event-attachment-info">
        <strong>{file.fileName}</strong>
        <small>{t("Workspace file")} · {formatFileSize(file.size, locale)} · {date}</small>
      </div>
      <div className="event-attachment-actions">
        <a
          aria-label={`${t("Download file")}: ${file.fileName}`}
          className="button button-light event-attachment-download"
          href={`/api/workspace/files/${encodeURIComponent(file.id)}`}
          title={t("Download file")}
        >
          <Download aria-hidden="true" size={14} />
        </a>
        {canManage && (
          <form action={formAction}>
            <input name="fileId" type="hidden" value={file.id} />
            <ConfirmButton
              aria-label={t("Delete file")}
              className="button button-light event-attachment-delete"
              disabled={pending}
              message="Delete this file?"
              title={t("Delete file")}
              type="submit"
            >
              {pending ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : <Trash2 aria-hidden="true" size={14} />}
            </ConfirmButton>
          </form>
        )}
      </div>
      {state.error && <p aria-live="polite" className="form-message form-error">{t(state.error)}</p>}
    </article>
  );
}

function EventAttachmentRow({ attachment, canManage }: { attachment: EventAttachmentSummary; canManage: boolean }) {
  const { locale, t } = usePreferences();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(deleteEventAttachmentAction, initialAttachmentState);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(attachment.createdAt);
  const FileIcon = attachment.contentType.startsWith("image/") ? Image : FileText;

  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state.success]);

  return (
    <article className="event-attachment-row">
      <span aria-hidden="true" className="event-attachment-icon"><FileIcon size={17} /></span>
      <div className="event-attachment-info">
        <strong>{attachment.fileName}</strong>
        <small>{attachment.eventName} · {formatFileSize(attachment.size, locale)} · {date}</small>
      </div>
      <div className="event-attachment-actions">
        <a
          aria-label={`${t("Download attachment")}: ${attachment.fileName}`}
          className="button button-light event-attachment-download"
          href={`/api/events/${encodeURIComponent(attachment.eventId)}/attachments/${encodeURIComponent(attachment.id)}`}
          title={t("Download attachment")}
        >
          <Download aria-hidden="true" size={14} />
        </a>
        {canManage && (
          <form action={formAction}>
            <input name="eventId" type="hidden" value={attachment.eventId} />
            <input name="attachmentId" type="hidden" value={attachment.id} />
            <ConfirmButton
              aria-label={t("Delete attachment")}
              className="button button-light event-attachment-delete"
              disabled={pending}
              message="Delete this file?"
              title={t("Delete attachment")}
              type="submit"
            >
              {pending ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : <Trash2 aria-hidden="true" size={14} />}
            </ConfirmButton>
          </form>
        )}
      </div>
      {state.error && <p aria-live="polite" className="form-message form-error">{t(state.error)}</p>}
    </article>
  );
}

export function WorkspaceFileLibrary({
  files,
  attachments,
  canManage,
}: {
  files: FileSummary[];
  attachments: EventAttachmentSummary[];
  canManage: boolean;
}) {
  const { t } = usePreferences();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(uploadWorkspaceFileAction, initialState);

  useEffect(() => {
    if (!state.success) return;
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }, [router, state.success]);

  const hasFiles = files.length > 0 || attachments.length > 0;
  const rows = [
    ...files.map((file) => ({ type: "workspace" as const, file })),
    ...attachments.map((file) => ({ type: "event" as const, file })),
  ].sort((a, b) => b.file.createdAt.getTime() - a.file.createdAt.getTime());

  return (
    <section className="app-panel event-attachments-panel">
      <div className="panel-heading-row">
        <div>
          <h2>{t("Shared files")}</h2>
          <p>{t(canManage
            ? "Shared files and event attachments are visible to workspace members."
            : "View shared files and event attachments. Workspace managers control uploads and changes.")}</p>
        </div>
      </div>
      {canManage && <form action={formAction} className="event-attachment-upload">
        <label className="button button-light profile-picture-choose">
          <input
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="profile-picture-file-input"
            disabled={pending}
            name="file"
            ref={inputRef}
            required
            type="file"
          />
          <Upload aria-hidden="true" size={14} /> {t("Choose file")}
        </label>
        <button className="button button-dark app-primary-button" disabled={pending} type="submit">
          {pending ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : <Upload aria-hidden="true" size={14} />}
          {t("Upload file")}
        </button>
        <small>{t("PDF or image · 2 MB maximum · up to 100 shared files.")}</small>
      </form>}
      {canManage && state.error && <p aria-live="polite" className="form-message form-error">{t(state.error)}</p>}
      {canManage && state.success && <p aria-live="polite" className="event-attachment-success">{t(state.success)}</p>}
      {hasFiles ? (
        <div className="event-attachments-list">
          {rows.map((row) => row.type === "workspace"
            ? <WorkspaceFileRow canManage={canManage} file={row.file} key={`workspace-${row.file.id}`} />
            : <EventAttachmentRow attachment={row.file} canManage={canManage} key={`event-${row.file.id}`} />)}
        </div>
      ) : (
        <p className="event-attachments-empty">{t("No files uploaded yet.")}</p>
      )}
    </section>
  );
}
