"use client";

import { useActionState, useEffect, useRef } from "react";
import { Download, FileText, Image, LoaderCircle, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  deleteEventAttachmentAction,
  uploadEventAttachmentAction,
  type EventAttachmentActionState,
} from "@/app/dashboard/events/actions";
import { ConfirmButton } from "@/components/confirm-button";
import { usePreferences } from "@/components/preferences-provider";
import { maxEventAttachmentsPerEvent } from "@/lib/event-attachment";

type EventAttachmentSummary = {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  createdAt: Date;
};

type EventAttachmentRowProps = {
  attachment: EventAttachmentSummary;
  eventId: string;
};

const initialState: EventAttachmentActionState = {};

function formatFileSize(size: number, locale: string) {
  if (size >= 1024 * 1024) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(size / (1024 * 1024))} MB`;
  }
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function EventAttachmentRow({ attachment, eventId }: EventAttachmentRowProps) {
  const { locale, t } = usePreferences();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(deleteEventAttachmentAction, initialState);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(attachment.createdAt);
  const downloadUrl = `/api/events/${encodeURIComponent(eventId)}/attachments/${encodeURIComponent(attachment.id)}`;
  const FileIcon = attachment.contentType.startsWith("image/") ? Image : FileText;

  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state.success]);

  return (
    <article className="event-attachment-row">
      <span aria-hidden="true" className="event-attachment-icon"><FileIcon size={17} /></span>
      <div className="event-attachment-info">
        <strong>{attachment.fileName}</strong>
        <small>{formatFileSize(attachment.size, locale)} · {date}</small>
      </div>
      <div className="event-attachment-actions">
        <a
          aria-label={`${t("Download attachment")}: ${attachment.fileName}`}
          className="button button-light event-attachment-download"
          href={downloadUrl}
          title={t("Download attachment")}
        >
          <Download aria-hidden="true" size={14} />
        </a>
        <form action={formAction}>
          <input name="eventId" type="hidden" value={eventId} />
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
      </div>
      {state.error && <p aria-live="polite" className="form-message form-error">{t(state.error)}</p>}
    </article>
  );
}

export function EventAttachmentsManager({
  attachments,
  eventId,
}: {
  attachments: EventAttachmentSummary[];
  eventId: string;
}) {
  const { t } = usePreferences();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(uploadEventAttachmentAction, initialState);
  const atLimit = attachments.length >= maxEventAttachmentsPerEvent;

  useEffect(() => {
    if (!state.success) return;
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }, [router, state.success]);

  return (
    <section className="app-panel event-attachments-panel" id="attachments">
      <div className="panel-heading-row">
        <div><h2>{t("Event attachments")}</h2><p>{t("Upload PDFs or images for this event.")}</p></div>
      </div>
      <form action={formAction} className="event-attachment-upload">
        <input name="eventId" type="hidden" value={eventId} />
        <label className="button button-light profile-picture-choose">
          <input
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="profile-picture-file-input"
            disabled={pending || atLimit}
            name="file"
            ref={inputRef}
            required
            type="file"
          />
          <Upload aria-hidden="true" size={14} /> {t("Choose file")}
        </label>
        <button className="button button-dark app-primary-button" disabled={pending || atLimit} type="submit">
          {pending ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : <Upload aria-hidden="true" size={14} />}
          {t("Upload file")}
        </button>
        <small>{t("PDF or image · 2 MB maximum · 10 files per event.")}</small>
      </form>
      {state.error && <p aria-live="polite" className="form-message form-error">{t(state.error)}</p>}
      {state.success && <p aria-live="polite" className="event-attachment-success">{t(state.success)}</p>}
      {attachments.length ? (
        <div className="event-attachments-list">
          {attachments.map((attachment) => (
            <EventAttachmentRow attachment={attachment} eventId={eventId} key={attachment.id} />
          ))}
        </div>
      ) : (
        <p className="event-attachments-empty">{t("No attachments uploaded yet.")}</p>
      )}
    </section>
  );
}
