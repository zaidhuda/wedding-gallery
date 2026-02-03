import type { UseQueryResult } from '@tanstack/react-query';
import type { PhotoResponse } from '../../worker/types';
import { useCallback } from 'react';
import AdminPhotoCard from './AdminPhotoCard';

export default function AdminMainContent({
  query,
  approvePhoto,
  deletePhoto,
}: {
  query: UseQueryResult<{ photos: PhotoResponse[]; admin: string | null }>;
  approvePhoto: (id: number) => void;
  deletePhoto: (id: number) => void;
}) {
  const photos = query.data?.photos ?? [];
  const photosCount = photos.length;
  const refetch = useCallback(() => query.refetch(), [query]);

  if (query.isFetching) {
    return (
      <div
        id="loadingState"
        className="text-center py-20"
        role="status"
        aria-live="polite"
      >
        <div className="inline-flex items-center gap-3 text-zinc-400">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          Loading pending photos...
        </div>
      </div>
    );
  }

  if (query.error?.message === 'Unauthorized') {
    return (
      <div id="authError" className="text-center py-20" role="alert">
        <div className="inline-flex flex-col items-center gap-4">
          <svg
            className="w-16 h-16 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1"
              d="M12 15v2m0 0v2m0-2h2m-2 0H10m2-6V4m0 0L9 7m3-3l3 3"
            />
            <circle cx="12" cy="12" r="10" stroke-width="1" />
          </svg>
          <p className="text-zinc-300 text-lg">Authentication Required</p>
          <p className="text-zinc-500 text-sm max-w-md">
            This page is protected by Cloudflare Access. Please ensure you're
            signed in through your organization's identity provider.
          </p>
          <button
            onClick={refetch}
            className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
            aria-label="Retry authentication"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (query.error) {
    return (
      <div id="errorState" className="text-center py-20" role="alert">
        <div className="text-red-400" role="alert">
          Failed to load photos.
          <button
            onClick={refetch}
            className="underline"
            aria-label="Retry loading photos"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (photosCount < 1) {
    return (
      <div id="emptyState" className="text-center py-20" role="status">
        <div className="inline-flex flex-col items-center gap-4">
          <svg
            className="w-16 h-16 text-zinc-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-zinc-400 text-lg">All caught up!</p>
          <p className="text-zinc-500 text-sm">No photos pending approval</p>
        </div>
      </div>
    );
  }

  return (
    <div
      id="photoGrid"
      className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
      role="list"
      aria-label="Pending photos for approval"
    >
      {photos.map((photo) => (
        <AdminPhotoCard
          key={photo.id}
          photo={photo}
          approvePhoto={approvePhoto}
          deletePhoto={deletePhoto}
        />
      ))}
    </div>
  );
}
