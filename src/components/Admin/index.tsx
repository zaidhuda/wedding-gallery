import { useCallback, useLayoutEffect } from 'react';
import type { PhotoResponse } from '../../worker/types';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
} from '@tanstack/react-query';
import AdminMainContent from './AdminMainContent';
import AdminPanelHeader from './AdminPanelHeader';
import './index.css';

const queryClient = new QueryClient();

function performAction(action: 'approve' | 'delete') {
  return async ({ ids }: { ids: number[] }) => {
    const card =
      ids.length === 1 ? document.querySelector(`[data-id="${ids[0]}"]`) : null;
    if (card) card.classList.add('loading', 'animate-pulse');

    const res = await fetch('/api/admin/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ids }),
      credentials: 'include',
    });

    if (res.status === 401) {
      throw new Error('Session expired. Please refresh the page.');
    }

    if (!res.ok) {
      throw new Error('Action failed');
    }

    if (card) card.classList.remove('loading', 'animate-pulse');

    return ids;
  };
}

function removePhotos(ids: number[]) {
  return (p: { photos: PhotoResponse[]; admin: string | null } | undefined) =>
    p
      ? {
          photos: p.photos.filter((p) => !ids.includes(p.id)),
          admin: p.admin,
        }
      : p;
}

function AdminPanel() {
  useLayoutEffect(() => {
    document.body.classList.toggle('bg-zinc-900');
    document.body.classList.toggle('text-zinc-100');
    document.body.classList.toggle('min-h-screen');

    return () => {
      document.body.classList.toggle('bg-zinc-900');
      document.body.classList.toggle('text-zinc-100');
      document.body.classList.toggle('min-h-screen');
    };
  }, []);

  const query = useQuery({
    queryKey: ['pending-photos'],
    queryFn: async () => {
      const res = await fetch('/api/admin/pending', {
        credentials: 'include',
      });

      if (res.status === 401) {
        throw new Error('Unauthorized');
      }

      if (!res.ok) throw new Error('Failed to load');

      return res.json() as Promise<{
        photos: PhotoResponse[];
        admin: string | null;
      }>;
    },
    retry: false,
  });

  const photos = query.data?.photos ?? [];
  const photosCount = photos.length;
  const admin = query.data?.admin ?? null;
  const refetch = useCallback(() => query.refetch(), [query]);

  const approveMutation = useMutation({
    mutationKey: ['admin-action', 'approve'],
    mutationFn: performAction('approve'),
    onError: (error) => {
      alert('Approve failed. Please try again.\n\n' + error.message);
    },
    onSuccess: (ids: number[]) => {
      queryClient.setQueryData(['pending-photos'], removePhotos(ids));
    },
  });

  const deleteMutation = useMutation({
    mutationKey: ['admin-action', 'delete'],
    mutationFn: performAction('delete'),
    onError: (error) => {
      alert('Delete failed. Please try again.\n\n' + error.message);
    },
    onSuccess: (ids: number[]) => {
      queryClient.setQueryData(['pending-photos'], removePhotos(ids));
    },
  });

  const approvePhoto = useCallback(
    async (id: number) => approveMutation.mutateAsync({ ids: [id] }),
    [approveMutation],
  );

  const deletePhoto = useCallback(
    async (id: number) => {
      if (!confirm('Delete this photo permanently?')) return;
      await deleteMutation.mutateAsync({ ids: [id] });
    },
    [deleteMutation],
  );

  const approveAllPhotos = useCallback(async () => {
    if (!photos && !confirm(`Approve all ${photosCount} photos?`)) return;
    const ids = photos.map((p) => p.id);
    await approveMutation.mutateAsync({ ids });
  }, [photos]);

  const deleteAllPhotos = useCallback(async () => {
    if (
      !photos &&
      !confirm(`DELETE all ${photosCount} photos? This cannot be undone!`)
    ) {
      return;
    }
    const ids = photos.map((p) => p.id);
    await deleteMutation.mutateAsync({ ids });
  }, [photos]);

  return (
    <div id="adminPanel" className="admin-panel">
      {/* <!-- Header --> */}
      <AdminPanelHeader
        photosCount={photosCount}
        admin={admin}
        isFetching={query.isFetching}
        isPendingApprove={approveMutation.isPending}
        isPendingDelete={deleteMutation.isPending}
        refetch={refetch}
        approveAllPhotos={approveAllPhotos}
        deleteAllPhotos={deleteAllPhotos}
      />

      {/* <!-- Content --> */}
      <main className="max-w-7xl mx-auto px-4 py-6" role="main">
        <AdminMainContent
          query={query}
          approvePhoto={approvePhoto}
          deletePhoto={deletePhoto}
        />
      </main>
    </div>
  );
}

export default function Admin() {
  return (
    <QueryClientProvider client={queryClient}>
      <AdminPanel />
    </QueryClientProvider>
  );
}
