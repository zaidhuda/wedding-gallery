import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type Props = {
  children: ReactNode;
  hidden?: boolean;
  onClose: () => void;
};

export default function Modal({ children, hidden = false, onClose }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const handleClose = useCallback(() => {
    setOpen(false);
    onClose();
  }, [onClose]);

  useLayoutEffect(() => {
    const timeout = setTimeout(() => {
      setOpen(true);
    }, 50);

    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!ref.current) return;

    if (open && !hidden) {
      ref.current.classList.add("visible");
    } else {
      ref.current.classList.remove("visible");
    }
  }, [open, hidden]);

  return (
    <div
      ref={ref}
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modalTitle"
      aria-describedby="modalSubtitle"
    >
      <div className="modal-backdrop" id="modalBackdrop"></div>
      <div className="modal-content">
        <button
          type="button"
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
        {children}
      </div>
    </div>
  );
}
