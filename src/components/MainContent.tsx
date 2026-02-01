import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GallerySection from './GallerySection';
import UploadFormModal from './UploadFormModal';
import EditFormModal from './EditFormModal';
import useVerifyAdmin from '../hooks/useVerifyAdmin';

const queryClient = new QueryClient();

function Render() {
  useVerifyAdmin();

  return (
    <>
      <GallerySection />
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
