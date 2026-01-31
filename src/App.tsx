import { lazy, Suspense } from 'react';
import { AppContextProvider } from './hooks/useContext';
import HeroSection from './components/HeroSection';
import FloatingNavigation from './components/FloatingNavigation';
import './App.css';

const MainContent = lazy(() => import('./components/MainContent'));

function App() {
  return (
    <AppContextProvider>
      <>
        {/* <!-- Skip Navigation Link for Keyboard Users --> */}
        <a href="#main-content" className="sr-only sr-only-focusable">
          Skip to main content
        </a>

        <HeroSection />
        <FloatingNavigation />

        <Suspense fallback={<div>Loading...</div>}>
          <MainContent />
        </Suspense>
      </>
    </AppContextProvider>
  );
}

export default App;
