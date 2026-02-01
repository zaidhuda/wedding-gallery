import { useEffect } from 'react';
import { useAppActions } from './useContext';

export default function useVerifyAdmin() {
  const { setIsAdmin } = useAppActions();

  useEffect(() => {
    try {
      fetch('/api/admin/verify', {
        credentials: 'include',
      }).then((response) => {
        if (response.ok) {
          response.json().then((data) => {
            if (data.authenticated) {
              document.body.classList.add('is-admin');
              console.log(`Admin mode enabled: ${data.email}`);
              setIsAdmin(true);
            }
          });
        }
      });
    } catch (error) {
      console.log('Admin verification failed (not authenticated)');
    }
  }, []);
}
