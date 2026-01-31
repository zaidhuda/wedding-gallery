import { useLayoutEffect, useRef } from 'react';
import { useAppActions, useAppState } from './useContext';
import type { EventTitle } from '../constants';

function applyTheme(theme?: string) {
  document.body.classList.remove(
    'theme-ijab',
    'theme-sanding',
    'theme-tandang',
  );
  if (theme) document.body.classList.add(`theme-${theme}`);
}

export default function useScrollListener() {
  const { htmlElementRefMap } = useAppState();
  const { setCurrentEventTag } = useAppActions();

  const tickingRef = useRef(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useLayoutEffect(() => {
    const sections = [
      htmlElementRefMap.current['gallery-ijab'],
      htmlElementRefMap.current['gallery-sanding'],
      htmlElementRefMap.current['gallery-tandang'],
    ].filter(Boolean) as HTMLElement[];
    const navbar = htmlElementRefMap.current['floating-nav'];
    const navItems = navbar?.querySelectorAll<HTMLDivElement>('.nav-item');

    function updateActiveSection() {
      let activeSection: Element | null = null;
      let bestPosition = -Infinity;

      sections.forEach((section) => {
        const title = section.querySelector('.section-title') as HTMLDivElement;
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
        sections.forEach((section) => {
          const title = section.querySelector(
            '.section-title',
          ) as HTMLDivElement;
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
        const event = el.dataset.event as EventTitle;

        if (event) {
          applyTheme(theme);
          setCurrentEventTag(event);

          navItems?.forEach((item) => {
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

    updateActiveSection();

    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [setCurrentEventTag]);

  useLayoutEffect(() => {
    const observeHeroScroll = () => {
      const navbar = htmlElementRefMap.current['floating-nav'];
      const hero = htmlElementRefMap.current['hero'];

      if (!navbar || !hero) {
        return;
      }

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
    };

    observeHeroScroll();
    window.addEventListener('resize', observeHeroScroll);

    return () => {
      window.removeEventListener('resize', observeHeroScroll);
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, []);
}
