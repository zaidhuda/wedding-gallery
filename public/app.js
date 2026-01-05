// ===== CONFIGURATION =====
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const WORKER_URL = isLocalhost
    ? 'http://localhost:8787/api'
    : 'https://wedding-gallery.zaidhuda.workers.dev/api';

const validPasswords = ['N2026', 'S2026', 'T2026'];
const urlParams = new URLSearchParams(window.location.search);
const password = urlParams.get('pass');
const hasValidPassword = validPasswords.includes(password);
const debugMode = isLocalhost && (urlParams.get('debug') === 'true' || urlParams.get('test') === 'true');

const PHOTOS_PER_PAGE = 12;

const EVENT_CONFIG = {
    'Ijab & Qabul': {
        theme: 'ijab',
        section: 'section-night',
        gallery: 'gallery-ijab',
        label: 'Night',
        date: 'February 7, 2026',
        password: 'N2026'
    },
    'Sanding': {
        theme: 'sanding',
        section: 'section-grandeur',
        gallery: 'gallery-sanding',
        label: 'Grandeur',
        date: 'February 8, 2026',
        password: 'S2026'
    },
    'Tandang': {
        theme: 'tandang',
        section: 'section-journey',
        gallery: 'gallery-tandang',
        label: 'Journey',
        date: 'February 14, 2026',
        password: 'T2026'
    }
};

// Pagination state for each gallery
const galleryState = {
    'Ijab & Qabul': { offset: 0, hasMore: true, loading: false },
    'Sanding': { offset: 0, hasMore: true, loading: false },
    'Tandang': { offset: 0, hasMore: true, loading: false }
};

let currentEventTag = null;
let currentTheme = 'ijab';

// ===== UTILITY FUNCTIONS =====
function getDefaultEventTag() {
    if (!hasValidPassword) return 'Ijab & Qabul';
    const passwordMap = { 'N2026': 'Ijab & Qabul', 'S2026': 'Sanding', 'T2026': 'Tandang' };
    return passwordMap[password] || 'Ijab & Qabul';
}

function isEventDate() {
    if (!hasValidPassword) return false;
    if (debugMode || (isLocalhost && window.debugMode)) return true;

    const today = new Date();
    const todayDate = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
    const eventDates = {
        'N2026': new Date(Date.UTC(2026, 1, 7)),
        'S2026': new Date(Date.UTC(2026, 1, 8)),
        'T2026': new Date(Date.UTC(2026, 1, 14))
    };
    return eventDates[password] && todayDate.getTime() === eventDates[password].getTime();
}

function applyTheme(theme) {
    document.body.className = `theme-${theme}`;
    currentTheme = theme;
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

        const currentPassword = urlParams.get('pass');
        if (!currentPassword || !validPasswords.includes(currentPassword)) {
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

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Upload failed' }));
            throw new Error(error.error || 'Upload failed');
        }

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

        // Reset and reload the gallery for this event
        await loadPhotosForEvent(eventTag, false);
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
}

// ===== SCROLL & NAVIGATION =====
function setupScrollObserver() {
    const sections = document.querySelectorAll('.gallery-section');
    const navItems = document.querySelectorAll('.nav-item');

    // Track intersection ratios for all sections
    const sectionVisibility = new Map();

    const observer = new IntersectionObserver(entries => {
        // Update visibility map with latest intersection ratios
        entries.forEach(entry => {
            sectionVisibility.set(entry.target, entry.intersectionRatio);
        });

        // Find the section with the highest visibility
        let maxRatio = 0;
        let activeSection = null;

        sectionVisibility.forEach((ratio, section) => {
            if (ratio > maxRatio) {
                maxRatio = ratio;
                activeSection = section;
            }
        });

        // Apply theme for the most visible section (with minimum threshold)
        if (activeSection && maxRatio > 0.1) {
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
    }, { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0] });

    sections.forEach(section => observer.observe(section));
}

// ===== DEBUG PANEL =====
function setupDebugPanel() {
    if (!isLocalhost) return;

    const panel = document.createElement('div');
    panel.className = 'debug-panel';
    panel.innerHTML = `
        <div class="debug-panel-title">Debug</div>
        <button id="debugToggle" class="${debugMode ? 'active' : ''}">
            Debug: ${debugMode ? 'ON' : 'OFF'}
        </button>
        <button id="debugN" class="${password === 'N2026' ? 'active' : ''}">N2026</button>
        <button id="debugS" class="${password === 'S2026' ? 'active' : ''}">S2026</button>
        <button id="debugT" class="${password === 'T2026' ? 'active' : ''}">T2026</button>
    `;
    document.body.appendChild(panel);

    let debugEnabled = debugMode;
    window.debugMode = debugEnabled;

    document.getElementById('debugToggle').addEventListener('click', () => {
        debugEnabled = !debugEnabled;
        window.debugMode = debugEnabled;
        const btn = document.getElementById('debugToggle');
        btn.textContent = `Debug: ${debugEnabled ? 'ON' : 'OFF'}`;
        btn.classList.toggle('active', debugEnabled);

        const url = new URL(window.location);
        debugEnabled ? url.searchParams.set('debug', 'true') : url.searchParams.delete('debug');
        window.history.replaceState({}, '', url);

        setupUploadButton();
    });

    ['N', 'S', 'T'].forEach(code => {
        document.getElementById(`debug${code}`).addEventListener('click', () => {
            const url = new URL(window.location);
            url.searchParams.set('pass', `${code}2026`);
            if (debugEnabled) url.searchParams.set('debug', 'true');
            window.location.href = url.toString();
        });
    });
}

// ===== SETUP UPLOAD BUTTON =====
function setupUploadButton() {
    const uploadCta = document.getElementById('uploadCta');
    const shouldShow = hasValidPassword && (debugMode || isEventDate() || window.debugMode);
    uploadCta.classList.toggle('hidden', !shouldShow);
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
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

    // Hidden file input change
    document.getElementById('hiddenFileInput').addEventListener('change', e => {
        const file = e.target.files[0];
        if (file) {
            const eventTag = currentEventTag || getDefaultEventTag();
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

            // Set file to form input
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            document.getElementById('photoFile').files = dataTransfer.files;
        }
    });

    // Upload zone click
    document.getElementById('uploadZone').addEventListener('click', () => {
        document.getElementById('photoFile').click();
    });

    // Photo file change in modal
    document.getElementById('photoFile').addEventListener('change', e => {
        const file = e.target.files[0];
        if (file) {
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
        }
    });

    // Form submission
    document.getElementById('photoForm').addEventListener('submit', async e => {
        e.preventDefault();
        const file = document.getElementById('photoFile').files[0];
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

    // Debug panel
    setupDebugPanel();

    // Initial theme based on password
    if (hasValidPassword) {
        const defaultEvent = getDefaultEventTag();
        const config = EVENT_CONFIG[defaultEvent];
        if (config) {
            currentEventTag = defaultEvent;
            setTimeout(() => {
                document.getElementById(config.section).scrollIntoView({ behavior: 'smooth' });
            }, 500);
        }
    }
});
