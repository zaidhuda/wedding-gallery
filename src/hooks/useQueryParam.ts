import { useMemo } from 'react';

export default function useQueryParams(names: string[]) {
  return useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return names.reduce(
      (acc, name) => {
        acc[name] = params.get(name);
        return acc;
      },
      {} as Record<string, string | null>,
    );
  }, [window.location.search]);
}
