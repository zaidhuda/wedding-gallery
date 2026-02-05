import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet } from "react-router";
import { ModalProvider } from "../../hooks/useModal";
import useVerifyAdmin from "../../hooks/useVerifyAdmin";
import FloatingNavigation from "./FloatingNavigation";

const queryClient = new QueryClient();

function Render() {
  useVerifyAdmin();

  return (
    <ModalProvider>
      <FloatingNavigation />
      <Outlet />
    </ModalProvider>
  );
}

export default function MainContent() {
  return (
    <QueryClientProvider client={queryClient}>
      <Render />
    </QueryClientProvider>
  );
}
