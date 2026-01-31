import { QueryClient, QueryClientProvider } from 'react-query';
import { EVENTS } from '../constants';
import GallerySection from './GallerySection';
import UploadFormModal from './UploadFormModal';
import EditFormModal from './EditFormModal';
import useVerifyAdmin from '../hooks/useVerifyAdmin';
import useScrollListener from '../hooks/useScrollListener';

const queryClient = new QueryClient();

function Render() {
  useScrollListener();
  useVerifyAdmin();

  return (
    <>
      {EVENTS.map((event) => (
        <GallerySection key={event.name} {...event} />
      ))}
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
