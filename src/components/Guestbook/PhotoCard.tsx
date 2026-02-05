import type { UseMutationResult } from "@tanstack/react-query";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import useEditTokens from "../../hooks/useHasEditToken";
import useModal from "../../hooks/useModal";
import useNewPhotoId from "../../hooks/useNewPhotoId";
import useVerifyAdmin from "../../hooks/useVerifyAdmin";
import type { PhotoResponse } from "../../worker/types";

const EditFormModal = lazy(() => import("./EditFormModal"));

function formatTimeStamp(isoString: string) {
  if (!isoString) return null;
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return null;

    return date.toLocaleTimeString("en-MS", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return null;
  }
}

export default function PhotoCard({
  unapproveMutation,
  photo,
}: {
  photo: PhotoResponse & { deletedAt?: Date };
  unapproveMutation: UseMutationResult<
    PhotoResponse | undefined,
    unknown,
    PhotoResponse,
    unknown
  >;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const entranceObserver = useRef<IntersectionObserver>(null);
  const isAdmin = useVerifyAdmin();
  const { hasEditToken } = useEditTokens();
  const { openModal } = useModal();
  const { isNewPhoto, setNewPhoto } = useNewPhotoId();

  const canEdit = useMemo(() => {
    return (
      hasEditToken(photo.token) &&
      new Date(photo.timestamp).getTime() + 1000 * 60 * 60 > Date.now()
    );
  }, [hasEditToken, photo.token, photo.timestamp]);

  const filmTime = useMemo(
    () => formatTimeStamp(photo.takenAt),
    [photo.takenAt],
  );
  const isPending = photo.isApproved === 0;

  const handleUnapproveClick = useCallback(() => {
    unapproveMutation.mutate(photo);
  }, [unapproveMutation, photo]);

  const handleEditClick = useCallback(async () => {
    openModal((closeModal) => (
      <Suspense fallback={null}>
        <EditFormModal photo={photo} closeModal={closeModal} />
      </Suspense>
    ));
  }, [openModal, photo]);

  useEffect(() => {
    if (cardRef.current) {
      if (isNewPhoto(photo.id)) {
        cardRef.current.classList.add("visible", "new-entry-highlight");
        cardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        setNewPhoto();
      }
      if (photo.deletedAt) {
        cardRef.current.style.transition =
          "opacity 0.3s ease, transform 0.3s ease";
        cardRef.current.style.opacity = "0";
        cardRef.current.style.transform = "scale(0.9)";
      }
    }
  }, [photo, isNewPhoto, setNewPhoto]);

  useLayoutEffect(() => {
    if (cardRef.current) {
      entranceObserver.current?.disconnect();
      entranceObserver.current = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              // Add visible class for fade-in + slide-up
              entry.target.classList.add("visible");
              entranceObserver.current?.unobserve(entry.target);
            }
          });
        },
        {
          threshold: 0.1,
          rootMargin: "0px 0px -50px 0px",
        },
      );

      entranceObserver.current.observe(cardRef.current);
    }

    return () => {
      entranceObserver.current?.disconnect();
    };
  }, []);

  return (
    <div ref={cardRef} className="photo-card" data-photo-id={photo.id}>
      <div className="photo-item">
        <img
          src={photo.url}
          alt={`Wish from ${photo.name || "Guest"}${photo.message ? `: ${photo.message}` : ""}`}
          loading="lazy"
          width={photo.width}
          height={photo.height}
          style={{
            aspectRatio:
              photo.width && photo.height
                ? `${photo.width} / ${photo.height}`
                : undefined,
          }}
        />
        {isPending ? (
          <div className="reviewing-badge">Reviewing photo...</div>
        ) : null}
        {isAdmin ? (
          <button
            type="button"
            disabled={unapproveMutation.isPending}
            onClick={handleUnapproveClick}
            className="unapprove-btn"
            title="Remove from guestbook"
            aria-label={`Remove wish by ${photo.name || "Guest"} from guestbook`}
          >
            ✕
          </button>
        ) : null}
        {canEdit ? (
          <button
            type="button"
            className="edit-btn"
            onClick={handleEditClick}
            title="Edit your submission"
            aria-label="Edit your photo submission"
          >
            Edit
          </button>
        ) : null}
      </div>
      <div className="photo-caption">
        {filmTime ? <span className="film-stamp">{filmTime}</span> : null}
        <p className="photo-name">{photo.name}</p>
        <p className="photo-message">
          {photo.message ? `“${photo.message}”` : null}
        </p>
      </div>
    </div>
  );
}
