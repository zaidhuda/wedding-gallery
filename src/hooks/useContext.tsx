import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PhotoResponse } from "../worker/types";

export type HtmlElementRefKey =
  | "floating-nav"
  | "gallery"
  | "file-input"
  | "uploadModal"
  | "editModal";
type HtmlElementRefMap = Partial<Record<HtmlElementRefKey, HTMLElement | null>>;

type AppState = {
  htmlElementRefMap: React.RefObject<
    Partial<Record<HtmlElementRefKey, HTMLElement | null>>
  >;
  selectedPhoto: PhotoResponse | null;
};

type AppActions = {
  registerHtmlElementRef: (
    name: HtmlElementRefKey,
    ref: HTMLElement | null,
  ) => void;
  selectPhoto: (photo: PhotoResponse | null) => void;
};

const AppStateContext = createContext<AppState | null>(null);
const AppActionsContext = createContext<AppActions | null>(null);

export function AppContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const htmlElementRefMap = useRef<HtmlElementRefMap>({});
  const [selectedPhoto, selectPhoto] = useState<PhotoResponse | null>(null);

  const registerHtmlElementRef = useCallback(
    (name: keyof HtmlElementRefMap, ref: HTMLElement | null) => {
      htmlElementRefMap.current[name] = ref;
      return ref;
    },
    [],
  );

  const states = useMemo(
    () => ({ htmlElementRefMap, selectedPhoto }),
    [selectedPhoto],
  );
  const actions = useMemo(
    () => ({
      registerHtmlElementRef,
      selectPhoto,
    }),
    [registerHtmlElementRef],
  );

  return (
    <AppActionsContext.Provider value={actions}>
      <AppStateContext.Provider value={states}>
        {children}
      </AppStateContext.Provider>
    </AppActionsContext.Provider>
  );
}

export function useAppActions() {
  const ctx = useContext(AppActionsContext);
  if (!ctx)
    throw new Error("useAppActions must be used within AppContextProvider");
  return ctx;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx)
    throw new Error("useAppState must be used within AppContextProvider");
  return ctx;
}
