import { useCallback } from 'react';
import { useQuery, useQueryClient } from 'react-query';

export default function useNewPhotoId() {
  const queryClient = useQueryClient();

  const { data: newPhotoId } = useQuery<number | undefined>({
    queryKey: ['ui', 'newPhotoId'],
    queryFn: () => void 0,
  });

  const isNewPhoto = useCallback(
    (id: number) => id === newPhotoId,
    [newPhotoId],
  );

  const setNewPhoto = useCallback((id?: number) => {
    queryClient.setQueryData(['ui', 'newPhotoId'], id);
  }, []);

  return { isNewPhoto, setNewPhoto };
}
