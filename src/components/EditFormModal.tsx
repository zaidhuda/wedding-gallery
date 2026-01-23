import FormModal from './FormModal';

export default function EditFormModal() {
  return (
    <>
      <FormModal type="edit">
        <form className="modal-form" id="editForm" aria-label="Edit photo form">
          <div className="edit-preview-zone" id="editPreview">
            {/* <!-- Photo preview will be inserted here --> */}
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="editPhotoName">
              Your Name
            </label>
            <input
              type="text"
              id="editPhotoName"
              className="form-input form-input-handwriting"
              placeholder="Write your name here..."
              aria-required="true"
              maxLength={50}
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="editPhotoMessage">
              Message (Optional)
            </label>
            <textarea
              id="editPhotoMessage"
              className="form-input form-textarea form-input-handwriting"
              placeholder="A few words about this moment..."
              aria-required="false"
              maxLength={500}
            ></textarea>
          </div>
          <div className="edit-form-actions">
            <button
              type="button"
              className="edit-form-delete"
              id="editDeleteBtn"
              aria-label="Delete this photo"
            >
              Delete
            </button>
            <button
              type="submit"
              className="submit-btn edit-form-submit"
              id="editSubmitBtn"
              aria-label="Save changes"
            >
              Save Changes
            </button>
          </div>
          <p className="form-helper-text">
            You can edit or delete your entry from this device within 1 hour
            after posting.
          </p>
        </form>
      </FormModal>
    </>
  );
}
