import FormModal from './FormModal';
import useFormModal from '../hooks/useFormModal';
import { useAppState } from '../hooks/useContext';
import { useCallback, useRef } from 'react';
import useScript from '../hooks/useScript';
import useQueryParams from '../hooks/useQueryParam';
import type { PhotoEntity } from '../../worker/types';

export default function UploadFormModal() {
  const previewRef = useRef<HTMLDivElement>(null);
  const hiddenFileRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { currentEventTag } = useAppState();
  const { open } = useFormModal('uploadModal');
  const {
    uploadPhoto,
    extractPhotoTimestamp,
    showTestModeSelector,
    validatePhotoDate,
    showRejectionPopup,
  } = useScript();
  const { mode } = useQueryParams(['mode']);

  const handleHiddenFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!fileRef.current) return;
      handleFileChange(e);
    },
    [],
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!fileRef.current) return;

      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      // Extract photo timestamp for validation
      const takenAt = await extractPhotoTimestamp(file);
      let eventTag = currentEventTag;

      // TEST MODE: Bypass date validation, show manual selector
      if (mode === 'test') {
        const selection = await showTestModeSelector();
        if (!selection) {
          // User cancelled
          (e.target as HTMLInputElement).value = '';
          return;
        }
        eventTag = selection.eventTag;
      } else {
        // PRODUCTION MODE: Smart-sort based on photo date
        const validation = validatePhotoDate(takenAt);

        if (!validation.valid || !validation.eventTag) {
          // Photo is not from wedding dates - show rejection popup
          showRejectionPopup();
          (e.target as HTMLInputElement).value = '';
          return;
        }

        eventTag = validation.eventTag;
      }

      // Open modal with the determined event
      open(eventTag);

      // Show preview (uncropped)
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (evt.target) {
          (
            document.getElementById('uploadPreview') as HTMLDivElement
          ).innerHTML = `
                <div class="upload-preview">
                    <img src="${evt.target.result}" alt="Preview">
                </div>
            `;
        }
      };
      reader.readAsDataURL(file);

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      fileRef.current.files = dataTransfer.files;
    },
    [currentEventTag, open],
  );

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const file = fileRef.current?.files?.[0];
      const name = (
        document.getElementById('photoName') as HTMLInputElement
      ).value.trim();
      const message = (
        document.getElementById('photoMessage') as HTMLInputElement
      ).value.trim();
      const eventTag = (
        document.getElementById('hiddenEventTag') as HTMLInputElement
      ).value as PhotoEntity['event_tag'];

      if (!file) {
        alert('Please select a photo');
        return;
      }
      if (!eventTag) {
        alert('Event not selected');
        return;
      }

      await uploadPhoto(file, name, message, eventTag);
    },
    [],
  );

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

      <FormModal type="upload">
        <form
          className="modal-form"
          id="photoForm"
          aria-label="Photo upload form"
          onSubmit={handleSubmit}
        >
          <div
            className="upload-zone"
            id="uploadZone"
            role="button"
            tabIndex={0}
            aria-label="Select photo to upload"
          >
            <input
              ref={fileRef}
              type="file"
              id="photoFile"
              accept="image/*"
              className="sr-only"
              aria-label="Photo file input"
              onChange={handleFileChange}
            />
            <div id="uploadPreview" ref={previewRef}></div>
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="photoName">
              Your Name
            </label>
            <input
              type="text"
              id="photoName"
              className="form-input form-input-handwriting"
              placeholder="Write your name here..."
              aria-required="true"
              maxLength={50}
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="photoMessage">
              Message (Optional)
            </label>
            <textarea
              id="photoMessage"
              className="form-input form-textarea form-input-handwriting"
              placeholder="A few words about this moment..."
              aria-required="false"
              maxLength={500}
            ></textarea>
          </div>
          <input type="hidden" id="hiddenEventTag" aria-hidden="true" />
          <button
            type="submit"
            className="submit-btn"
            id="uploadBtn"
            aria-label="Submit photo and share wish"
          >
            Post to Guestbook
          </button>
          <p className="form-helper-text">
            You can edit or delete your entry from this device within 1 hour
            after posting.
          </p>
        </form>
      </FormModal>
    </>
  );
}
