import { useLayoutEffect } from 'react';
import useScript from './useScript';
import { useAppActions } from './useContext';

export default function useVerifyAdmin() {
  const { setIsAdmin } = useAppActions();
  const { verifyAdminAccess } = useScript();

  useLayoutEffect(() => {
    const verify = async () => {
      const isAdmin = await verifyAdminAccess();
      setIsAdmin(isAdmin);
    };
    verify();
  }, []);
}
