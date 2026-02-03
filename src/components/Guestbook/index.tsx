import { lazy, Suspense } from "react";
import { AppContextProvider } from "../../hooks/useContext";
import usePassword from "../../hooks/usePassword";
import useTheme from "../../hooks/useTheme";
import FloatingNavigation from "./FloatingNavigation";
import HeroSection from "./HeroSection";

import "./index.css";

const MainContent = lazy(() => import("./MainContent"));

export default function Guestbook() {
  useTheme();
  usePassword();

  return (
    <AppContextProvider>
      {/* <!-- Skip Navigation Link for Keyboard Users --> */}
      <a href="#main-content" className="sr-only sr-only-focusable">
        Skip to main content
      </a>

      <HeroSection />
      <FloatingNavigation />

      <Suspense fallback={<div>Loading...</div>}>
        <MainContent />
      </Suspense>
    </AppContextProvider>
  );
}
