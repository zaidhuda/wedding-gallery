import type { EVENTS } from '../constants';
import { useAppState } from './useContext';

export default function useScrollTo() {
  const { htmlElementRefMap } = useAppState();

  return function scrollToSection(
    sectionId: (typeof EVENTS)[number]['gallery'],
  ) {
    const section = htmlElementRefMap.current[sectionId];
    if (section) {
      section.scrollIntoView({ behavior: 'smooth' });
    }
  };
}
