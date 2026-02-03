import { useCallback, useEffect } from "react";
import { type HtmlElementRefKey, useAppActions } from "./useContext";

export default function useRegisterHtmlElementRef(name: HtmlElementRefKey) {
  const { registerHtmlElementRef } = useAppActions();

  const register = useCallback(
    (el: HTMLElement | null) => registerHtmlElementRef(name, el),
    [registerHtmlElementRef, name],
  );

  useEffect(() => {
    return () => {
      registerHtmlElementRef(name, null);
    };
  }, [registerHtmlElementRef, name]);

  return register;
}
