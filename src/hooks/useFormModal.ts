import { useCallback } from 'react';
import { EVENT_MAP, type EventTitle } from '../constants';
import { useAppActions, useAppState } from './useContext';
import { STORED_NAME } from './useLocalStorage';

export default function useFormModal(id: 'uploadModal' | 'editModal') {
  const { setCurrentEventTag } = useAppActions();
  const { htmlElementRefMap } = useAppState();

  const modal = htmlElementRefMap.current[id];

  const open = useCallback((eventTag: EventTitle) => {
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
      modal.classList.add(`modal-theme-${config.theme}`);

      (document.getElementById('hiddenEventTag') as HTMLInputElement).value =
        eventTag;
      (
        document.getElementById('eventIndicator') as HTMLSpanElement
      ).textContent = config.label;

      // Pre-fill the name field with saved value from localStorage
      const savedName = localStorage.getItem(STORED_NAME);
      if (savedName) {
        (document.getElementById('photoName') as HTMLInputElement).value =
          savedName;
      }

      modal.classList.add('visible');
      document.body.style.overflow = 'hidden';
    }
  }, []);

  const close = useCallback(() => {
    if (modal) {
      modal.classList.remove('visible');
      modal.classList.remove(
        'modal-theme-ijab',
        'modal-theme-sanding',
        'modal-theme-tandang',
      );
      document.body.style.overflow = '';
      (document.getElementById('hiddenFileInput') as HTMLInputElement).value =
        '';
    }
  }, []);

  return { open, close };
}
