import { lazy, Suspense } from 'react';
import { AppContextProvider } from './hooks/useContext';
import HeroSection from './components/HeroSection';
import FloatingNavigation from './components/FloatingNavigation';
import { Route, Routes } from 'react-router';
import useTheme from './hooks/useTheme';
import './App.css';

const MainContent = lazy(() => import('./components/MainContent'));

function RenderApp({ children }: { children?: React.ReactNode }) {
  useTheme();

  return (
    <AppContextProvider>
      <>
        {/* <!-- Skip Navigation Link for Keyboard Users --> */}
        <a href="#main-content" className="sr-only sr-only-focusable">
          Skip to main content
        </a>

        <HeroSection />
        <FloatingNavigation />

        {children}
      </>
    </AppContextProvider>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<RenderApp />} />
      <Route
        path="/:section"
        element={
          <RenderApp>
            <Suspense fallback={<div>Loading...</div>}>
              <MainContent />
            </Suspense>
          </RenderApp>
        }
      />
    </Routes>
  );
}

export default App;
