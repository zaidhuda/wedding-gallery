// ===== CONFIGURATION =====
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const BASE_URL = isLocalhost
    ? 'http://localhost:8787'
    : 'https://wedding-gallery.zaidhuda.workers.dev';
const WORKER_URL = `${BASE_URL}/api`;

const GUEST_PASSWORD = 'ZM2026';
const STORAGE_KEY = 'wedding_gallery_access';

// Admin state - will be set after verification
let isAdmin = false;

// Check URL param first, then localStorage
const urlParams = new URLSearchParams(window.location.search);
const urlPassword = urlParams.get('pass');
const storedPassword = localStorage.getItem(STORAGE_KEY);
const hasValidPassword = urlPassword === GUEST_PASSWORD || storedPassword === GUEST_PASSWORD;

// Save to localStorage if valid password in URL
if (urlPassword === GUEST_PASSWORD) {
    localStorage.setItem(STORAGE_KEY, GUEST_PASSWORD);
}

// ===== EXPIRATION & TEST MODE =====
// After March 1, 2026: Gallery becomes static (no uploads)
const isExpired = new Date() > new Date('2026-03-01');
// Test mode bypasses date validation for production testing
const isTestMode = urlParams.get('mode') === 'test';

// Wedding event dates for smart-sort (February 2026)
const WEDDING_DATES = {
    7: 'Ijab & Qabul',   // Night
    8: 'Sanding',        // Grandeur
    14: 'Tandang'        // Journey
};

const PHOTOS_PER_PAGE = 12;

const EVENT_CONFIG = {
    'Ijab & Qabul': { theme: 'ijab', section: 'section-night', gallery: 'gallery-ijab', label: 'Night' },
    'Sanding': { theme: 'sanding', section: 'section-grandeur', gallery: 'gallery-sanding', label: 'Grandeur' },
    'Tandang': { theme: 'tandang', section: 'section-journey', gallery: 'gallery-tandang', label: 'Journey' }
};

// Pagination state for each gallery
const galleryState = {
    'Ijab & Qabul': { offset: 0, hasMore: true, loading: false },
    'Sanding': { offset: 0, hasMore: true, loading: false },
    'Tandang': { offset: 0, hasMore: true, loading: false }
};

let currentEventTag = null;
let selectedFile = null;

// ===== UTILITY FUNCTIONS =====
function applyTheme(theme) {
    // Remove existing theme classes but preserve other classes (like is-admin)
    document.body.classList.remove('theme-ijab', 'theme-sanding', 'theme-tandang');
    document.body.classList.add(`theme-${theme}`);
}

function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

// Check if browser supports WebP encoding
function supportsWebP() {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
}

// Cache the result since it won't change during session
const webpSupported = supportsWebP();

// ===== ADMIN VERIFICATION =====
// Check if current user is authenticated via Cloudflare Access
async function verifyAdminAccess() {
    try {
        const response = await fetch(`${BASE_URL}/admin/verify`, {
            credentials: 'include' // Include Cloudflare Access cookies
        });

        if (response.ok) {
            const data = await response.json();
            if (data.authenticated) {
                isAdmin = true;
                document.body.classList.add('is-admin');
                console.log(`Admin mode enabled: ${data.email}`);
                return true;
            }
        }
    } catch (error) {
        // Silently fail - user is not admin
        console.log('Admin verification failed (not authenticated)');
    }
    return false;
}

// Unapprove a photo (admin only)
async function unapprovePhoto(photoId) {
    if (!isAdmin) return;

    try {
        const response = await fetch(`${BASE_URL}/admin/unapprove`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ id: photoId })
        });

        if (response.ok) {
            // Remove the photo card from DOM immediately
            const card = document.querySelector(`.photo-card[data-photo-id="${photoId}"]`);
            if (card) {
                card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                card.style.opacity = '0';
                card.style.transform = 'scale(0.9)';
                setTimeout(() => card.remove(), 300);
            }
            console.log(`Photo ${photoId} unapproved`);
        } else {
            console.error('Failed to unapprove photo');
        }
    } catch (error) {
        console.error('Unapprove error:', error);
    }
}

// Make unapprove function globally accessible for onclick handlers
window.unapprovePhoto = unapprovePhoto;

// ===== EXIF METADATA EXTRACTION =====
// Extract original photo timestamp with smart fallbacks
async function extractPhotoTimestamp(file) {
    try {
        // Priority 1: Try to get EXIF DateTimeOriginal
        if (typeof ExifReader !== 'undefined') {
            const arrayBuffer = await file.arrayBuffer();
            const tags = ExifReader.load(arrayBuffer);

            if (tags.DateTimeOriginal && tags.DateTimeOriginal.description) {
                // EXIF format: "2026:02:07 14:42:30" → parse to ISO
                const exifDate = tags.DateTimeOriginal.description;
                const [datePart, timePart] = exifDate.split(' ');
                const [year, month, day] = datePart.split(':');
                const isoString = `${year}-${month}-${day}T${timePart}`;
                const parsed = new Date(isoString);

                if (!isNaN(parsed.getTime())) {
                    console.log('Using EXIF DateTimeOriginal:', isoString);
                    return parsed.toISOString();
                }
            }
        }
    } catch (e) {
        console.warn('EXIF extraction failed:', e);
    }

    // Priority 2: File's lastModified date
    if (file.lastModified) {
        const lastModified = new Date(file.lastModified);
        if (!isNaN(lastModified.getTime())) {
            console.log('Using file lastModified:', lastModified.toISOString());
            return lastModified.toISOString();
        }
    }

    // Priority 3: Current timestamp (absolute fallback)
    console.log('Using current timestamp as fallback');
    return new Date().toISOString();
}

// ===== SMART-SORT DATE VALIDATION =====
// Validates photo date and assigns to correct event bucket
function validatePhotoDate(takenAtISO) {
    const photoDate = new Date(takenAtISO);
    const year = photoDate.getFullYear();
    const month = photoDate.getMonth(); // 0-indexed (1 = February)
    const day = photoDate.getDate();

    // Check if photo is from February 2026 and on a valid wedding date
    if (year === 2026 && month === 1 && WEDDING_DATES[day]) {
        return { valid: true, eventTag: WEDDING_DATES[day] };
    }

    return { valid: false, eventTag: null };
}

// ===== MODERATION REJECTION NOTIFICATION =====
function showModerationRejection(message) {
    const overlay = document.createElement('div');
    overlay.className = 'rejection-overlay';
    overlay.innerHTML = `
        <div class="rejection-popup">
            <div class="rejection-icon" style="color: #dc2626;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M15 9l-6 6M9 9l6 6"/>
                </svg>
            </div>
            <p class="rejection-message" style="color: #dc2626;">
                Oops!
            </p>
            <p class="rejection-cta">
                ${message || "Your message contains content that doesn't match the wedding vibe. Please try a different caption!"}
            </p>
            <button class="rejection-close">Try Again</button>
        </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    const closePopup = () => {
        overlay.classList.remove('visible');
        setTimeout(() => overlay.remove(), 300);
    };

    overlay.querySelector('.rejection-close').addEventListener('click', closePopup);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePopup();
    });
}

// ===== UPLOAD SUCCESS NOTIFICATION =====
function showUploadSuccess(autoApproved = false) {
    const overlay = document.createElement('div');
    overlay.className = 'rejection-overlay';

    // Different messages based on auto-approval status
    const title = autoApproved ? 'Success!' : 'Thank you!';
    const message = autoApproved
        ? 'Your photo is now in the gallery. Scroll down to see it!'
        : 'Your photo has been sent to the couple for a quick look before it goes live.';
    const iconColor = autoApproved ? '#16a34a' : 'var(--ink-navy)';

    overlay.innerHTML = `
        <div class="rejection-popup">
            <div class="rejection-icon" style="color: ${iconColor};">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M9 12l2 2 4-4"/>
                    <circle cx="12" cy="12" r="10"/>
                </svg>
            </div>
            <p class="rejection-message" style="color: ${iconColor};">
                ${title}
            </p>
            <p class="rejection-cta">
                ${message}
            </p>
            <button class="rejection-close">${autoApproved ? 'Awesome!' : 'Got it'}</button>
        </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('visible'));

    const closePopup = () => {
        overlay.classList.remove('visible');
        setTimeout(() => overlay.remove(), 300);
    };

    overlay.querySelector('.rejection-close').addEventListener('click', closePopup);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePopup();
    });

    // Auto-close after 5 seconds (longer for auto-approved to give time to read)
    setTimeout(closePopup, autoApproved ? 4000 : 5000);
}

// ===== REJECTION POPUP =====
function showRejectionPopup() {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'rejection-overlay';
    overlay.innerHTML = `
        <div class="rejection-popup">
            <div class="rejection-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
                    <path d="M12 11v4M12 17h.01"/>
                </svg>
            </div>
            <p class="rejection-message">
                This photo doesn't seem to be from our wedding dates
                <span class="rejection-dates">(Feb 7, 8, or 14)</span>
            </p>
            <p class="rejection-cta">Please pick a memory from the celebrations!</p>
            <button class="rejection-close">Got it</button>
        </div>
    `;

    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => overlay.classList.add('visible'));

    // Close handlers
    const closePopup = () => {
        overlay.classList.remove('visible');
        setTimeout(() => overlay.remove(), 300);
    };

    overlay.querySelector('.rejection-close').addEventListener('click', closePopup);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePopup();
    });
}

// ===== TEST MODE EVENT SELECTOR =====
function showTestModeSelector() {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'test-selector-overlay';
        overlay.innerHTML = `
            <div class="test-selector-popup">
                <div class="test-selector-header">
                    <span class="test-badge">TEST MODE</span>
                    <p class="test-title">Select Event Bucket</p>
                </div>
                <div class="test-selector-options">
                    <button class="test-option" data-event="Ijab & Qabul" data-label="Night">
                        <span class="test-option-emoji">🌙</span>
                        <span class="test-option-label">Night</span>
                        <span class="test-option-date">Feb 7</span>
                    </button>
                    <button class="test-option" data-event="Sanding" data-label="Grandeur">
                        <span class="test-option-emoji">👑</span>
                        <span class="test-option-label">Grandeur</span>
                        <span class="test-option-date">Feb 8</span>
                    </button>
                    <button class="test-option" data-event="Tandang" data-label="Journey">
                        <span class="test-option-emoji">🚗</span>
                        <span class="test-option-label">Journey</span>
                        <span class="test-option-date">Feb 14</span>
                    </button>
                </div>
                <button class="test-cancel">Cancel</button>
            </div>
        `;

        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('visible'));

        const closePopup = (result) => {
            overlay.classList.remove('visible');
            setTimeout(() => overlay.remove(), 300);
            resolve(result);
        };

        overlay.querySelectorAll('.test-option').forEach(btn => {
            btn.addEventListener('click', () => {
                closePopup({
                    eventTag: btn.dataset.event,
                    label: btn.dataset.label
                });
            });
        });

        overlay.querySelector('.test-cancel').addEventListener('click', () => closePopup(null));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closePopup(null);
        });
    });
}

async function resizeImage(file, statusCallback = null) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                let { width, height } = img;
                const maxDimension = 4000;
                const maxPixels = 12_000_000;

                if (width > maxDimension || height > maxDimension) {
                    const scale = maxDimension / Math.max(width, height);
                    width *= scale;
                    height *= scale;
                }

                if (width * height > maxPixels) {
                    const scale = Math.sqrt(maxPixels / (width * height));
                    width = Math.floor(width * scale);
                    height = Math.floor(height * scale);
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);

                // Determine format based on browser support
                const format = webpSupported ? 'image/webp' : 'image/jpeg';
                const extension = webpSupported ? '.webp' : '.jpg';

                // Show status for WebP conversion (can take a moment for large images)
                if (statusCallback) {
                    statusCallback(webpSupported
                        ? 'Creating high-quality WebP memory...'
                        : 'Optimizing your photo...');
                }

                canvas.toBlob(
                    blob => blob
                        ? resolve({ blob, format, extension })
                        : reject(new Error('Failed to convert')),
                    format,
                    0.8
                );
            };
            img.onerror = reject;
            img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ===== PHOTO LOADING WITH PAGINATION =====
async function loadPhotosForEvent(eventTag, append = false) {
    const config = EVENT_CONFIG[eventTag];
    if (!config) return;

    const state = galleryState[eventTag];
    if (state.loading) return;

    const gallery = document.getElementById(config.gallery);

    // If not appending, reset state and show loading
    if (!append) {
        state.offset = 0;
        state.hasMore = true;
        gallery.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <p style="opacity: 0.4; font-size: 0.85rem;">Loading memories...</p>
            </div>
        `;
    } else {
        // Remove the "Load More" card before fetching
        const loadMoreCard = gallery.querySelector('.load-more-card');
        if (loadMoreCard) {
            loadMoreCard.classList.add('loading');
        }
    }

    state.loading = true;

    try {
        const url = `${WORKER_URL}/photos?eventTag=${encodeURIComponent(eventTag)}&limit=${PHOTOS_PER_PAGE}&offset=${state.offset}`;
        const response = await fetch(url);

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        const photos = data.photos || [];
        state.hasMore = data.hasMore;
        state.offset += photos.length;

        if (append) {
            appendPhotos(photos, gallery, eventTag, state.hasMore);
        } else {
            renderPhotos(photos, gallery, eventTag, state.hasMore);
        }
    } catch (error) {
        console.error(`Error loading ${eventTag}:`, error);
        if (!append) {
            gallery.innerHTML = `
                <div class="empty-state">
                    <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M12 8v4M12 16h.01"/>
                    </svg>
                    <p class="empty-state-title">Unable to load</p>
                    <p class="empty-state-text">Please refresh to try again</p>
                </div>
            `;
        }
    } finally {
        state.loading = false;
    }
}

// Add Cloudflare Image Resizing params for optimal format delivery
function getOptimizedImageUrl(url) {
    if (!url) return url;
    // For Cloudflare Image Resizing: format=auto serves WebP/AVIF based on browser support
    // Only apply to production URLs (not localhost)
    if (url.includes('workers.dev') || url.includes('zaidhuda.com')) {
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}format=auto`;
    }
    return url;
}

// Format timestamp for film stamp display (e.g., "8:42 PM")
function formatFilmTimestamp(isoString) {
    if (!isoString) return null;
    try {
        const date = new Date(isoString);
        if (isNaN(date.getTime())) return null;

        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    } catch {
        return null;
    }
}

function createPhotoCard(photo, eventTag = null) {
    const hasCaption = photo.name || photo.message;
    const card = document.createElement('div');
    card.className = `photo-card${hasCaption ? '' : ' no-caption'}`;
    card.setAttribute('data-photo-id', photo.id);

    const optimizedUrl = getOptimizedImageUrl(photo.url);
    const filmTime = formatFilmTimestamp(photo.taken_at);

    // Determine theme class for film stamp color based on eventTag
    let filmStampClass = 'film-stamp';
    if (eventTag || photo.eventTag) {
        const tag = eventTag || photo.eventTag;
        if (tag === 'Ijab & Qabul') filmStampClass += ' film-stamp-night';
        else if (tag === 'Sanding') filmStampClass += ' film-stamp-grandeur';
        else if (tag === 'Tandang') filmStampClass += ' film-stamp-journey';
    }

    card.innerHTML = `
        <div class="photo-item">
            <img src="${optimizedUrl}" alt="Memory shared by ${photo.name || 'Guest'}" loading="lazy">
            <button onclick="unapprovePhoto(${photo.id})" class="unapprove-btn" title="Remove from gallery">✕</button>
        </div>
        <div class="photo-caption">
            ${filmTime ? `<span class="${filmStampClass}">${filmTime}</span>` : ''}
            ${photo.name ? `<p class="photo-name">${photo.name}</p>` : ''}
            ${photo.message ? `<p class="photo-message">"${photo.message}"</p>` : ''}
        </div>
    `;
    return card;
}

function createLoadMoreCard(eventTag) {
    const card = document.createElement('div');
    card.className = 'photo-card load-more-card visible';
    card.dataset.eventTag = eventTag;

    card.innerHTML = `
        <div class="load-more-content">
            <div class="load-more-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M12 5v14M5 12h14" stroke-linecap="round"/>
                </svg>
            </div>
            <p class="load-more-text">See more memories</p>
            <div class="load-more-spinner">
                <div class="loading-spinner"></div>
            </div>
        </div>
    `;

    card.addEventListener('click', () => {
        if (!card.classList.contains('loading')) {
            loadPhotosForEvent(eventTag, true);
        }
    });

    return card;
}

function renderPhotos(photos, gallery, eventTag, hasMore) {
    if (!photos || photos.length === 0) {
        gallery.innerHTML = `
            <div class="empty-state">
                <svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <rect x="3" y="3" width="18" height="18" rx="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <path d="M21 15l-5-5L5 21"/>
                </svg>
                <p class="empty-state-title">No memories yet</p>
                <p class="empty-state-text">Be the first to share a moment</p>
            </div>
        `;
        return;
    }

    gallery.innerHTML = '';

    photos.forEach((photo) => {
        gallery.appendChild(createPhotoCard(photo, eventTag));
    });

    // Add "Load More" card if there are more photos
    if (hasMore) {
        gallery.appendChild(createLoadMoreCard(eventTag));
    }

    // Setup scroll-in entrance animations
    setupPhotoEntranceObserver(gallery);
}

function appendPhotos(photos, gallery, eventTag, hasMore) {
    // Remove existing "Load More" card
    const existingLoadMore = gallery.querySelector('.load-more-card');
    if (existingLoadMore) {
        existingLoadMore.remove();
    }

    // Create a fragment for new photos
    const fragment = document.createDocumentFragment();
    const newCards = [];

    photos.forEach((photo) => {
        const card = createPhotoCard(photo, eventTag);
        newCards.push(card);
        fragment.appendChild(card);
    });

    // Add "Load More" card if there are more photos
    if (hasMore) {
        fragment.appendChild(createLoadMoreCard(eventTag));
    }

    // Append all new content
    gallery.appendChild(fragment);

    // Setup entrance animations for new cards only
    setupPhotoEntranceObserver(gallery, newCards);
}

// ===== PHOTO ENTRANCE ANIMATION =====
function setupPhotoEntranceObserver(gallery, specificCards = null) {
    const photoCards = specificCards || gallery.querySelectorAll('.photo-card:not(.visible)');

    const entranceObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Add visible class for fade-in + slide-up
                entry.target.classList.add('visible');
                // Stop observing once visible
                entranceObserver.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px' // Trigger slightly before fully in view
    });

    photoCards.forEach(card => entranceObserver.observe(card));
}

// ===== UPLOAD FUNCTIONALITY =====
async function uploadPhoto(file, name, message, eventTag) {
    const uploadBtn = document.getElementById('uploadBtn');
    const originalText = uploadBtn.textContent;

    try {
        uploadBtn.disabled = true;
        uploadBtn.textContent = 'Reading photo data...';

        // Get password from URL or localStorage
        const currentPassword = urlParams.get('pass') || localStorage.getItem(STORAGE_KEY);
        if (currentPassword !== GUEST_PASSWORD) {
            throw new Error('Valid access required');
        }

        // Extract photo timestamp from EXIF (non-blocking, runs before canvas processing)
        const takenAt = await extractPhotoTimestamp(file);

        // Resize and compress with status updates
        const { blob, format, extension } = await resizeImage(file, (status) => {
            uploadBtn.textContent = status;
        });

        uploadBtn.textContent = 'Sharing...';

        const formData = new FormData();
        formData.append('image', blob, `${generateUUID()}${extension}`);
        formData.append('name', name || 'Anonymous');
        formData.append('message', message || '');
        formData.append('eventTag', eventTag);
        formData.append('pass', currentPassword);
        formData.append('format', format); // Send format to worker
        formData.append('takenAt', takenAt); // Send original photo timestamp

        const response = await fetch(`${WORKER_URL}/upload`, { method: 'POST', body: formData });
        const result = await response.json().catch(() => ({ error: 'Upload failed' }));

        if (!response.ok) {
            // Check if it's a text moderation rejection (400 with specific code)
            if (response.status === 400 && result.code === 'TEXT_MODERATION_FAILED') {
                showModerationRejection(result.error);
                return;
            }
            throw new Error(result.error || 'Upload failed');
        }
        const autoApproved = result.autoApproved || false;

        closeModal();
        document.getElementById('photoForm').reset();
        document.getElementById('uploadPreview').innerHTML = `
            <svg class="upload-zone-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="M21 15l-5-5L5 21"/>
            </svg>
            <p class="upload-zone-text">Tap to select a photo</p>
        `;

        // Show success notification with approval status
        showUploadSuccess(autoApproved);

        // If auto-approved, refresh the gallery to show the new photo
        if (autoApproved) {
            await loadPhotosForEvent(eventTag, false);
        }
    } catch (error) {
        console.error('Upload error:', error);
        alert(`Unable to share: ${error.message}`);
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = originalText;
    }
}

// ===== MODAL CONTROL =====
function openModal(eventTag) {
    const config = EVENT_CONFIG[eventTag];
    if (!config) return;

    currentEventTag = eventTag;
    document.getElementById('hiddenEventTag').value = eventTag;
    document.getElementById('eventIndicator').textContent = config.label;
    document.getElementById('uploadModal').classList.add('visible');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    document.getElementById('uploadModal').classList.remove('visible');
    document.body.style.overflow = '';
    document.getElementById('hiddenFileInput').value = '';
    selectedFile = null;
}

// ===== SCROLL & NAVIGATION =====
function setupScrollObserver() {
    const sections = document.querySelectorAll('.gallery-section');
    const sectionTitles = document.querySelectorAll('.section-title');
    const navItems = document.querySelectorAll('.nav-item');

    let ticking = false;

    function updateActiveSection() {
        // Find the section title closest to (but below or at) the top of viewport
        // This creates a "sticky" feel - section activates when its title reaches top
        let activeSection = null;
        let bestPosition = -Infinity;

        sectionTitles.forEach(title => {
            const section = title.closest('.gallery-section');
            const rect = title.getBoundingClientRect();

            // Title is "active" if it has scrolled past or is near the top of viewport
            // We pick the one whose top is closest to (but not too far above) viewport top
            // Trigger zone: from 200px above viewport top to 60% down the viewport
            const triggerTop = -200;
            const triggerBottom = window.innerHeight * 0.6;

            if (rect.top <= triggerBottom && rect.top > bestPosition && rect.top >= triggerTop) {
                bestPosition = rect.top;
                activeSection = section;
            }
        });

        // If no title in trigger zone, find the one most recently scrolled past
        if (!activeSection) {
            sectionTitles.forEach(title => {
                const section = title.closest('.gallery-section');
                const rect = title.getBoundingClientRect();

                // Pick the title that's above viewport but closest to it
                if (rect.top < 0 && rect.top > bestPosition) {
                    bestPosition = rect.top;
                    activeSection = section;
                }
            });
        }

        // Fallback: if still no active section (at hero/top), use first section
        if (!activeSection && sections.length > 0) {
            activeSection = sections[0];
        }

        if (activeSection) {
            const theme = activeSection.dataset.theme;
            const event = activeSection.dataset.event;

            if (currentEventTag !== event) {
                applyTheme(theme);
                currentEventTag = event;

                navItems.forEach(item => {
                    item.classList.toggle('active', item.dataset.event === event);
                });
            }
        }

        ticking = false;
    }

    function onScroll() {
        if (!ticking) {
            requestAnimationFrame(updateActiveSection);
            ticking = true;
        }
    }

    window.addEventListener('scroll', onScroll, { passive: true });

    // Initial check on load
    updateActiveSection();
}

// ===== SETUP UPLOAD BUTTON =====
function setupUploadButton() {
    const uploadCta = document.getElementById('uploadCta');
    const hiddenFileInput = document.getElementById('hiddenFileInput');
    const uploadModal = document.getElementById('uploadModal');

    // If expired (after March 1, 2026), completely remove upload UI from DOM
    if (isExpired) {
        if (uploadCta) uploadCta.remove();
        if (hiddenFileInput) hiddenFileInput.remove();
        if (uploadModal) uploadModal.remove();

        // Add class to body for CSS adjustments
        document.body.classList.add('gallery-only');
        return;
    }

    // Test mode or valid password shows upload button
    // Smart-sort validation happens when file is selected
    const shouldShow = isTestMode || hasValidPassword;
    uploadCta.classList.toggle('hidden', !shouldShow);
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    // Check admin status (non-blocking)
    verifyAdminAccess();

    // Load all galleries
    Object.keys(EVENT_CONFIG).forEach(eventTag => loadPhotosForEvent(eventTag, false));

    // Setup scroll observer
    setupScrollObserver();

    // Setup upload button
    setupUploadButton();

    // Navigation clicks
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const sectionId = item.dataset.section;
            document.getElementById(sectionId).scrollIntoView({ behavior: 'smooth' });
        });
    });

    // Upload CTA click
    document.getElementById('uploadCta').addEventListener('click', () => {
        document.getElementById('hiddenFileInput').click();
    });

    // Hidden file input change - Smart-Sort Logic
    document.getElementById('hiddenFileInput').addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;

        // Extract photo timestamp for validation
        const takenAt = await extractPhotoTimestamp(file);
        let eventTag;

        // TEST MODE: Bypass date validation, show manual selector
        if (isTestMode) {
            const selection = await showTestModeSelector();
            if (!selection) {
                // User cancelled
                e.target.value = '';
                return;
            }
            eventTag = selection.eventTag;
        } else {
            // PRODUCTION MODE: Smart-sort based on photo date
            const validation = validatePhotoDate(takenAt);

            if (!validation.valid) {
                // Photo is not from wedding dates - show rejection popup
                showRejectionPopup();
                e.target.value = '';
                return;
            }

            eventTag = validation.eventTag;
        }

        // Open modal with the determined event
        openModal(eventTag);

        // Show preview (uncropped)
        const reader = new FileReader();
        reader.onload = evt => {
            document.getElementById('uploadPreview').innerHTML = `
                <div class="upload-preview">
                    <img src="${evt.target.result}" alt="Preview">
                    <p class="upload-preview-hint">Your photo will appear exactly like this</p>
                </div>
            `;
        };
        reader.readAsDataURL(file);

        // Set file to form input and track it
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        document.getElementById('photoFile').files = dataTransfer.files;
        selectedFile = file;
    });

    // Upload zone click
    document.getElementById('uploadZone').addEventListener('click', () => {
        document.getElementById('photoFile').click();
    });

    // Photo file change in modal
    document.getElementById('photoFile').addEventListener('change', e => {
        const file = e.target.files[0];
        if (file) {
            selectedFile = file;
            const reader = new FileReader();
            reader.onload = evt => {
                document.getElementById('uploadPreview').innerHTML = `
                    <div class="upload-preview">
                        <img src="${evt.target.result}" alt="Preview">
                        <p class="upload-preview-hint">Your photo will appear exactly like this</p>
                    </div>
                `;
            };
            reader.readAsDataURL(file);
        } else {
            // If no file selected (cancelled), keep the previous file if it exists
            // Don't clear selectedFile here - let it persist
        }
    });

    // Form submission
    document.getElementById('photoForm').addEventListener('submit', async e => {
        e.preventDefault();
        const file = selectedFile || document.getElementById('photoFile').files[0];
        const name = document.getElementById('photoName').value.trim();
        const message = document.getElementById('photoMessage').value.trim();
        const eventTag = document.getElementById('hiddenEventTag').value;

        if (!file) {
            alert('Please select a photo');
            return;
        }
        if (!eventTag) {
            alert('Event not selected');
            return;
        }

        await uploadPhoto(file, name, message, eventTag);
    });

    // Modal close handlers
    document.getElementById('modalBackdrop').addEventListener('click', closeModal);
    document.getElementById('modalClose').addEventListener('click', closeModal);
});
