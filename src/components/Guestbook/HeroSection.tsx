import { NavLink } from "react-router";
import { HERO_CONTENT } from "../../constants";

export default function HeroSection() {
  return (
    <>
      {/* <!-- Hero Section --> */}
      <section className="hero">
        <div className="hero-content">
          <p className="hero-prelude">
            <NavLink to="/">{HERO_CONTENT.prelude}</NavLink>
          </p>
          <h1 className="hero-title">
            <a href="/admin" target="admin">
              <span className="highlight">{HERO_CONTENT.title1}</span>
            </a>
            <span className="hero-connector">
              {HERO_CONTENT.titleConnector}
            </span>
            <span className="highlight">{HERO_CONTENT.title2}</span>
          </h1>
          <p className="hero-date">{HERO_CONTENT.date}</p>
        </div>
        <div className="scroll-indicator">
          <span>{HERO_CONTENT.scrollIndicator}</span>
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
