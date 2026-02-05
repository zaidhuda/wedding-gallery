import { lazy, Suspense, useCallback } from "react";
import { NavLink } from "react-router";
import { EVENTS } from "../../constants";
import useCanUpload from "../../hooks/useCanUpload";
import useModal from "../../hooks/useModal";
import useValidateAccess from "../../hooks/useValidateAccess";

const UploadFormModal = lazy(() => import("./UploadFormModal"));

export default function FloatingNavigation() {
  const validateAccess = useValidateAccess();
  const canUpload = useCanUpload();
  const { openModal } = useModal();

  const handleClickUpload = useCallback(async () => {
    if (await validateAccess()) {
      openModal((onClose) => (
        <Suspense fallback={null}>
          <UploadFormModal onClose={onClose} />
        </Suspense>
      ));
    }
  }, [validateAccess, openModal]);

  return (
    <nav
      className="floating-nav"
      id="floatingNav"
      aria-label="Guestbook sections navigation"
    >
      {EVENTS.map((event) => (
        <NavLink
          to={`/${event.name}`}
          key={event.name}
          className={({ isActive }) =>
            isActive ? "nav-item active" : "nav-item"
          }
          data-section={event.section}
          data-event={event.title}
          aria-label={`Navigate to ${event.title} ceremony`}
        >
          {event.title}
        </NavLink>
      ))}

      {canUpload ? (
        <button
          type="button"
          className="upload-cta"
          id="uploadCta"
          aria-label="Leave a wish - Open guestbook form"
          onClick={handleClickUpload}
        >
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" strokeLinecap="round" />
          </svg>
        </button>
      ) : null}
    </nav>
  );
}
