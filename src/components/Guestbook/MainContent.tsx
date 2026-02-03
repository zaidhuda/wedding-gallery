import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet } from "react-router";
import useCanUpload from "../../hooks/useCanUpload";
import useVerifyAdmin from "../../hooks/useVerifyAdmin";
import EditFormModal from "./EditFormModal";
import UploadFormModal from "./UploadFormModal";

const queryClient = new QueryClient();

function Render() {
  useVerifyAdmin();
  const canUpload = useCanUpload();

  return (
    <>
      <Outlet />
      {canUpload ? (
        <>
          <UploadFormModal />
          <EditFormModal />
        </>
      ) : null}
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
