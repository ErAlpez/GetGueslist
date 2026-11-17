"use client";

import Image from "next/image";
import { useActionState, useEffect, useState, type ChangeEvent } from "react";
import { LoaderCircle, Save, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  updateProfilePictureAction,
  type ProfilePictureState,
} from "@/app/dashboard/settings/actions";
import { usePreferences } from "@/components/preferences-provider";
import { FormSaveSuccess } from "@/components/form-save-success";
import { ConfirmButton } from "@/components/confirm-button";
import "./profile-picture-form.css";

const initialState: ProfilePictureState = {};
const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxUploadBytes = 8 * 1024 * 1024;
const maxProcessedLength = 140_000;

export function ProfilePictureForm({
  image,
  name,
}: {
  image: string | null;
  name: string;
}) {
  const { t } = usePreferences();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updateProfilePictureAction, initialState);
  const [imageData, setImageData] = useState("");
  const [clientError, setClientError] = useState("");
  const [showFeedback, setShowFeedback] = useState(false);
  const preview = imageData || (state.success === "Profile photo removed." ? null : image);

  useEffect(() => {
    if (state.success) router.refresh();
  }, [router, state.success]);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setShowFeedback(false);
    setClientError("");
    setImageData("");
    if (!acceptedImageTypes.has(file.type)) {
      setClientError(t("Choose a JPEG, PNG, or WebP image."));
      return;
    }
    if (file.size > maxUploadBytes) {
      setClientError(t("Choose an image smaller than 8 MB."));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const source = new window.Image();
    source.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (!source.naturalWidth || !source.naturalHeight) {
        setClientError(t("This image could not be processed. Try another image."));
        return;
      }
      const maxDimension = 256;
      const scale = Math.min(1, maxDimension / Math.max(source.naturalWidth, source.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        setClientError(t("This image could not be processed. Try another image."));
        return;
      }

      try {
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        let processedImage = canvas.toDataURL("image/jpeg", 0.82);
        if (processedImage.length > maxProcessedLength) {
          processedImage = canvas.toDataURL("image/jpeg", 0.65);
        }
        if (processedImage.length > maxProcessedLength) {
          setClientError(t("This image is too large after processing. Choose another image."));
          return;
        }
        setImageData(processedImage);
      } catch {
        setClientError(t("This image could not be processed. Try another image."));
      }
    };
    source.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setClientError(t("This image could not be processed. Try another image."));
    };
    source.src = objectUrl;
  }

  return (
    <form action={formAction} className="profile-picture-form" onSubmit={() => setShowFeedback(true)}>
      <div className="profile-picture-preview" aria-label={t("Profile photo preview")} role="img">
        {preview ? (
          <Image alt="" className="profile-picture-image" height={72} src={preview} unoptimized width={72} />
        ) : (
          <span aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="profile-picture-controls">
        <p>{t("Choose a photo to personalize your account. It will appear in the topbar profile menu.")}</p>
        <input name="imageData" type="hidden" value={imageData} />
        <div className="profile-picture-actions">
          <label className="button button-light profile-picture-choose">
            <input
              accept="image/jpeg,image/png,image/webp"
              className="profile-picture-file-input"
              onChange={handleFileChange}
              onClick={(event) => {
                event.currentTarget.value = "";
              }}
              type="file"
            />
            <Upload size={14} /> {t("Choose photo")}
          </label>
          <button className="button button-dark app-primary-button" disabled={!imageData || pending} type="submit">
            {pending ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}
            {t("Save photo")}
          </button>
          <ConfirmButton
            aria-label={t("Remove photo")}
            className="button button-light profile-picture-remove"
            disabled={!preview || pending}
            message="Remove this profile photo?"
            name="removeImage"
            onClick={() => setImageData("")}
            title={t("Remove photo")}
            type="submit"
            value="true"
          >
            <Trash2 aria-hidden="true" size={14} />
          </ConfirmButton>
          {showFeedback && !pending && state.success && <FormSaveSuccess message={t(state.success)} />}
        </div>
        {(clientError || state.error) && <p aria-live="polite" className="form-message form-error">{clientError || (state.error ? t(state.error) : "")}</p>}
        <small>{t("Images are resized and stored securely with your account.")}</small>
      </div>
    </form>
  );
}
