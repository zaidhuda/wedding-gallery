import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router";
import { EVENT_MAP, type EventTitle } from "../../constants";
import useCurrentSection from "../../hooks/useCurrentSection";
import useEditTokens from "../../hooks/useHasEditToken";
import { STORED_PASSWORD } from "../../hooks/useLocalStorage";
import useManagePhotoEntry from "../../hooks/useManagePhotoEntry";
import useNewPhotoId from "../../hooks/useNewPhotoId";
import useQueryParams from "../../hooks/useQueryParam";
import {
  extractPhotoTimestamp,
  generateUUID,
  getEventTag,
  resizeImage,
  storeAndGetName,
} from "../../utils";
import type { PhotoResponse } from "../../worker/types";
import type { PhotoFormValues } from "./BaseForm";
import BaseForm from "./BaseForm";
import FormModal from "./FormModal";

const GUEST_PASSWORD = import.meta.env.VITE_GUEST_PASSWORD as string;

export default function UploadFormModal({ onClose }: { onClose: () => void }) {
  const fileSelectorOpenedOnce = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { title: currentEventTag } = useCurrentSection();
  const submitBtnRef = useRef<HTMLButtonElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const { mode } = useQueryParams(["mode"]);
  const { setNewPhoto } = useNewPhotoId();
  const { addEditToken } = useEditTokens();
  const { addPhotoEntry } = useManagePhotoEntry();

  const form = useForm<PhotoFormValues>({
    defaultValues: {
      name: storeAndGetName() || "",
      message: "",
      eventTag: currentEventTag,
    },
  });

  const file = useWatch({
    control: form.control,
    name: "file",
  });

  const mutation = useMutation({
    mutationFn: async (data: PhotoFormValues) => {
      const file = data.file;
      const name = data.name.trim();
      const message = data.message.trim();
      const eventTag = data.eventTag;

      if (!file) {
        throw new Error("Please select a photo");
      }
      if (!eventTag) {
        throw new Error("No event selected");
      }

      if (submitBtnRef.current) {
        submitBtnRef.current.disabled = true;
        submitBtnRef.current.textContent = "Reading photo data...";
      }

      // Get password from localStorage (already validated before reaching here)
      let currentPassword = localStorage.getItem(STORED_PASSWORD);

      // Fallback: if password is missing, use the constant (shouldn't happen, but safety check)
      if (!currentPassword) {
        currentPassword = GUEST_PASSWORD;
        localStorage.setItem(STORED_PASSWORD, GUEST_PASSWORD);
      }

      // Extract photo timestamp from EXIF (non-blocking, runs before canvas processing)
      const takenAt = await extractPhotoTimestamp(file);

      // Resize and compress with status updates
      const { blob, format, extension, width, height } = await resizeImage(
        file,
        (status) => {
          if (submitBtnRef.current) {
            submitBtnRef.current.textContent = status;
          }
        },
      );

      if (submitBtnRef.current) {
        submitBtnRef.current.textContent = "Sharing...";
      }

      const formData = new FormData();
      formData.append("image", blob, `${generateUUID()}${extension}`);
      formData.append("name", name || "Anonymous");
      formData.append("message", message || "");
      formData.append("eventTag", eventTag);
      formData.append("pass", currentPassword);
      formData.append("format", format);
      formData.append("takenAt", takenAt);
      formData.append("width", width.toString());
      formData.append("height", height.toString());

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const result = await response
        .json()
        .catch(() => ({ error: "Upload failed" }));

      if (!response.ok) {
        throw new Error(result.error || "Upload failed");
      }

      return result.photo as PhotoResponse;
    },
    onSuccess: async (photo: PhotoResponse) => {
      form.reset({
        name: storeAndGetName(photo.name) || "",
        message: "",
        eventTag: currentEventTag,
      });
      if (photo.token) addEditToken(photo.token);
      setNewPhoto(photo.id);
      handleClose();
      addPhotoEntry(photo);
    },
    onError: (error: unknown) => {
      console.error("Upload error:", error);
      alert(
        `Unable to share:\n\n${error instanceof Error ? error.message : "Unknown error"}`,
      );
    },
    onSettled: () => {
      if (submitBtnRef.current) {
        submitBtnRef.current.disabled = false;
        submitBtnRef.current.textContent = "Post to Guestbook";
      }
    },
  });

  const handleClose = useCallback(() => {
    onClose();
    form.reset();
  }, [onClose, form.reset]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const newFile = (e.target as HTMLInputElement).files?.[0];
      if (!newFile) {
        if (!file) handleClose();
        return;
      }

      const eventTag = await getEventTag(newFile, mode, currentEventTag);
      const config = EVENT_MAP[eventTag as EventTitle];
      if (!eventTag || !config) {
        if (!file) handleClose();
        return;
      }

      await navigate(`/${config.name}`);
      setImage(URL.createObjectURL(newFile));

      form.setValue("eventTag", eventTag);
      form.setValue("file", newFile);
    },
    [file, currentEventTag, form, mode, handleClose, navigate],
  );

  const handleUploadZoneClick = useCallback(() => {
    fileRef.current?.click();
  }, []);

  useEffect(() => {
    if (!fileSelectorOpenedOnce.current) {
      fileSelectorOpenedOnce.current = true;
      handleUploadZoneClick();
    }
  }, [handleUploadZoneClick]);

  return (
    <FormModal
      hidden={!file}
      onClose={handleClose}
      modalTitle="Leave a Wish"
      modalSubtitle="Add a photo and a message for the couple"
    >
      <BaseForm
        form={form}
        PhotoElement={() => (
          <button
            type="button"
            className="upload-zone"
            id="uploadZone"
            tabIndex={0}
            onClick={handleUploadZoneClick}
          >
            <input
              {...form.register("file")}
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Photo file input"
              onChange={handleFileChange}
            />
            {image ? (
              <div className="upload-preview">
                <img src={image} alt="Preview" />
              </div>
            ) : undefined}
          </button>
        )}
        onSubmit={mutation.mutateAsync}
      >
        <button
          ref={submitBtnRef}
          type="submit"
          className="submit-btn"
          id="submitBtnRef.current"
          aria-label="Submit photo and share wish"
          disabled={mutation.isPending}
        >
          Post to Guestbook
        </button>
      </BaseForm>
    </FormModal>
  );
}
