import PhotoCard from './PhotoCard';
import type { PhotoResponse, PhotosResponse } from '../worker/types';
import { useCallback, useEffect, useMemo } from 'react';
import useRegisterHtmlElementRef from '../hooks/useRegisterHtmlElementRef';
import { useParams } from 'react-router';
import { useAppState } from '../hooks/useContext';
import {
  useInfiniteQuery,
  type InfiniteData,
  type UseInfiniteQueryResult,
} from '@tanstack/react-query';
import useCurrentSection from '../hooks/useCurrentSection';

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

function LoadMore({
  hasNextPage,
  isFetchingNextPage,
  handleNextClick,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  handleNextClick: () => void;
}) {
  if (isFetchingNextPage) {
    return <LoadingState />;
  }

  if (!hasNextPage) {
    return null;
  }

  return (
    <div className="load-more">
      <button onClick={handleNextClick}>Load more</button>
    </div>
  );
}

const dedup = (arr: PhotoResponse[]) => {
  const map = new Map();
  for (const o of arr) {
    if (!map.has(o.id)) map.set(o.id, o);
  }
  return [...map.values()];
};

function RenderPhotos({
  isLoading,
  isFetchingNextPage,
  error,
  data,
  hasNextPage,
  fetchNextPage,
}: UseInfiniteQueryResult<InfiniteData<PhotosResponse, unknown>, Error>) {
  const photos = useMemo(
    () => dedup(data?.pages.flatMap((page) => page.photos) ?? []),
    [data],
  );

  const handleNextClick = useCallback(() => fetchNextPage(), [fetchNextPage]);

  if (isLoading) {
    return <LoadingState />;
  }
  if (error) {
    return <ErrorState />;
  }
  if (photos.length < 1) {
    return <EmptyState />;
  }
  return (
    <>
      {photos.map((photo) => (
        <PhotoCard key={photo.id} {...photo} />
      ))}
      <LoadMore
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        handleNextClick={handleNextClick}
      />
    </>
  );
}

export default function GallerySection() {
  const sectionRef = useRegisterHtmlElementRef('gallery');
  const { name, section, gallery, title, label, date } = useCurrentSection();
  const { section: sectionName = 'ijab' } = useParams();
  const { htmlElementRefMap } = useAppState();

  const query = useInfiniteQuery({
    queryKey: ['photos', title],
    queryFn: ({ pageParam }): Promise<PhotosResponse> =>
      fetch(
        `/api/photos?eventTag=${encodeURIComponent(title)}&limit=${PHOTOS_PER_PAGE}&offset=${pageParam}`,
      ).then((res) => res.json()),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _, lastPageParam) =>
      lastPage.hasMore ? lastPage.photos.length + lastPageParam : null,
  });

  useEffect(() => {
    htmlElementRefMap.current['gallery']?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }, [sectionName]);

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
            <RenderPhotos {...query} />
          </div>
        </div>
      </section>
    </>
  );
}
