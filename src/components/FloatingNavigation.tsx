import { useCallback } from 'react';
import useValidateAccess from '../hooks/useValidateAccess';
import { EVENTS } from '../constants';
import useScrollTo from '../hooks/useScrollTo';
import useRegisterHtmlElementRef from '../hooks/useRegisterHtmlElementRef';
import { useAppState } from '../hooks/useContext';

export default function FloatingNavigation() {
  const { htmlElementRefMap } = useAppState();
  const ref = useRegisterHtmlElementRef('floating-nav');
  const validateAccess = useValidateAccess();
  const scrollToSection = useScrollTo();

  const handleClickUpload = useCallback(async () => {
    if (await validateAccess()) {
      const fileInput = htmlElementRefMap.current['hiddenFileInput'];
      fileInput?.click();
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
          <button
            onClick={() => scrollToSection(event.gallery)}
            key={event.name}
            className="nav-item"
            data-section={event.section}
            data-event={event.title}
            aria-label={`Navigate to ${event.title} ceremony`}
          >
            {event.title}
          </button>
        ))}

        {/* <!-- Upload CTA moved inside Nav --> */}
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
