import useRegisterHtmlElementRef from "../../hooks/useRegisterHtmlElementRef";

export default function HeroSection() {
  const ref = useRegisterHtmlElementRef("hero");

  return (
    <>
      {/* <!-- Hero Section --> */}
      <section ref={ref} className="hero" id="hero">
        <div className="hero-content">
          <p className="hero-prelude">A Celebration of Love</p>
          <h1 className="hero-title">
            <span className="highlight">Zaid</span>
            <span className="hero-ampersand">&</span>
            <span className="highlight">Munawwarah</span>
          </h1>
          <p className="hero-date">February 2026</p>
        </div>
        <div className="scroll-indicator">
          <span>Guestbook</span>
          <svg
            viewBox="0 0 24 24"
            width="24"
            height="24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </section>
    </>
  );
}
