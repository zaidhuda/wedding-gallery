import { useEffect } from "react";
import { useParams } from "react-router";

export default function useTheme() {
  const { section } = useParams();

  useEffect(() => {
    document.body.classList.remove(
      "theme-ijab",
      "theme-sanding",
      "theme-tandang",
    );
    if (section) document.body.classList.add(`theme-${section}`);
  }, [section]);
}
