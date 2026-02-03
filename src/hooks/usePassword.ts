import { useEffect } from "react";
import { STORED_PASSWORD } from "./useLocalStorage";

const GUEST_PASSWORD = import.meta.env.VITE_GUEST_PASSWORD;

export default function usePassword() {
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlPassword = urlParams.get("pass");

    if (
      urlPassword &&
      urlPassword?.toLowerCase() === GUEST_PASSWORD?.toLowerCase()
    ) {
      localStorage.setItem(STORED_PASSWORD, urlPassword);
    }

    if (urlPassword) {
      urlParams.delete("pass");
      const newUrl = urlParams.toString()
        ? `${window.location.pathname}?${urlParams.toString()}`
        : window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }
  }, []);
}
