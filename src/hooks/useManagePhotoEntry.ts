import { useQueryClient } from 'react-query';
import { useCallback, useRef } from 'react';
import type { PhotoResponse, PhotosResponse } from '../worker/types';
import type { EventTitle } from '../constants';
import type { PhotoFormValues } from '../components/BaseForm';

export default function useManagePhotoEntry() {
  const invalidatePhotosRef = useRef<NodeJS.Timeout>(undefined);
  const removeTimeoutRef = useRef<NodeJS.Timeout>(undefined);
  const queryClient = useQueryClient();

  const addPhotoEntry = async (photo: PhotoResponse) => {
    await queryClient.cancelQueries(['photos', photo.eventTag]);
    queryClient.setQueryData<PhotosResponse | undefined>(
      ['photos', photo.eventTag],
      (d) => (d ? { ...d, photos: [photo, ...d.photos] } : d),
    );
    invalidatePhotosRef.current = setTimeout(() => {
      queryClient.invalidateQueries(['photos', photo.eventTag]);
    }, 5000);
  };

  const editPhotoEntry = async (
    event: EventTitle,
    photoId: number,
    data: PhotoFormValues,
  ) => {
    await queryClient.cancelQueries(['photos', event]);
    queryClient.setQueryData<PhotosResponse | undefined>(
      ['photos', event],
      (d) =>
        d
          ? {
              ...d,
              photos: d.photos.map((p) =>
                p.id === photoId
                  ? { ...p, name: data.name, message: data.message }
                  : p,
              ),
            }
          : d,
    );
  };

  const removePhotoEntry = useCallback(
    async (event: EventTitle, photoId: number) => {
      await queryClient.cancelQueries(['photos', event]);
      queryClient.setQueryData<PhotosResponse | undefined>(
        ['photos', event],
        (d) =>
          d
            ? {
                ...d,
                photos: d.photos.map((photo) => ({
                  ...photo,
                  ...(photo.id === photoId ? { deletedAt: new Date() } : {}),
                })),
              }
            : d,
      );

      clearTimeout(removeTimeoutRef?.current);
      removeTimeoutRef.current = setTimeout(async () => {
        await queryClient.cancelQueries(['photos', event]);
        queryClient.setQueryData<PhotosResponse | undefined>(
          ['photos', event],
          (d) =>
            d
              ? {
                  ...d,
                  photos: d.photos.filter(({ id }) => id !== photoId),
                }
              : d,
        );
      }, 300);
    },
    [queryClient],
  );

  return { addPhotoEntry, editPhotoEntry, removePhotoEntry };
}
