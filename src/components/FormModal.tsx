import { type ReactNode } from 'react';
import useRegisterHtmlElementRef from '../hooks/useRegisterHtmlElementRef';
import useFormModal from '../hooks/useFormModal';

type Props = {
  children: ReactNode;
  type: 'upload' | 'edit';
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

export default function FormModal({ children, type }: Props) {
  const { id, modalTitle, modalSubtitle } = CONFIGS[type];
  const ref = useRegisterHtmlElementRef(id);
  const { close } = useFormModal(id);

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
            onClick={close}
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
              stroke-width="1.5"
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
              Night
            </span>
          </div>
          {children}
        </div>
      </div>
    </>
  );
}
