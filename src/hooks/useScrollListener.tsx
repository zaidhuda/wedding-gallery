import { useLayoutEffect, useRef } from 'react';
import { useAppActions, useAppState } from './useContext';

export default function useScrollListener() {
  const { currentEventTag } = useAppState();
  const { setCurrentEventTag } = useAppActions();

  const tickingRef = useRef(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useLayoutEffect(() => {
    const sections =
      document.querySelectorAll<HTMLDivElement>('.gallery-section');
    const sectionTitles =
      document.querySelectorAll<HTMLDivElement>('.section-title');
    const navItems = document.querySelectorAll<HTMLDivElement>('.nav-item');
    const navbar = document.querySelector<HTMLDivElement>(
      '.floating-nav',
    ) as HTMLDivElement;
    const hero = document.querySelector<HTMLDivElement>(
      '.hero',
    ) as HTMLDivElement;

    if (!navbar || !hero) {
      // Nothing to observe yet; avoid crashing.
      return;
    }

    function applyTheme(theme?: string) {
      document.body.classList.remove(
        'theme-ijab',
        'theme-sanding',
        'theme-tandang',
      );
      if (theme) document.body.classList.add(`theme-${theme}`);
    }

    function updateActiveSection() {
      let activeSection: Element | null = null;
      let bestPosition = -Infinity;

      sectionTitles.forEach((title) => {
        const section = title.closest('.gallery-section');
        const rect = title.getBoundingClientRect();

        const triggerTop = -200;
        const triggerBottom = window.innerHeight * 0.6;

        if (
          rect.top <= triggerBottom &&
          rect.top > bestPosition &&
          rect.top >= triggerTop
        ) {
          bestPosition = rect.top;
          activeSection = section;
        }
      });

      if (!activeSection) {
        sectionTitles.forEach((title) => {
          const section = title.closest('.gallery-section');
          const rect = title.getBoundingClientRect();
          if (rect.top < 0 && rect.top > bestPosition) {
            bestPosition = rect.top;
            activeSection = section;
          }
        });
      }

      if (!activeSection && sections.length > 0) activeSection = sections[0];

      if (activeSection) {
        const el = activeSection as HTMLDivElement;
        const theme = el.dataset.theme;
        const event = el.dataset.event;

        if (event && currentEventTag !== event) {
          applyTheme(theme);
          setCurrentEventTag(event);

          navItems.forEach((item) => {
            item.classList.toggle('active', item.dataset.event === event);
          });
        }
      }

      tickingRef.current = false;
    }

    function onScroll() {
      if (!tickingRef.current) {
        requestAnimationFrame(updateActiveSection);
        tickingRef.current = true;
      }
    }

    function observeHeroScroll() {
      observerRef.current?.disconnect();

      const offset = navbar.offsetHeight * 2;
      const threshold = Math.max(
        0,
        Math.min(1, 1 - offset / window.innerHeight),
      );

      observerRef.current = new IntersectionObserver(
        ([entry]) => {
          navbar.classList.toggle('floating-nav-hidden', entry.isIntersecting);
        },
        { threshold },
      );

      observerRef.current.observe(hero);
    }

    updateActiveSection();
    observeHeroScroll();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', observeHeroScroll);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', observeHeroScroll);
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [currentEventTag, setCurrentEventTag]);
}
