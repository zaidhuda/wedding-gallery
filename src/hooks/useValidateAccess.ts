import { STORED_LOCATION_VERIFIED, STORED_PASSWORD } from "./useLocalStorage";

const GUEST_PASSWORD = import.meta.env.VITE_GUEST_PASSWORD;

// ===== LOCATION VERIFICATION =====
const VENUE_LOCATIONS = [
  { lat: 2.454981839192229, lng: 102.06060997931948, name: "Venue 1" },
  { lat: 1.4819313372117824, lng: 103.93764464383543, name: "Venue 2" },
];
const VENUE_RADIUS_KM = 2;

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}

// Check if user is within 10km of either venue
function isNearVenue(userLat: number, userLng: number) {
  for (const venue of VENUE_LOCATIONS) {
    const distance = calculateDistance(userLat, userLng, venue.lat, venue.lng);
    if (distance <= VENUE_RADIUS_KM) {
      console.log(`User is ${distance.toFixed(2)}km from ${venue.name}`);
      return true;
    }
  }
  return false;
}

// Show location permission explanation using native confirm
function showLocationPrompt() {
  return confirm(
    "Are you at the celebration?\n\n" +
      "Share your location to skip the password.\n" +
      "(Or click Cancel to enter password instead)",
  );
}

// Verify location access - returns { success: boolean, reason: string }
async function verifyLocation(): Promise<{ success: boolean; reason: string }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      console.log("Geolocation not supported");
      resolve({ success: false, reason: "unsupported" });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const nearVenue = isNearVenue(latitude, longitude);

        if (nearVenue) {
          // Store verification in localStorage
          localStorage.setItem(STORED_LOCATION_VERIFIED, "true");
          console.log("Location verified: within venue range");
          resolve({ success: true, reason: "at_venue" });
        } else {
          console.log("Location verified: outside venue range");
          resolve({ success: false, reason: "too_far" });
        }
      },
      (error) => {
        console.log("Location permission denied or error:", error.message);
        resolve({ success: false, reason: "denied" });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000, // 5 minutes cache
      },
    );
  });
}

// Show password prompt using native browser prompt
function showPasswordPrompt(
  message = "Enter the password (check the QR code at your table):",
) {
  return prompt(message);
}

export default function useValidateAccess() {
  return async function validateAccess() {
    // Check if we already have a valid password in localStorage
    const savedPassword = localStorage.getItem(STORED_PASSWORD);
    if (savedPassword?.toLowerCase() === GUEST_PASSWORD.toLowerCase()) {
      return true;
    }

    // Check if location was previously verified
    const locationVerified = localStorage.getItem(STORED_LOCATION_VERIFIED);
    if (locationVerified === "true") {
      // Ensure password is stored for upload functionality
      if (!localStorage.getItem(STORED_PASSWORD)) {
        localStorage.setItem(STORED_PASSWORD, GUEST_PASSWORD);
      }
      return true;
    }

    // Show location permission prompt
    const userWantsLocation = await showLocationPrompt();

    let passwordMessage =
      "Enter the password (check the QR code at your table):";

    if (userWantsLocation) {
      // Try location verification
      const result = await verifyLocation();
      if (result.success) {
        // Store password in localStorage so uploadPhoto() can use it
        localStorage.setItem(STORED_PASSWORD, GUEST_PASSWORD);
        return true;
      }
      // If user is too far from venue, customize the prompt message
      if (result.reason === "too_far") {
        passwordMessage =
          "Not at the venue?\n\nEnter the password (check the QR code at your table):";
      }
    }

    // Show password prompt
    const enteredPassword = showPasswordPrompt(passwordMessage);

    if (!enteredPassword) {
      // User cancelled
      return false;
    }

    if (enteredPassword.toLowerCase() === GUEST_PASSWORD.toLowerCase()) {
      // Valid password - store the exact constant (not user input) for server compatibility
      localStorage.setItem(STORED_PASSWORD, GUEST_PASSWORD);
      return true;
    } else {
      // Invalid password - clear from localStorage and show error
      localStorage.removeItem(STORED_PASSWORD);
      alert(
        "Invalid password. Please check the QR code at your table for the correct password.",
      );
      return false;
    }
  };
}
