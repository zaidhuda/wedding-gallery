import { useCallback } from 'react';
import useValidateAccess from '../hooks/useValidateAccess';
import { EVENTS } from '../constants';
import useRegisterHtmlElementRef from '../hooks/useRegisterHtmlElementRef';
import { useAppState } from '../hooks/useContext';
import { NavLink } from 'react-router';

export default function FloatingNavigation() {
  const { htmlElementRefMap } = useAppState();
  const ref = useRegisterHtmlElementRef('floating-nav');
  const validateAccess = useValidateAccess();

  const handleClickUpload = useCallback(async () => {
    if (await validateAccess()) {
      htmlElementRefMap.current['file-input']?.click();
    }
  }, [validateAccess]);

  return (
    <>
      <nav
        ref={ref}
        className="floating-nav"
        id="floatingNav"
        role="navigation"
        aria-label="Guestbook sections navigation"
      >
        {EVENTS.map((event) => (
          <NavLink
            to={`/${event.name}`}
            key={event.name}
            className={({ isActive }) =>
              isActive ? 'nav-item active' : 'nav-item'
            }
            data-section={event.section}
            data-event={event.title}
            aria-label={`Navigate to ${event.title} ceremony`}
          >
            {event.title}
          </NavLink>
        ))}

        <button
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
      </nav>
    </>
  );
}
