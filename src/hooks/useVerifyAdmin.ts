import { useAppActions } from './useContext';
import { useQuery } from 'react-query';

export default function useVerifyAdmin() {
  const { setIsAdmin } = useAppActions();

  useQuery({
    queryKey: ['admin'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/admin/verify', {
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();
          if (data.authenticated) {
            document.body.classList.add('is-admin');
            console.log(`Admin mode enabled: ${data.email}`);
            return true;
          }
        }
      } catch (error) {
        console.log('Admin verification failed (not authenticated)');
      }
      return false;
    },
    staleTime: Infinity,
    onSuccess: setIsAdmin,
  });
}
