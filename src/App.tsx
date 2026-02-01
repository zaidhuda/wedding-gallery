import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';

const GallerySection = lazy(() => import('./components/GallerySection'));
const Guestbook = lazy(() => import('./pages/Guestbook'));

function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Suspense>
            <Guestbook />
          </Suspense>
        }
      >
        <Route
          path=":section"
          element={
            <Suspense>
              <GallerySection />
            </Suspense>
          }
        />
      </Route>
    </Routes>
  );
}

export default App;
