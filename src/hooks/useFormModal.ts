import { useCallback } from 'react';
import { EVENT_MAP, type EventTitle } from '../constants';
import { useAppActions, useAppState } from './useContext';

export default function useFormModal(id: 'uploadModal' | 'editModal') {
  const { setCurrentEventTag } = useAppActions();
  const { htmlElementRefMap } = useAppState();

  const openModal = useCallback((eventTag: EventTitle) => {
    const modal = htmlElementRefMap.current[id];
    const config = EVENT_MAP[eventTag];
    if (!config) return;

    setCurrentEventTag(eventTag);

    if (modal) {
      // Apply theme class based on photo's event
      modal.classList.remove(
        'modal-theme-ijab',
        'modal-theme-sanding',
        'modal-theme-tandang',
      );
      modal.classList.add('visible', `modal-theme-${config.theme}`);
      document.body.style.overflow = 'hidden';
    }
  }, []);

  const closeModal = useCallback(() => {
    const modal = htmlElementRefMap.current[id];
    if (modal) {
      modal.classList.remove(
        'visible',
        'modal-theme-ijab',
        'modal-theme-sanding',
        'modal-theme-tandang',
      );
      document.body.style.overflow = '';
    }
  }, []);

  return { openModal, closeModal };
}
