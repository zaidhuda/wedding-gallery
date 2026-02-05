import type { ReactNode } from "react";
import useCurrentSection from "../../hooks/useCurrentSection";
import Modal from "./Modal";

type Props = {
  children: ReactNode;
  modalTitle: string;
  modalSubtitle: string;
  hidden?: boolean;
  onClose: () => void;
};

export default function FormModal({
  children,
  modalTitle,
  modalSubtitle,
  hidden = false,
  onClose,
}: Props) {
  const { label: eventIndicator } = useCurrentSection();

  return (
    <Modal hidden={hidden} onClose={onClose}>
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
    </Modal>
  );
}
