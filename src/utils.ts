import { EVENTS, type EventTitle } from "./constants";
import { STORED_NAME } from "./hooks/useLocalStorage";

export function isAnonymous(name: string) {
  return name.toLowerCase() === "anonymous";
}

export function storeAndGetName(name?: string) {
  if (name && !isAnonymous(name)) {
    localStorage.setItem(STORED_NAME, name);
  }

  return localStorage.getItem(STORED_NAME) ?? "";
}

export function generateUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// Check if browser supports WebP encoding
function supportsWebP() {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL("image/webp").indexOf("data:image/webp") === 0;
}

const webpSupported = supportsWebP();

export async function resizeImage(
  file: File,
  statusCallback?: (status: string) => void,
): Promise<{
  blob: Blob;
  format: string;
  extension: string;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
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

        // VALIDATION: Min dimensions
        if (width < 200 || height < 200) {
          reject(
            new Error(
              "This photo is too small. Please pick a higher quality image (at least 200px).",
            ),
          );
          return;
        }

        // VALIDATION: Aspect ratio
        const ratio = width / height;
        if (ratio > 4 || ratio < 0.25) {
          reject(
            new Error(
              "This photo has an extreme aspect ratio. Please pick a standard photo.",
            ),
          );
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        (canvas.getContext("2d") as CanvasRenderingContext2D).drawImage(
          img,
          0,
          0,
          width,
          height,
        );

        // Determine format based on browser support
        const format = webpSupported ? "image/webp" : "image/jpeg";
        const extension = webpSupported ? ".webp" : ".jpg";

        // Show status for WebP conversion (can take a moment for large images)
        if (statusCallback) {
          statusCallback(
            webpSupported
              ? "Preparing your digital wish..."
              : "Optimizing your photo...",
          );
        }

        canvas.toBlob(
          (blob) =>
            blob
              ? resolve({ blob, format, extension, width, height })
              : reject(new Error("Failed to convert")),
          format,
          0.8,
        );
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function getEventTag(
  file: File,
  mode?: string | null,
  currentEventTag?: EventTitle,
) {
  const takenAt = await extractPhotoTimestamp(file);
  let eventTag = currentEventTag;

  if (mode === "test") {
    const selection = await showTestModeSelector();
    if (!selection) {
      return;
    }

    eventTag = selection.eventTag;
  } else {
    const validation = validatePhotoDate(takenAt);
    if (!validation.valid || !validation.eventTag) {
      alert(
        "This photo doesn't seem to be from our wedding dates!\n\n" +
          "Please pick a photo taken at 7th, 8th, or 14th of February.",
      );
      return;
    }

    eventTag = validation.eventTag;
  }

  return eventTag;
}

// ===== EXIF METADATA EXTRACTION =====
// Extract original photo timestamp with smart fallbacks
export async function extractPhotoTimestamp(file: File) {
  try {
    const ExifReader = await import("exifreader");

    // Priority 1: Try to get EXIF DateTimeOriginal
    if (typeof ExifReader !== "undefined") {
      const arrayBuffer = await file.arrayBuffer();
      const tags = ExifReader.load(arrayBuffer);

      if (tags.DateTimeOriginal?.description) {
        // EXIF format: "2026:02:07 14:42:30" → parse to ISO
        const exifDate = tags.DateTimeOriginal.description;
        const [datePart, timePart] = exifDate.split(" ");
        const [year, month, day] = datePart.split(":");
        const isoString = `${year}-${month}-${day}T${timePart}`;
        const parsed = new Date(isoString);

        if (!Number.isNaN(parsed.getTime())) {
          console.log("Using EXIF DateTimeOriginal:", isoString);
          return parsed.toISOString();
        }
      }
    }
  } catch (e) {
    console.warn("EXIF extraction failed:", e);
  }

  // Priority 2: File's lastModified date
  if (file.lastModified) {
    const lastModified = new Date(file.lastModified);
    if (!Number.isNaN(lastModified.getTime())) {
      console.log("Using file lastModified:", lastModified.toISOString());
      return lastModified.toISOString();
    }
  }

  // Priority 3: Current timestamp (absolute fallback)
  console.log("Using current timestamp as fallback");
  return new Date().toISOString();
}

// ===== SMART-SORT DATE VALIDATION =====
// Validates photo date and assigns to correct event bucket
export function validatePhotoDate(takenAtISO: string) {
  const photoDate = new Date(takenAtISO);
  const year = photoDate.getFullYear();
  const month = photoDate.getMonth(); // 0-indexed (1 = February)
  const day = photoDate.getDate();
  const event = EVENTS.find((e) => new Date(e.date).getDate() === day);

  // Check if photo is from February 2026 and on a valid wedding date
  if (year === 2026 && month === 1 && event) {
    return { valid: true, eventTag: event.title };
  }

  return { valid: false, eventTag: null };
}

// ===== TEST MODE EVENT SELECTOR =====
export function showTestModeSelector(): Promise<{
  eventTag: EventTitle;
  label: string;
} | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "test-selector-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "test-selector-title");
    overlay.innerHTML = `
            <div class="test-selector-popup">
                <div class="test-selector-header">
                    <span class="test-badge" aria-label="Test mode">TEST MODE</span>
                    <p class="test-title" id="test-selector-title">Select Event Bucket</p>
                </div>
                <div class="test-selector-options" role="group" aria-label="Event selection">
                    <button class="test-option" data-event="Ijab & Qabul" data-label="Ijab & Qabul" aria-label="Select Ijab & Qabul ceremony, February 7">
                        <span class="test-option-emoji" aria-hidden="true">🌙</span>
                        <span class="test-option-label">Ijab & Qabul</span>
                        <span class="test-option-date">Feb 7</span>
                    </button>
                    <button class="test-option" data-event="Sanding" data-label="Sanding" aria-label="Select Sanding ceremony, February 8">
                        <span class="test-option-emoji" aria-hidden="true">👑</span>
                        <span class="test-option-label">Sanding</span>
                        <span class="test-option-date">Feb 8</span>
                    </button>
                    <button class="test-option" data-event="Tandang" data-label="Tandang" aria-label="Select Tandang ceremony, February 14">
                        <span class="test-option-emoji" aria-hidden="true">🚗</span>
                        <span class="test-option-label">Tandang</span>
                        <span class="test-option-date">Feb 14</span>
                    </button>
                </div>
                <button class="test-cancel" aria-label="Cancel event selection">Cancel</button>
            </div>
        `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));

    const closePopup = (
      result: { eventTag: EventTitle; label: string } | null,
    ) => {
      overlay.classList.remove("visible");
      setTimeout(() => overlay.remove(), 300);
      resolve(result);
    };

    overlay.querySelectorAll(".test-option").forEach((btn) => {
      (btn as HTMLButtonElement).addEventListener("click", () => {
        closePopup({
          eventTag: (btn as HTMLButtonElement).dataset.event as EventTitle,
          label: (btn as HTMLButtonElement).dataset.label as string,
        });
      });
    });

    (overlay.querySelector(".test-cancel") as HTMLDivElement).addEventListener(
      "click",
      () => closePopup(null),
    );
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closePopup(null);
    });
  });
}
