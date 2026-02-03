import { useMemo } from "react";

export default function useQueryParams<T extends string>(names: T[]) {
  return useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return names.reduce(
      (acc, name) => {
        acc[name] = params.get(name);
        return acc;
      },
      {} as Record<T, string | null>,
    );
  }, [names.reduce]);
}
