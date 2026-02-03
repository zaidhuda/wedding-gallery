import { useQuery } from "@tanstack/react-query";
import { useCallback } from "preact/hooks";
import { STORED_EDIT_TOKENS } from "./useLocalStorage";

export default function useEditTokens() {
  const { data: EDIT_TOKENS, refetch } = useQuery({
    queryKey: ["ui", "edit-tokens"],
    initialData: "",
    queryFn: (): string => localStorage.getItem(STORED_EDIT_TOKENS) || "",
  });

  const addEditToken = useCallback(
    (token: string) => {
      localStorage.setItem(STORED_EDIT_TOKENS, `${EDIT_TOKENS},${token}`);
      refetch();
    },
    [EDIT_TOKENS, refetch],
  );

  const hasEditToken = (token?: string) => {
    return !!token && !!EDIT_TOKENS.includes(token);
  };

  return {
    hasEditToken,
    addEditToken,
  };
}
