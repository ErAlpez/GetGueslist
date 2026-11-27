"use client";

import Image from "next/image";
import { useActionState, useEffect, useRef, useState, type ChangeEvent } from "react";
import { useActionToastFeedback } from "@/components/toast-provider";
import { ImagePlus, LoaderCircle, Save, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { saveEventLogoAction, type EventLogoState } from "@/app/dashboard/events/actions";
import { usePreferences } from "@/components/preferences-provider";
import { ConfirmButton } from "@/components/confirm-button";
import { eventLogoInputPrefix, maxEventLogoDataLength } from "@/lib/event-logo";

const initialState: EventLogoState = {};
const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const maxUploadBytes = 8 * 1024 * 1024;

export function EventLogoForm({ eventId, logo }: { eventId: string; logo: string | null }) {
  const { t } = usePreferences();
  const router = useRouter();
  const [state, dispatchFormAction, pending] = useActionState(saveEventLogoAction, initialState);
  useActionToastFeedback(pending, state);
  const [imageData, setImageData] = useState("");
  const [processing, setProcessing] = useState(false);
  const [clientError, setClientError] = useState("");
  const requestId = useRef(0);
  const previewObjectUrl = useRef<string | null>(null);
  const [submittedImageData, setSubmittedImageData] = useState("");

  function formAction(formData: FormData) {
    setSubmittedImageData(String(formData.get("imageData") ?? ""));
    dispatchFormAction(formData);
  }

  useEffect(() => {
    if (!state.success) return;
    router.refresh();
  }, [router, state]);

  useEffect(() => () => {
    requestId.current += 1;
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
  }, []);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const currentRequest = ++requestId.current;
    if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
    previewObjectUrl.current = null;
    setImageData("");
    setClientError("");
    if (!acceptedTypes.has(file.type)) {
      setClientError(t("Choose a JPEG, PNG, WebP, or AVIF image."));
      setProcessing(false);
      return;
    }
    if (file.size > maxUploadBytes) {
      setClientError(t("Choose an image smaller than 8 MB."));
      setProcessing(false);
      return;
    }

    setProcessing(true);
    const objectUrl = URL.createObjectURL(file);
    previewObjectUrl.current = objectUrl;
    const releaseObjectUrl = () => {
      URL.revokeObjectURL(objectUrl);
      if (previewObjectUrl.current === objectUrl) previewObjectUrl.current = null;
    };
    const source = new window.Image();
    source.onload = () => {
      releaseObjectUrl();
      if (currentRequest !== requestId.current) return;
      const fail = () => {
        setClientError(t("This image could not be processed. Try another image."));
        setProcessing(false);
      };
      if (!source.naturalWidth || !source.naturalHeight) return fail();
      const scale = Math.min(1, 512 / Math.max(source.naturalWidth, source.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) return fail();

      try {
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        let processed = canvas.toDataURL("image/webp", 0.85);
        if (!processed.startsWith(eventLogoInputPrefix)) return fail();
        if (processed.length > maxEventLogoDataLength) processed = canvas.toDataURL("image/webp", 0.65);
        if (processed.length > maxEventLogoDataLength) {
          setClientError(t("This image is too large after processing. Choose another image."));
        } else {
          setImageData(processed);
        }
        setProcessing(false);
      } catch {
        fail();
      }
    };
    source.onerror = () => {
      releaseObjectUrl();
      if (currentRequest !== requestId.current) return;
      setClientError(t("This image could not be processed. Try another image."));
      setProcessing(false);
    };
    source.src = objectUrl;
  }

  const savedLogo = state.logo !== undefined ? state.logo : logo;
  const visibleImageData = state.success && submittedImageData === imageData ? "" : imageData;
  const preview = visibleImageData || savedLogo;
  return (
    <form action={formAction} className="event-logo-form">
      <div className="event-logo-preview" role="img" aria-label={t("Event logo preview")}>
        {preview ? <Image alt="" height={80} src={preview} unoptimized width={120} /> : <ImagePlus aria-hidden="true" size={24} />}
      </div>
      <div className="event-logo-content">
        <strong>{t("Event logo")}</strong>
        <p>{t("Display your event logo on the public registration form.")}</p>
        <input name="eventId" type="hidden" value={eventId} />
        <input name="imageData" type="hidden" value={visibleImageData} />
        <div className="event-logo-actions">
          <label className="button button-light profile-picture-choose">
            <input accept="image/jpeg,image/png,image/webp,image/avif" className="profile-picture-file-input" disabled={pending}
              onChange={handleFileChange} onClick={(event) => { event.currentTarget.value = ""; }} type="file" />
            <Upload aria-hidden="true" size={14} /> {t("Choose logo")}
          </label>
          <button className="button button-dark app-primary-button" disabled={!visibleImageData || visibleImageData === savedLogo || processing || pending} type="submit">
            {pending ? <LoaderCircle aria-hidden="true" className="spin" size={14} /> : <Save aria-hidden="true" size={14} />} {t("Save logo")}
          </button>
          <ConfirmButton aria-label={t("Remove logo")} className="button button-light event-logo-remove"
            disabled={!savedLogo || processing || pending} title={t("Remove logo")}
            message="Remove this event logo?"
            name="removeLogo" onClick={() => { setImageData(""); setClientError(""); }} type="submit" value="true">
            <Trash2 aria-hidden="true" size={14} />
          </ConfirmButton>
        </div>
        {processing && <p className="event-logo-hint" role="status">{t("Processing image...")}</p>}
        {(clientError || (!pending && state.error)) && <p aria-live="polite" className="form-message form-error">{clientError || (state.error ? t(state.error) : "")}</p>}
        <small>{t("JPEG, PNG, WebP or AVIF, up to 8 MB.")}</small>
      </div>
    </form>
  );
}
