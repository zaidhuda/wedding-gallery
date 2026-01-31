import FormModal from './FormModal';
import useFormModal from '../hooks/useFormModal';
import { useAppState } from '../hooks/useContext';
import { useCallback, useRef, useState } from 'react';
import useQueryParams from '../hooks/useQueryParam';
import type { PhotoResponse } from '../worker/types';
import { useMutation } from 'react-query';
import { useForm } from 'react-hook-form';
import type { PhotoFormValues } from './BaseForm';
import BaseForm from './BaseForm';
import { STORED_PASSWORD } from '../hooks/useLocalStorage';
import useNewPhotoId from '../hooks/useNewPhotoId';
import {
  extractPhotoTimestamp,
  generateUUID,
  getEventTag,
  resizeImage,
  storeAndGetName,
} from '../utils';
import useEditTokens from '../hooks/useHasEditToken';
import useManagePhotoEntry from '../hooks/useManagePhotoEntry';

const GUEST_PASSWORD = import.meta.env.VITE_GUEST_PASSWORD as string;

export default function UploadFormModal() {
  const invalidatePhotosRef = useRef<NodeJS.Timeout>(undefined);
  const hiddenFileRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const submitBtnRef = useRef<HTMLButtonElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const { currentEventTag } = useAppState();
  const { openModal, closeModal } = useFormModal('uploadModal');
  const { mode } = useQueryParams(['mode']);
  const { setNewPhoto } = useNewPhotoId();
  const { addEditToken } = useEditTokens();
  const { addPhotoEntry } = useManagePhotoEntry();

  const form = useForm<PhotoFormValues>({
    defaultValues: {
      name: storeAndGetName() || '',
      message: '',
      eventTag: currentEventTag,
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: PhotoFormValues) => {
      const file = data.file;
      const name = data.name.trim();
      const message = data.message.trim();
      const eventTag = data.eventTag;

      if (!file) {
        throw new Error('Please select a photo');
      }
      if (!eventTag) {
        throw new Error('No event selected');
      }

      if (submitBtnRef.current) {
        submitBtnRef.current.disabled = true;
        submitBtnRef.current.textContent = 'Reading photo data...';
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
      const { blob, format, extension } = await resizeImage(file, (status) => {
        if (submitBtnRef.current) {
          submitBtnRef.current.textContent = status;
        }
      });

      if (submitBtnRef.current) {
        submitBtnRef.current.textContent = 'Sharing...';
      }

      const formData = new FormData();
      formData.append('image', blob, `${generateUUID()}${extension}`);
      formData.append('name', name || 'Anonymous');
      formData.append('message', message || '');
      formData.append('eventTag', eventTag);
      formData.append('pass', currentPassword);
      formData.append('format', format);
      formData.append('takenAt', takenAt);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const result = await response
        .json()
        .catch(() => ({ error: 'Upload failed' }));

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      return result.photo as PhotoResponse;
    },
    onSuccess: async (photo: PhotoResponse) => {
      form.reset({
        name: storeAndGetName(photo.name) || '',
        message: '',
        eventTag: currentEventTag,
      });
      if (photo.token) addEditToken(photo.token);
      setNewPhoto(photo.id);
      handleClose();

      clearTimeout(invalidatePhotosRef.current);

      addPhotoEntry(photo);
    },
    onError: (error: any) => {
      console.error('Upload error:', error);
      alert(`Unable to share:\n\n${error.message}`);
    },
    onSettled: () => {
      if (submitBtnRef.current) {
        submitBtnRef.current.disabled = false;
        submitBtnRef.current.textContent = 'Post to Guestbook';
      }
    },
  });

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!fileRef.current) return;

      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const eventTag = await getEventTag(file, mode, currentEventTag);
      if (!eventTag) return;

      // Open modal with the determined event
      openModal(eventTag);

      // Show preview (uncropped)
      setImage(URL.createObjectURL(file));

      form.setValue('eventTag', eventTag);
      form.setValue('file', file);
    },
    [currentEventTag, openModal, setImage],
  );

  const handleHiddenFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFileChange(e);
    },
    [handleFileChange],
  );

  const handleClose = useCallback(() => {
    closeModal();
    form.reset();
    if (hiddenFileRef.current) {
      hiddenFileRef.current.value = '';
    }
  }, []);

  const handleUploadZoneClick = useCallback(() => {
    hiddenFileRef.current?.click();
  }, []);

  return (
    <>
      <input
        ref={hiddenFileRef}
        type="file"
        id="hiddenFileInput"
        accept="image/*"
        className="sr-only"
        aria-label="Select photo file"
        onChange={handleHiddenFileChange}
      />

      <FormModal type="upload" onClose={handleClose}>
        <BaseForm
          form={form}
          PhotoElement={() => (
            <div
              className="upload-zone"
              id="uploadZone"
              role="button"
              tabIndex={0}
              aria-label="Select photo to upload"
              onClick={handleUploadZoneClick}
            >
              <input
                {...form.register('file')}
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
            </div>
          )}
          onSubmit={mutation.mutateAsync}
        >
          <button
            ref={submitBtnRef}
            type="submit"
            className="submit-btn"
            id="submitBtnRef.current"
            aria-label="Submit photo and share wish"
            disabled={mutation.isLoading}
          >
            Post to Guestbook
          </button>
        </BaseForm>
      </FormModal>
    </>
  );
}
