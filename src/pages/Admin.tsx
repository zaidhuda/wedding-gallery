import { useLayoutEffect } from 'react';
import { NavLink } from 'react-router';
import type { EventTitle } from '../constants';
import './Admin.css';

export default function Admin() {
  useLayoutEffect(() => {
    document.body.classList.toggle('bg-zinc-900');
    document.body.classList.toggle('text-zinc-100');
    document.body.classList.toggle('min-h-screen');

    return () => {
      document.body.classList.toggle('bg-zinc-900');
      document.body.classList.toggle('text-zinc-100');
      document.body.classList.toggle('min-h-screen');
    };
  }, []);

  useLayoutEffect(() => {
    // Only include credentials in production (for Cloudflare Access cookies)
    const fetchOptions = { credentials: 'include' as RequestCredentials };

    let pendingPhotos: any[] = [];

    // DOM Elements
    const loadingState = document.getElementById(
      'loadingState',
    ) as HTMLDivElement;
    const authError = document.getElementById('authError') as HTMLDivElement;
    const emptyState = document.getElementById('emptyState') as HTMLDivElement;
    const photoGrid = document.getElementById('photoGrid') as HTMLDivElement;
    const pendingCount = document.getElementById(
      'pendingCount',
    ) as HTMLSpanElement;
    const adminEmail = document.getElementById('adminEmail') as HTMLSpanElement;
    const approveAllBtn = document.getElementById(
      'approveAllBtn',
    ) as HTMLButtonElement;
    const deleteAllBtn = document.getElementById(
      'deleteAllBtn',
    ) as HTMLButtonElement;
    const refreshBtn = document.getElementById(
      'refreshBtn',
    ) as HTMLButtonElement;

    // Load photos on page load
    // Cloudflare Access handles authentication - the browser automatically sends the JWT cookie
    loadPendingPhotos();

    async function loadPendingPhotos() {
      loadingState.classList.remove('hidden');
      authError.classList.add('hidden');
      emptyState.classList.add('hidden');
      photoGrid.classList.add('hidden');

      try {
        const res = await fetch('/api/admin/pending', fetchOptions);

        if (res.status === 401) {
          loadingState.classList.add('hidden');
          authError.classList.remove('hidden');
          return;
        }

        if (!res.ok) throw new Error('Failed to load');

        const data = await res.json();
        pendingPhotos = data.photos || [];

        // Display admin email if available
        if (data.admin) {
          adminEmail.textContent = data.admin;
          adminEmail.classList.remove('hidden');
        }

        renderPhotos();
      } catch (err) {
        console.error('Load error:', err);
        loadingState.innerHTML = `
                    <div class="text-red-400" role="alert">Failed to load photos. <button onclick="loadPendingPhotos()" class="underline" aria-label="Retry loading photos">Retry</button></div>
                `;
      }
    }

    function renderPhotos() {
      loadingState.classList.add('hidden');

      pendingCount.textContent = `${pendingPhotos.length} pending`;
      approveAllBtn.disabled = pendingPhotos.length === 0;
      deleteAllBtn.disabled = pendingPhotos.length === 0;

      if (pendingPhotos.length === 0) {
        emptyState.classList.remove('hidden');
        photoGrid.classList.add('hidden');
        return;
      }

      emptyState.classList.add('hidden');
      photoGrid.classList.remove('hidden');

      photoGrid.innerHTML = pendingPhotos
        .map(
          (photo) => `
                <div class="photo-card bg-zinc-800 rounded-lg overflow-hidden border border-zinc-700" data-id="${photo.id}" role="listitem">
                    <div class="aspect-square bg-zinc-900 relative">
                        <img
                            src="${photo.url}"
                            alt="Photo submitted by ${escapeHtml(photo.name || 'Anonymous')}${photo.message ? ': ' + escapeHtml(photo.message) : ''}"
                            class="w-full h-full object-cover"
                            loading="lazy"
                        >
                        <span class="absolute top-2 left-2 px-2 py-0.5 bg-zinc-900/80 text-zinc-300 text-xs rounded" aria-label="Event category">
                            ${getEventLabel(photo.eventTag)}
                        </span>
                    </div>
                    <div class="p-3 space-y-2">
                        <div class="text-sm">
                            <p class="font-medium text-zinc-100 truncate">${escapeHtml(photo.name || 'Anonymous')}</p>
                            <p class="text-zinc-400 text-xs mt-1 line-clamp-2">“${escapeHtml(photo.message)}”</p>
                        </div>
                        <p class="text-zinc-500 text-xs" aria-label="Submitted on">${formatTimestamp(photo.timestamp)}</p>
                        <div class="flex gap-2 pt-1" role="group" aria-label="Photo actions">
                            <button
                                onclick="approvePhoto(${photo.id})"
                                class="flex-1 py-1.5 bg-green-600/20 hover:bg-green-600 text-green-400 hover:text-white rounded text-xs font-medium transition-colors"
                                aria-label="Approve photo by ${escapeHtml(photo.name || 'Anonymous')}"
                            >
                                Approve
                            </button>
                            <button
                                onclick="deletePhoto(${photo.id})"
                                class="flex-1 py-1.5 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white rounded text-xs font-medium transition-colors"
                                aria-label="Delete photo by ${escapeHtml(photo.name || 'Anonymous')}"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            `,
        )
        .join('');
    }

    function getEventLabel(eventTag: EventTitle) {
      const labels = {
        'Ijab & Qabul': 'Night',
        Sanding: 'Grandeur',
        Tandang: 'Journey',
      };
      return labels[eventTag] || eventTag;
    }

    function formatTimestamp(ts: string) {
      if (!ts) return '';
      const date = new Date(ts);
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    }

    function escapeHtml(text: string) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // async function approvePhoto(id: number) {
    //   await performAction('approve', [id]);
    // }

    // async function deletePhoto(id: number) {
    //   if (!confirm('Delete this photo permanently?')) return;
    //   await performAction('delete', [id]);
    // }

    async function performAction(action: string, ids: number[]) {
      const card =
        ids.length === 1
          ? document.querySelector(`[data-id="${ids[0]}"]`)
          : null;
      if (card) card.classList.add('loading', 'animate-pulse');

      try {
        const res = await fetch('/api/admin/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ids }),
          ...fetchOptions,
        });

        if (res.status === 401) {
          alert('Session expired. Please refresh the page.');
          location.reload();
          return;
        }

        if (!res.ok) throw new Error('Action failed');

        // Remove from local array
        pendingPhotos = pendingPhotos.filter((p) => !ids.includes(p.id));
        renderPhotos();
      } catch (err) {
        console.error('Action error:', err);
        alert('Action failed. Please try again.');
        if (card) card.classList.remove('loading', 'animate-pulse');
      }
    }

    // Bulk actions
    approveAllBtn.addEventListener('click', async () => {
      if (!confirm(`Approve all ${pendingPhotos.length} photos?`)) return;
      const ids = pendingPhotos.map((p) => p.id);
      approveAllBtn.disabled = true;
      approveAllBtn.setAttribute('aria-busy', 'true');
      approveAllBtn.innerHTML =
        '<span class="animate-pulse">Approving...</span>';
      await performAction('approve', ids);
      approveAllBtn.setAttribute('aria-busy', 'false');
      approveAllBtn.innerHTML = `
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
                Approve All
            `;
    });

    deleteAllBtn.addEventListener('click', async () => {
      if (
        !confirm(
          `DELETE all ${pendingPhotos.length} photos? This cannot be undone!`,
        )
      )
        return;
      const ids = pendingPhotos.map((p) => p.id);
      deleteAllBtn.disabled = true;
      deleteAllBtn.setAttribute('aria-busy', 'true');
      deleteAllBtn.innerHTML = '<span class="animate-pulse">Deleting...</span>';
      await performAction('delete', ids);
      deleteAllBtn.setAttribute('aria-busy', 'false');
      deleteAllBtn.innerHTML = `
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
                Delete All
            `;
    });

    refreshBtn.addEventListener('click', loadPendingPhotos);
  }, []);

  return (
    <div id="adminPanel" className="admin-panel">
      {/* <!-- Header --> */}
      <header
        className="sticky top-0 z-50 bg-zinc-900/95 backdrop-blur border-b border-zinc-800"
        role="banner"
      >
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <NavLink to="/">
                <h1 className="text-lg font-semibold">Photo Approval</h1>
              </NavLink>
              <span
                id="pendingCount"
                className="px-2.5 py-1 bg-amber-500/20 text-amber-400 rounded-full text-sm font-medium"
                role="status"
                aria-live="polite"
              >
                0 pending
              </span>
            </div>
            <div>
              <span
                id="adminEmail"
                className="text-zinc-500 text-sm hidden sm:inline"
                aria-label="Logged in as"
              ></span>
            </div>
            <div
              className="flex items-center gap-3"
              role="group"
              aria-label="Bulk actions"
            >
              <button
                id="refreshBtn"
                className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                aria-label="Refresh pending photos"
              >
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
              </button>
              <button
                id="approveAllBtn"
                className="btn-approve px-4 py-2 bg-green-600 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled
                aria-label="Approve all pending photos"
              >
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
              </button>
              <button
                id="deleteAllBtn"
                className="btn-delete px-4 py-2 bg-red-600 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled
                aria-label="Delete all pending photos"
              >
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
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* <!-- Content --> */}
      <main className="max-w-7xl mx-auto px-4 py-6" role="main">
        {/* <!-- Loading State --> */}
        <div
          id="loadingState"
          className="text-center py-20"
          role="status"
          aria-live="polite"
        >
          <div className="inline-flex items-center gap-3 text-zinc-400">
            <svg
              className="w-5 h-5 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            Loading pending photos...
          </div>
        </div>

        {/* <!-- Auth Error State --> */}
        <div id="authError" className="hidden text-center py-20" role="alert">
          <div className="inline-flex flex-col items-center gap-4">
            <svg
              className="w-16 h-16 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1"
                d="M12 15v2m0 0v2m0-2h2m-2 0H10m2-6V4m0 0L9 7m3-3l3 3"
              />
              <circle cx="12" cy="12" r="10" stroke-width="1" />
            </svg>
            <p className="text-zinc-300 text-lg">Authentication Required</p>
            <p className="text-zinc-500 text-sm max-w-md">
              This page is protected by Cloudflare Access. Please ensure you're
              signed in through your organization's identity provider.
            </p>
            <button
              onClick={() => location.reload()}
              className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors"
              aria-label="Retry authentication"
            >
              Retry
            </button>
          </div>
        </div>

        {/* <!-- Empty State --> */}
        <div id="emptyState" className="hidden text-center py-20" role="status">
          <div className="inline-flex flex-col items-center gap-4">
            <svg
              className="w-16 h-16 text-zinc-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-zinc-400 text-lg">All caught up!</p>
            <p className="text-zinc-500 text-sm">No photos pending approval</p>
          </div>
        </div>

        {/* <!-- Photo Grid --> */}
        <div
          id="photoGrid"
          className="hidden grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
          role="list"
          aria-label="Pending photos for approval"
        >
          {/* <!-- Cards rendered dynamically --> */}
        </div>
      </main>
    </div>
  );
}
