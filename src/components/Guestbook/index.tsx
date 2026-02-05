import { lazy, Suspense } from "react";
import usePassword from "../../hooks/usePassword";
import useTheme from "../../hooks/useTheme";
import HeroSection from "./HeroSection";

import "./index.css";

const MainContent = lazy(() => import("./MainContent"));

export default function Guestbook() {
  useTheme();
  usePassword();

  return (
    <>
      {/* <!-- Skip Navigation Link for Keyboard Users --> */}
      <a href="#main-content" className="sr-only sr-only-focusable">
        Skip to main content
      </a>

      <HeroSection />

      <Suspense>
        <MainContent />
      </Suspense>
    </>
  );
}
