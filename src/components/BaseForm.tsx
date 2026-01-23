import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

export default function BaseForm({ children }: Props) {
  return (
    <>
      <form
        className="modal-form"
        id="photoForm"
        aria-label="Photo upload form"
      >
        <div
          className="upload-zone"
          id="uploadZone"
          role="button"
          tabIndex={0}
          aria-label="Select photo to upload"
        >
          <input
            type="file"
            id="photoFile"
            accept="image/*"
            className="sr-only"
            aria-label="Photo file input"
          />
          <div id="uploadPreview">
            <svg
              className="upload-zone-icon"
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              stroke-width="1"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
            <p className="upload-zone-text">Tap to select a photo</p>
          </div>
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
          You can edit or delete your entry from this device within 1 hour after
          posting.
        </p>
      </form>
    </>
  );
}
