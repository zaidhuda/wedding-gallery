import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";
import GallerySection from "./components/Guestbook/GallerySection";

const Admin = lazy(() => import("./components/Admin"));
const Guestbook = lazy(() => import("./components/Guestbook"));

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
        <Route path=":section" element={<GallerySection />} />
      </Route>
    </Routes>
  );
}

export default App;
