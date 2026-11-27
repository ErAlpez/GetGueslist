"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { LoaderCircle, Save, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ProfilePictureState } from "@/app/dashboard/settings/actions";
import { usePreferences } from "@/components/preferences-provider";
import { ConfirmButton } from "@/components/confirm-button";
import { submitSettingsMutation } from "@/components/settings-mutation-request";
import "./profile-picture-form.css";

const initialState: ProfilePictureState = {};
const acceptedImageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
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
  const [state, setState] = useState<ProfilePictureState>(initialState);
  const [pending, setPending] = useState(false);
  const [imageData, setImageData] = useState("");
  const [clientError, setClientError] = useState("");
  const requestId = useRef(0);
  const previewObjectUrl = useRef<string | null>(null);
  const [submittedImageData, setSubmittedImageData] = useState("");
  const visibleImageData = state.success && submittedImageData === imageData ? "" : imageData;
  const preview = visibleImageData || (state.success === "Profile photo removed." ? null : image);

  async function saveProfilePicture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    if (submitter instanceof HTMLButtonElement && submitter.name) {
      formData.set(submitter.name, submitter.value);
    }
    formData.set("_operation", "profile-picture");

    setSubmittedImageData(String(formData.get("imageData") ?? ""));
    setState({});
    setPending(true);
    const result = await submitSettingsMutation(
      formData,
      "Saving profile photo...",
      formData.get("removeImage") === "true" ? "Profile photo removed." : "Profile photo updated.",
    );
    setState(result);
    setPending(false);
  }

  useEffect(() => {
    if (!state.success) return;
    router.refresh();
  }, [router, state.success]);

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
    setClientError("");
    setImageData("");
    if (!acceptedImageTypes.has(file.type)) {
      setClientError(t("Choose a JPEG, PNG, WebP, or AVIF image."));
      return;
    }
    if (file.size > maxUploadBytes) {
      setClientError(t("Choose an image smaller than 8 MB."));
      return;
    }

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
      releaseObjectUrl();
      if (currentRequest !== requestId.current) return;
      setClientError(t("This image could not be processed. Try another image."));
    };
    source.src = objectUrl;
  }

  return (
    <form className="profile-picture-form" data-toast-managed onSubmit={saveProfilePicture}>
      <div className="profile-picture-preview" aria-label={t("Profile photo preview")} role="img">
        {preview ? (
          <Image alt="" className="profile-picture-image" height={72} src={preview} unoptimized width={72} />
        ) : (
          <span aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="profile-picture-controls">
        <p>{t("Choose a photo to personalize your account. It will appear in the topbar profile menu.")}</p>
        <input name="imageData" type="hidden" value={visibleImageData} />
        <div className="profile-picture-actions">
          <label className="button button-light profile-picture-choose">
            <input
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="profile-picture-file-input"
              onChange={handleFileChange}
              onClick={(event) => {
                event.currentTarget.value = "";
              }}
              type="file"
            />
            <Upload size={14} /> {t("Choose photo")}
          </label>
          <button className="button button-dark app-primary-button" disabled={!visibleImageData || pending} type="submit">
            {pending ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}
            {t("Save photo")}
          </button>
          <ConfirmButton
            aria-label={t("Remove photo")}
            className="button button-light profile-picture-remove"
            disabled={!preview || pending}
            message="Remove this profile photo?"
            name="removeImage"
            onClick={() => {
              requestId.current += 1;
              if (previewObjectUrl.current) URL.revokeObjectURL(previewObjectUrl.current);
              previewObjectUrl.current = null;
              setImageData("");
            }}
            title={t("Remove photo")}
            type="submit"
            value="true"
          >
            <Trash2 aria-hidden="true" size={14} />
          </ConfirmButton>
        </div>
        {(clientError || state.error) && <p aria-live="polite" className="form-message form-error">{clientError || (state.error ? t(state.error) : "")}</p>}
        <small>{t("Images are resized and stored securely with your account.")}</small>
      </div>
    </form>
  );
}
