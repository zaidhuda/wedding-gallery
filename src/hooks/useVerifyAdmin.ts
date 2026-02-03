import { useQuery } from '@tanstack/react-query';

export default function useVerifyAdmin() {
  const query = useQuery({
    queryKey: ['admin'],
    queryFn: () =>
      fetch('/api/admin/verify', {
        credentials: 'include',
      }).then((response) => {
        if (response.ok) {
          return response
            .json()
            .then((data: { authenticated: boolean; email: string }) => {
              if (data.authenticated) {
                console.log(`Admin mode enabled: ${data.email}`);
              }
              return data.authenticated;
            });
        }
        return false;
      }),
    staleTime: Infinity,
  });

  return query.data ?? false;
}
