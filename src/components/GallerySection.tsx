import { useQuery, useQueryClient } from 'react-query';
import PhotoCard from './PhotoCard';
import type { PhotoResponse, PhotosResponse } from '../worker/types';
import { PHOTOS_STALE_TIME, type EVENTS } from '../constants';
import { useMemo } from 'react';
import useRegisterHtmlElementRef from '../hooks/useRegisterHtmlElementRef';

type Props = (typeof EVENTS)[number];

const PHOTOS_PER_PAGE = 12;

function LoadingState() {
  return (
    <div className="loading-state">
      <div className="loading-spinner"></div>
      <p style={{ opacity: 0.4, fontSize: '0.85rem' }}>Loading wishes...</p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="empty-state" role="alert" aria-live="assertive">
      <svg
        className="empty-state-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
      <p className="empty-state-title">Unable to load</p>
      <p className="empty-state-text">Please refresh to try again</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state" role="status" aria-label="No wishes yet">
      <svg
        className="empty-state-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        aria-hidden="true"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
      </svg>
      <p className="empty-state-title">No wishes yet</p>
      <p className="empty-state-text">Be the first to leave a wish</p>
    </div>
  );
}

function RenderPhotos({
  isLoading,
  error,
  photos,
}: {
  isLoading: boolean;
  error: unknown;
  photos: PhotoResponse[] | never[];
}) {
  if (isLoading) {
    return <LoadingState />;
  }
  if (error) {
    return <ErrorState />;
  }
  if (photos.length < 1) {
    return <EmptyState />;
  }
  return photos.map((photo) => <PhotoCard key={photo.id} {...photo} />);
}

export default function GallerySection({
  name,
  section,
  gallery,
  title,
  label,
  date,
}: Props) {
  const queryClient = useQueryClient();
  const sectionRef = useRegisterHtmlElementRef(gallery);

  const { offset = 0 } = useMemo(() => {
    return (
      queryClient.getQueryData<PhotosResponse>(['photos', title]) ??
      ({} as Partial<PhotosResponse>)
    );
  }, [queryClient, title]);

  const { isLoading, error, data } = useQuery<PhotosResponse>({
    queryKey: ['photos', title],
    queryFn: () =>
      fetch(
        `/api/photos?eventTag=${encodeURIComponent(title)}&limit=${PHOTOS_PER_PAGE}&offset=${offset}`,
      ).then((res) => res.json()),
    staleTime: PHOTOS_STALE_TIME,
  });

  return (
    <>
      <section
        ref={sectionRef}
        className={`gallery-section section-${name}`}
        id={section}
        data-theme={name}
        data-event={title}
        role="region"
        aria-labelledby="section-night-title"
      >
        <div className="section-header">
          <p className="section-label">{label}</p>
          <h2 className="section-title" id="section-night-title">
            {title}
          </h2>
          <p className="section-date" aria-label={`Event date: ${date}`}>
            {date}
          </p>
        </div>
        <div className="masonry-container">
          <div
            className="masonry-grid"
            id={gallery}
            role="list"
            aria-label={`${name} ceremony wishes`}
          >
            <RenderPhotos
              isLoading={isLoading}
              error={error}
              photos={data?.photos ?? []}
            />
          </div>
        </div>
      </section>
    </>
  );
}
