import { useMemo, useRef } from "react";

const CUT_OFF_DATE =
  (import.meta.env.VITE_UPLOAD_CUT_OFF_DATE as string | undefined) ||
  "2026-02-28";

export default function useCanUpload() {
  const today = useRef(new Date());
  const cutOffDate = useRef(new Date(CUT_OFF_DATE));

  return useMemo(() => {
    cutOffDate.current.setHours(23, 59, 59, 999);

    return today.current <= cutOffDate.current;
  }, []);
}
