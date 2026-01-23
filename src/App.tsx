import { QueryClient, QueryClientProvider } from 'react-query';
import HeroSection from './components/HeroSection';
import MainContent from './components/MainContent';
import FloatingNavigation from './components/FloatingNavigation';
import UploadFormModal from './components/UploadFormModal';
import EditFormModal from './components/EditFormModal';
import { AppContextProvider } from './hooks/useContext';
import useScrollListener from './hooks/useScrollListener';
import './App.css';
import useVerifyAdmin from './hooks/useVerifyAdmin';

const queryClient = new QueryClient();

function AppContent() {
  useScrollListener();
  useVerifyAdmin();

  return (
    <>
      {/* <!-- Skip Navigation Link for Keyboard Users --> */}
      <a href="#main-content" className="sr-only sr-only-focusable">
        Skip to main content
      </a>

      <HeroSection />
      <MainContent />
      <FloatingNavigation />
      <UploadFormModal />
      <EditFormModal />
    </>
  );
}

function App() {
  return (
    <AppContextProvider>
      <QueryClientProvider client={queryClient}>
        <AppContent />
      </QueryClientProvider>
    </AppContextProvider>
  );
}

export default App;
