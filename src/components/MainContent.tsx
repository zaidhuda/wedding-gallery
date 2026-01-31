import { QueryClient, QueryClientProvider } from 'react-query';
import { EVENTS } from '../constants';
import EventSection from './EventSection';
import UploadFormModal from './UploadFormModal';
import EditFormModal from './EditFormModal';
import useVerifyAdmin from '../hooks/useVerifyAdmin';

const queryClient = new QueryClient();

function Render() {
  useVerifyAdmin();

  return (
    <>
      {EVENTS.map((event) => (
        <EventSection key={event.name} {...event} />
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
