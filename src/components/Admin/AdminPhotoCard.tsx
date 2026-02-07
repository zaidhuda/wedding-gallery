import { useState } from "react";
import type { PhotoResponse } from "../../worker/types";

function formatTimestamp(ts: string) {
  if (!ts) return "";
  const date = new Date(ts);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export default function AdminPhotoCard({
  photo,
  approvePhoto,
  deletePhoto,
}: {
  photo: PhotoResponse;
  approvePhoto: (id: number) => void;
  deletePhoto: (id: number) => void;
}) {
  const [showImage, setShowImage] = useState(false);

  const handleImageClick = () => {
    setShowImage((showImage) => !showImage);
  };

  return (
    <>
      <div
        className="photo-card bg-zinc-800 rounded-lg overflow-hidden border border-zinc-700"
        data-id={photo.id}
      >
        <button
          type="button"
          onClick={handleImageClick}
          className="aspect-square bg-zinc-900 relative"
        >
          <img
            src={photo.url}
            alt={`Submitted by ${photo.name || "Anonymous"} ${photo.message ? `: ${photo.message}` : ""}`}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <span className="absolute top-2 left-2 px-2 py-0.5 bg-zinc-900/80 text-zinc-300 text-xs rounded">
            {photo.eventTag}
          </span>
        </button>
        <div className="p-3 space-y-2">
          <div className="text-sm">
            <p className="font-medium text-zinc-100 truncate">
              {photo.name || "Anonymous"}
            </p>
            <p className="text-zinc-400 text-xs mt-1 line-clamp-2">
              {photo.message}
            </p>
          </div>
          <p className="text-zinc-500 text-xs">
            {formatTimestamp(photo.timestamp)}
          </p>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => approvePhoto(photo.id)}
              className="flex-1 py-1.5 bg-green-600/20 hover:bg-green-600 text-green-400 hover:text-white rounded text-xs font-medium transition-colors"
              aria-label={`Approve photo by ${photo.name || "Anonymous"}`}
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => deletePhoto(photo.id)}
              className="flex-1 py-1.5 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white rounded text-xs font-medium transition-colors"
              aria-label={`Delete photo by ${photo.name || "Anonymous"}`}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
      {!!showImage && (
        <button
          type="button"
          onClick={handleImageClick}
          className="absolute top-0 left-0 w-screen h-screen bg-black/80 z-50 flex items-center justify-center p-8"
        >
          <img
            src={photo.url}
            alt={`Submitted by ${photo.name || "Anonymous"} ${photo.message ? `: ${photo.message}` : ""}`}
            loading="lazy"
            className="max-w-full max-h-full object-contain"
          />
          <span className="absolute top-2 left-2 px-2 py-0.5 bg-zinc-900/80 text-zinc-300 text-xs rounded">
            {photo.eventTag}
          </span>
        </button>
      )}
    </>
  );
}
