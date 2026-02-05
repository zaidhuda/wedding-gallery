import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import useManagePhotoEntry from "../../hooks/useManagePhotoEntry";
import useNewPhotoId from "../../hooks/useNewPhotoId";
import { isAnonymous, storeAndGetName } from "../../utils";
import type { PhotoResponse } from "../../worker/types";
import BaseForm, { type PhotoFormValues } from "./BaseForm";
import FormModal from "./FormModal";

export default function EditFormModal({
  photo,
  closeModal,
}: {
  photo: PhotoResponse;
  closeModal: () => void;
}) {
  const editBtnRef = useRef<HTMLButtonElement>(null);
  const deleteBtnRef = useRef<HTMLButtonElement>(null);
  const { setNewPhoto } = useNewPhotoId();
  const { editPhotoEntry, removePhotoEntry } = useManagePhotoEntry();

  const form = useForm<PhotoFormValues>();

  const handleClose = useCallback(() => {
    closeModal();
  }, [closeModal]);

  const mutation = useMutation({
    mutationFn: async (data: PhotoFormValues) => {
      if (photo.name === data.name && photo.message === data.message) {
        throw new Error("No changes made");
      }

      if (editBtnRef.current) {
        editBtnRef.current.disabled = true;
        editBtnRef.current.textContent = "Saving...";
      }

      const response = await fetch("/api/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: photo.id,
          token: photo.token,
          name: data.name.trim(),
          message: data.message.trim(),
        }),
      });

      const result = await response
        .json()
        .catch(() => ({ error: "Edit failed" }));

      if (!response.ok) {
        throw new Error(result.error || "Edit failed");
      }

      return data;
    },
    onSuccess: async (data: PhotoFormValues) => {
      form.reset({
        ...data,
        name: storeAndGetName(data.name),
      });
      handleClose();

      if (photo) {
        setNewPhoto(photo.id);
        editPhotoEntry(photo.eventTag, photo.id, data);
      }
    },
    onError: (error: unknown) => {
      console.error("Edit error:", error);
      alert(
        `Unable to edit:\n\n${error instanceof Error ? error.message : "Unknown error"}`,
      );
    },
    onSettled: () => {
      if (editBtnRef.current) {
        editBtnRef.current.disabled = false;
        editBtnRef.current.textContent = "Save Changes";
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!photo) {
        throw new Error("No photo selected");
      }

      const response = await fetch("/api/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: photo.id,
          token: photo.token,
        }),
      });

      const result = await response
        .json()
        .catch(() => ({ error: "Delete failed" }));

      if (!response.ok) {
        throw new Error(result.error || "Delete failed");
      }

      return true;
    },
    onSuccess: async () => {
      handleClose();

      if (photo) {
        removePhotoEntry(photo.eventTag, photo.id);
      }
    },
    onError: (error: unknown) => {
      console.error("Delete error:", error);
      alert(
        `Unable to delete:\n\n${error instanceof Error ? error.message : "Unknown error"}`,
      );
    },
  });

  useEffect(() => {
    if (photo) {
      form.reset({
        name: isAnonymous(photo.name) ? "" : photo.name || "",
        message: photo.message || "",
        eventTag: photo.eventTag || "",
      });
    }
  }, [photo, form.reset]);

  return (
    <FormModal
      onClose={handleClose}
      modalTitle="Edit Your Wish"
      modalSubtitle="Update your name or message"
    >
      <BaseForm
        form={form}
        onSubmit={mutation.mutate}
        PhotoElement={() => (
          <div className="edit-preview-zone" id="editPreview">
            <div className="upload-preview">
              <img src={photo?.url} alt="Selection" />
            </div>
          </div>
        )}
      >
        <div className="edit-form-actions">
          <button
            ref={deleteBtnRef}
            onClick={() => deleteMutation.mutate()}
            type="button"
            className="edit-form-delete"
            id="editDeleteBtn"
            aria-label="Delete this photo"
          >
            Delete
          </button>
          <button
            ref={editBtnRef}
            type="submit"
            className="submit-btn edit-form-submit"
            id="editSubmitBtn"
            aria-label="Save changes"
          >
            Save Changes
          </button>
        </div>
      </BaseForm>
    </FormModal>
  );
}
