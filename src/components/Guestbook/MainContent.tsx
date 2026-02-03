import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UploadFormModal from './UploadFormModal';
import EditFormModal from './EditFormModal';
import useVerifyAdmin from '../../hooks/useVerifyAdmin';
import { Outlet } from 'react-router';

const queryClient = new QueryClient();

function Render() {
  useVerifyAdmin();

  return (
    <>
      <Outlet />
      <UploadFormModal />
      <EditFormModal />
    </>
  );
}

export default function MainContent() {
  return (
    <QueryClientProvider client={queryClient}>
      <Render />
    </QueryClientProvider>
  );
}
