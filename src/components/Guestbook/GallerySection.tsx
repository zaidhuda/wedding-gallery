import {
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
  useInfiniteQuery,
  useMutation,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { useParams } from "react-router";
import { useAppState } from "../../hooks/useContext";
import useCurrentSection from "../../hooks/useCurrentSection";
import useManagePhotoEntry from "../../hooks/useManagePhotoEntry";
import useRegisterHtmlElementRef from "../../hooks/useRegisterHtmlElementRef";
import useVerifyAdmin from "../../hooks/useVerifyAdmin";
import type { PhotoResponse, PhotosResponse } from "../../worker/types";
import PhotoCard from "./PhotoCard";

const PHOTOS_PER_PAGE = 12;

function LoadingState() {
  return (
    <div className="loading-state">
      <div className="loading-spinner"></div>
      <p style={{ opacity: 0.4, fontSize: "0.85rem" }}>Loading wishes...</p>
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
    <div className="empty-state">
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
      <button type="button" onClick={handleNextClick}>
        Load more
      </button>
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
  unapproveMutation,
  isLoading,
  isFetchingNextPage,
  error,
  data,
  hasNextPage,
  fetchNextPage,
}: UseInfiniteQueryResult<InfiniteData<PhotosResponse, unknown>, Error> & {
  unapproveMutation: UseMutationResult<
    PhotoResponse | undefined,
    unknown,
    PhotoResponse,
    unknown
  >;
}) {
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
        <PhotoCard
          key={photo.id}
          photo={photo}
          unapproveMutation={unapproveMutation}
        />
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
  const sectionRef = useRegisterHtmlElementRef("gallery");
  const { name, section, gallery, title, label, date } = useCurrentSection();
  const { section: sectionName } = useParams();
  const isAdmin = useVerifyAdmin();
  const { htmlElementRefMap } = useAppState();
  const { removePhotoEntry } = useManagePhotoEntry();

  const query = useInfiniteQuery({
    queryKey: ["photos", title],
    queryFn: ({ pageParam }): Promise<PhotosResponse> =>
      fetch(
        `/api/photos?eventTag=${encodeURIComponent(title)}&limit=${PHOTOS_PER_PAGE}&offset=${pageParam}`,
      ).then((res) => res.json()),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _, lastPageParam) =>
      lastPage.hasMore ? lastPage.photos.length + lastPageParam : null,
  });

  const unapproveMutation = useMutation({
    mutationFn: async (photo: PhotoResponse) => {
      if (isAdmin) {
        await fetch("/api/admin/unapprove", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id: photo.id }),
        });

        return photo;
      }
    },
    onSuccess: (photo?: PhotoResponse) => {
      if (photo) {
        removePhotoEntry(photo.eventTag, photo.id);
        console.log(`Photo ${photo.id} unapproved`);
      }
    },
    onError: (error: unknown) => {
      console.error("Failed to unapprove photo", error);
      alert(
        `Failed to unapprove photo:\n\n${error instanceof Error ? error.message : "Unknown error"}`,
      );
    },
  });

  useEffect(() => {
    if (sectionName) {
      htmlElementRefMap.current.gallery?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [sectionName, htmlElementRefMap.current.gallery?.scrollIntoView]);

  return (
    <section
      ref={sectionRef}
      className={`gallery-section section-${name}`}
      id={section}
      data-theme={name}
      data-event={title}
      aria-labelledby="section-night-title"
    >
      <div className="section-header">
        <p className="section-label">{label}</p>
        <h2 className="section-title" id="section-night-title">
          {title}
        </h2>
        <p className="section-date">{date}</p>
      </div>
      <div className="masonry-container">
        <div className="masonry-grid" id={gallery}>
          <RenderPhotos unapproveMutation={unapproveMutation} {...query} />
        </div>
      </div>
    </section>
  );
}
