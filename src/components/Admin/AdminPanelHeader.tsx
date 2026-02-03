export default function AdminPanelHeader({
  photosCount,
  admin,
  isFetching,
  isPendingApprove,
  isPendingDelete,
  refetch,
  approveAllPhotos,
  deleteAllPhotos,
}: {
  photosCount: number;
  admin: string | null;
  isFetching: boolean;
  isPendingApprove: boolean;
  isPendingDelete: boolean;
  refetch: () => void;
  approveAllPhotos: () => void;
  deleteAllPhotos: () => void;
}) {
  return (
    <header className="sticky top-0 z-50 bg-zinc-900/95 backdrop-blur border-b border-zinc-800">
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <a href="/">
              <h1 className="text-lg font-semibold">Photo Approval</h1>
            </a>
            <span
              id="pendingCount"
              className="px-2.5 py-1 bg-amber-500/20 text-amber-400 rounded-full text-sm font-medium"
              aria-live="polite"
            >
              {photosCount || 0} pending
            </span>
          </div>
          <div>
            {admin && (
              <span id="adminEmail" className="text-zinc-500 text-sm sm:inline">
                {admin}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={refetch}
              disabled={isFetching}
              id="refreshBtn"
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              aria-label="Refresh pending photos"
            >
              {isFetching ? (
                <span className="animate-pulse">Refreshing...</span>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  Refresh
                </>
              )}
            </button>
            <button
              type="button"
              onClick={approveAllPhotos}
              id="approveAllBtn"
              className="btn-approve px-4 py-2 bg-green-600 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={photosCount === 0 || isPendingApprove}
              aria-label="Approve all pending photos"
              aria-busy={isPendingApprove}
            >
              {isPendingApprove ? (
                <span className="animate-pulse">Approving...</span>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Approve All
                </>
              )}
            </button>
            <button
              type="button"
              onClick={deleteAllPhotos}
              id="deleteAllBtn"
              className="btn-delete px-4 py-2 bg-red-600 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={photosCount === 0 || isPendingDelete}
              aria-label="Delete all pending photos"
              aria-busy={isPendingDelete}
            >
              {isPendingDelete ? (
                <span className="animate-pulse">Deleting...</span>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                  Delete All
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
