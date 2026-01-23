import { useCallback } from 'react';
import { useAppActions, type HtmlElementRefKey } from './useContext';

export default function useRegisterHtmlElementRef(name: HtmlElementRefKey) {
  const { registerHtmlElementRef } = useAppActions();

  const register = useCallback(
    (el: HTMLElement | null) => registerHtmlElementRef(name, el),
    [registerHtmlElementRef],
  );

  return register;
}
