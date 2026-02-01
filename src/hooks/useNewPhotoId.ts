import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export default function useNewPhotoId() {
  const queryClient = useQueryClient();

  const { data: newPhotoId } = useQuery<number | undefined>({
    queryKey: ['ui', 'newPhotoId'],
    queryFn: () => 0,
    staleTime: Infinity,
  });

  const isNewPhoto = useCallback(
    (id: number) => id === newPhotoId,
    [newPhotoId],
  );

  const setNewPhoto = useCallback((id?: number) => {
    if (!id) {
      queryClient.invalidateQueries({ queryKey: ['ui', 'newPhotoId'] });
    } else {
      queryClient.setQueryData(['ui', 'newPhotoId'], id);
    }
  }, []);

  return { isNewPhoto, setNewPhoto };
}
