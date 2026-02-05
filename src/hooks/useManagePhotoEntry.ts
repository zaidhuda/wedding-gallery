import { type InfiniteData, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import type { PhotoFormValues } from "../components/Guestbook/BaseForm";
import type { EventTitle } from "../constants";
import type { PhotoResponse, PhotosResponse } from "../worker/types";

export default function useManagePhotoEntry() {
  const invalidatePhotosRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const removeTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const queryClient = useQueryClient();

  const addPhotoEntry = async (photo: PhotoResponse) => {
    await queryClient.cancelQueries({ queryKey: ["photos", photo.eventTag] });
    queryClient.setQueryData<InfiniteData<PhotosResponse>>(
      ["photos", photo.eventTag],
      (d) =>
        d
          ? {
              ...d,
              pages: d.pages
                ? [
                    {
                      ...d.pages[0],
                      photos: [photo, ...d.pages[0].photos],
                    },
                    ...d.pages.slice(1),
                  ]
                : [],
            }
          : d,
    );
    invalidatePhotosRef.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ["photos", photo.eventTag] });
    }, 5000);
  };

  const editPhotoEntry = async (
    event: EventTitle,
    photoId: number,
    data: PhotoFormValues,
  ) => {
    await queryClient.cancelQueries({ queryKey: ["photos", event] });
    queryClient.setQueryData<InfiniteData<PhotosResponse>>(
      ["photos", event],
      (d) =>
        d
          ? {
              ...d,
              pages: d.pages.map((p) => ({
                ...p,
                photos: p.photos.map((photo) =>
                  photo.id === photoId ? { ...photo, ...data } : photo,
                ),
              })),
            }
          : d,
    );
  };

  const removePhotoEntry = useCallback(
    async (event: EventTitle, photoId: number) => {
      await queryClient.cancelQueries({ queryKey: ["photos", event] });
      queryClient.setQueryData<InfiniteData<PhotosResponse>>(
        ["photos", event],
        (d) =>
          d
            ? {
                ...d,
                pages: d.pages.map((p) => ({
                  ...p,
                  photos: p.photos.map((photo) =>
                    photo.id === photoId
                      ? { ...photo, deletedAt: new Date() }
                      : photo,
                  ),
                })),
              }
            : d,
      );

      clearTimeout(removeTimeoutRef?.current);
      removeTimeoutRef.current = setTimeout(async () => {
        queryClient.invalidateQueries({ queryKey: ["photos", event] });
      }, 300);
    },
    [queryClient],
  );

  return { addPhotoEntry, editPhotoEntry, removePhotoEntry };
}
