import { Fragment } from 'react/jsx-runtime';
import type { PhotoResponse } from '../../worker/types';
import useScript from '../hooks/useScript';
import { STORED_EDIT_TOKENS } from '../hooks/useLocalStorage';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAppState } from '../hooks/useContext';
import useHasEditToken from '../hooks/useHasEditToken';

export default function PhotoEntry(photo: PhotoResponse['photos'][number]) {
  const cardRef = useRef<HTMLDivElement>(null);
  const entranceObserver = useRef<IntersectionObserver>(null);
  const { formatFilmTimestamp } = useScript();
  const { isAdmin } = useAppState();
  const [isRemoved, setIsRemoved] = useState(false);
  const hasEditToken = useHasEditToken(photo.token);

  const filmTime = useMemo(
    () => formatFilmTimestamp(photo.takenAt),
    [photo.takenAt],
  );
  const isPending = photo.isApproved === 0;

  useLayoutEffect(() => {
    if (cardRef.current) {
      entranceObserver.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              // Add visible class for fade-in + slide-up
              entry.target.classList.add('visible');
              entranceObserver.current?.unobserve(entry.target);
            }
          });
        },
        {
          threshold: 0.1,
          rootMargin: '0px 0px -50px 0px',
        },
      );

      entranceObserver.current.observe(cardRef.current);
    }

    return () => {
      entranceObserver.current?.disconnect();
    };
  }, []);

  const handleUnapprovePhoto = useCallback(async () => {
    if (isAdmin) {
      try {
        const photoId = photo.id;
        const response = await fetch('/api/admin/unapprove', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ id: photoId }),
        });

        if (response.ok && cardRef.current) {
          cardRef.current.style.transition =
            'opacity 0.3s ease, transform 0.3s ease';
          cardRef.current.style.opacity = '0';
          cardRef.current.style.transform = 'scale(0.9)';
          setTimeout(() => setIsRemoved(true), 300);
          console.log(`Photo ${photoId} unapproved`);
        } else {
          console.error('Failed to unapprove photo');
        }
      } catch (error) {
        console.error('Unapprove error:', error);
      }
    }
  }, [isAdmin, photo.id]);

  if (isRemoved) {
    return undefined;
  }

  return (
    <Fragment key={photo.id}>
      <div ref={cardRef} className="photo-card" data-photo-id={photo.id}>
        <div className="photo-item" role="listitem">
          <img
            src={photo.url}
            alt={`Wish from ${photo.name || 'Guest'}${photo.message ? ': ' + photo.message : ''}`}
            loading="lazy"
          />
          {isPending ? (
            <div
              className="reviewing-badge"
              aria-label="This photo is currently being reviewed"
            >
              Reviewing photo...
            </div>
          ) : null}
          {isAdmin ? (
            <button
              onClick={handleUnapprovePhoto}
              className="unapprove-btn"
              title="Remove from guestbook"
              aria-label={`Remove wish by ${photo.name || 'Guest'} from guestbook`}
            >
              ✕
            </button>
          ) : null}
          {hasEditToken ? (
            <button
              className="edit-btn"
              data-photo-id={photo.id}
              data-photo-url={photo.url}
              data-photo-name={(photo.name || '').replace(/"/g, '&quot;')}
              data-photo-message={(photo.message || '').replace(/"/g, '&quot;')}
              data-event-tag={photo.eventTag || ''}
              title="Edit your submission"
              aria-label="Edit your photo submission"
            >
              Edit
            </button>
          ) : null}
        </div>
        <div className="photo-caption">
          {filmTime ? (
            <span
              className="film-stamp"
              aria-label={`Photo taken at ${filmTime}`}
            >
              {filmTime}
            </span>
          ) : null}
          <p className="photo-name">{photo.name}</p>
          <p className="photo-message">
            {photo.message ? `“${photo.message}”` : null}
          </p>
        </div>
      </div>
    </Fragment>
  );
}
