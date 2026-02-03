import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet } from "react-router";
import useVerifyAdmin from "../../hooks/useVerifyAdmin";
import EditFormModal from "./EditFormModal";
import UploadFormModal from "./UploadFormModal";

const queryClient = new QueryClient();

function Render() {
  useVerifyAdmin();

  return (
    <>
      <Outlet />
      <UploadFormModal />
      <EditFormModal />
    </>
  );
}

export default function MainContent() {
  return (
    <QueryClientProvider client={queryClient}>
      <Render />
    </QueryClientProvider>
  );
}
