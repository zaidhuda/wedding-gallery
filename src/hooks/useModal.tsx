import {
  createContext,
  Fragment,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

const context = createContext<{
  openModal: (
    modal: (closeModal: () => void, key: string) => ReactNode,
  ) => void;
  closeModal: (key: string) => void;
} | null>(null);

export function ModalProvider({ children }: { children: ReactNode }) {
  const timeouts = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [modals, setModals] = useState<
    {
      modal: ReactNode;
      key: string;
    }[]
  >([]);

  const closeModal = useCallback((key: string) => {
    timeouts.current.push(
      setTimeout(() => {
        setModals((modals) => modals.filter((modal) => modal.key !== key));
        console.log("modal removed", key);
      }, 500),
    );
  }, []);

  const openModal = useCallback(
    async (modal: (closeModal: () => void, key: string) => ReactNode) => {
      const key = Date.now().toString();
      setModals((modals) => [
        ...modals,
        { modal: modal(() => closeModal(key), key), key },
      ]);
      return key;
    },
    [closeModal],
  );

  useEffect(() => {
    return () => {
      timeouts.current.forEach((timeout) => {
        clearTimeout(timeout);
      });
    };
  }, []);

  return (
    <context.Provider value={{ openModal, closeModal }}>
      {children}
      {modals.map((modal) => (
        <Fragment key={modal.key}>{modal.modal}</Fragment>
      ))}
    </context.Provider>
  );
}

export default function useModal() {
  const ctx = useContext(context);
  if (!ctx) throw new Error("useModal must be used within ModalProvider");
  return ctx;
}
