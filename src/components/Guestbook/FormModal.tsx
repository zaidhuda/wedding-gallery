import { useCallback, type ReactNode } from 'react';
import useRegisterHtmlElementRef from '../../hooks/useRegisterHtmlElementRef';
import useFormModal from '../../hooks/useFormModal';
import useCurrentSection from '../../hooks/useCurrentSection';

type Props = {
  children: ReactNode;
  type: 'upload' | 'edit';
  onClose: () => void;
};

const CONFIGS = {
  upload: {
    id: 'uploadModal',
    modalTitle: 'Leave a Wish',
    modalSubtitle: 'Add a photo and a message for the couple',
  },
  edit: {
    id: 'editModal',
    modalTitle: 'Edit Your Wish',
    modalSubtitle: 'Update your name or message',
  },
} as const;

export default function FormModal({ children, type, onClose }: Props) {
  const { label: eventIndicator } = useCurrentSection();
  const { id, modalTitle, modalSubtitle } = CONFIGS[type];
  const ref = useRegisterHtmlElementRef(id);
  const { closeModal } = useFormModal(id);

  const handleClose = useCallback(() => {
    closeModal();
    onClose();
  }, [closeModal, onClose]);

  return (
    <>
      <div
        ref={ref}
        className="modal-overlay"
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modalTitle"
        aria-describedby="modalSubtitle"
      >
        <div className="modal-backdrop" id="modalBackdrop"></div>
        <div className="modal-content">
          <button
            onClick={handleClose}
            className="modal-close"
            id="modalClose"
            aria-label="Close photo upload form"
          >
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          <div className="modal-header">
            <h3 className="modal-title" id="modalTitle">
              {modalTitle}
            </h3>
            <p className="modal-subtitle" id="modalSubtitle">
              {modalSubtitle}
            </p>
            <span
              className="event-indicator"
              id="eventIndicator"
              aria-live="polite"
            >
              {eventIndicator}
            </span>
          </div>
          {children}
        </div>
      </div>
    </>
  );
}
