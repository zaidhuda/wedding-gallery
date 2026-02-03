import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router';

const Admin = lazy(() => import('./components/Admin'));
const Guestbook = lazy(() => import('./components/Guestbook'));
const GallerySection = lazy(
  () => import('./components/Guestbook/GallerySection'),
);

function App() {
  return (
    <Routes>
      <Route
        path="/admin"
        element={
          <Suspense>
            <Admin />
          </Suspense>
        }
      />
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
