import { useCallback } from "react";
import { EVENT_MAP, type EventTitle } from "../constants";
import { useAppState } from "./useContext";

export default function useFormModal(id: "uploadModal" | "editModal") {
  const { htmlElementRefMap } = useAppState();

  const openModal = useCallback(
    async (eventTag: EventTitle) => {
      const modal = htmlElementRefMap.current[id];
      const config = EVENT_MAP[eventTag];
      if (!config) return;

      if (modal) {
        modal.classList.remove(
          "modal-theme-ijab",
          "modal-theme-sanding",
          "modal-theme-tandang",
        );
        modal.classList.add("visible", `modal-theme-${config.theme}`);
        document.body.style.overflow = "hidden";
      }
    },
    [htmlElementRefMap.current[id], id],
  );

  const closeModal = useCallback(() => {
    const modal = htmlElementRefMap.current[id];
    if (modal) {
      modal.classList.remove(
        "visible",
        "modal-theme-ijab",
        "modal-theme-sanding",
        "modal-theme-tandang",
      );
      document.body.style.overflow = "";
    }
  }, [htmlElementRefMap.current[id], id]);

  return { openModal, closeModal };
}
