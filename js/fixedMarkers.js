import { MARKER_TYPES, MARKER_TYPES_BY_ID, PIN_ICONS } from "./constants.js";

// Fixed markers state - separate from user markers
let fixedState = [];
let fixedMarkersLayer = null;

// Visibility state for each fixed marker type
const visibilityState = {
  spawn: true,
  "metro-entrance": true,
  "security-breach": true,
  "weapon-case": true,
  metro: true,
  elevator: true,
  "raider-hatch": true,
  "locked-room": true,
};

// Fixed marker types (everything except custom and route)
export const FIXED_MARKER_TYPES = [
  "spawn",
  "metro-entrance",
  "security-breach",
  "weapon-case",
  "metro",
  "elevator",
  "raider-hatch",
  "locked-room",
];

// Initialize with Leaflet layer
export function initFixedMarkers(layerGroup) {
  fixedMarkersLayer = layerGroup;
}

// Toggle visibility for a marker type
export function toggleMarkerTypeVisibility(markerType) {
  if (visibilityState.hasOwnProperty(markerType)) {
    visibilityState[markerType] = !visibilityState[markerType];
    renderFixedMarkers();
    return visibilityState[markerType];
  }
  return true;
}

// Get visibility state for a marker type
export function isMarkerTypeVisible(markerType) {
  return visibilityState[markerType] !== false;
}

// Show all marker types
export function showAllMarkerTypes() {
  for (const markerType of FIXED_MARKER_TYPES) {
    visibilityState[markerType] = true;
  }
  renderFixedMarkers();
}

// Hide all marker types
export function hideAllMarkerTypes() {
  for (const markerType of FIXED_MARKER_TYPES) {
    visibilityState[markerType] = false;
  }
  renderFixedMarkers();
}

// Get current fixed state
export function getFixedState() {
  return fixedState;
}

// Set fixed state (used when loading from file)
export function setFixedState(newState) {
  fixedState = newState;
}

// Clear fixed state
export function clearFixedState() {
  fixedState = [];
}

// Render fixed markers
export function renderFixedMarkers() {
  if (!fixedMarkersLayer) return;

  fixedMarkersLayer.clearLayers();

  // Draw all visible fixed markers
  fixedState.forEach(([typeId, lat, lng]) => {
    const latlng = L.latLng(lat, lng);
    const markerType = MARKER_TYPES_BY_ID[typeId];

    // Skip if this marker type is hidden
    if (!visibilityState[markerType]) return;

    const icon = PIN_ICONS[markerType] || undefined;
    const markerOptions = icon ? { icon } : undefined;
    const marker = L.marker(latlng, markerOptions).addTo(fixedMarkersLayer);
    marker.isFixed = true; // Mark as non-deletable
    marker.markerType = markerType;
    
    // Attach click handler if available
    if (window._fixedMarkerClickHandler) {
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        window._fixedMarkerClickHandler(marker, e);
      });
    }
  });

  // Add hover effects to all fixed markers after rendering
  setTimeout(() => {
    fixedMarkersLayer.eachLayer((layer) => {
      const element = layer.getElement && layer.getElement();
      if (element) {
        // Set transform origin to center for proper scaling
        element.style.transformOrigin = "center center";
        
        element.addEventListener("mouseenter", function() {
          if (document.querySelector(".leaflet-container.route-mode-active")) {
            const currentTransform = this.style.transform || "";
            if (!currentTransform.includes("scale")) {
              this.style.transform = currentTransform + " scale(1.1)";
            }
            this.style.zIndex = "1000";
          }
        });
        element.addEventListener("mouseleave", function() {
          const currentTransform = this.style.transform || "";
          this.style.transform = currentTransform.replace(/\s*scale\([^)]*\)/g, "");
          this.style.zIndex = "";
        });
      }
    });
  }, 0);
}

// Add fixed marker
export function addFixedMarker(latlng, markerType) {
  const typeId = MARKER_TYPES[markerType];
  if (typeId === undefined) return;
  
  const lat = Math.round(latlng.lat * 100) / 100;
  const lng = Math.round(latlng.lng * 100) / 100;
  
  fixedState.push([typeId, lat, lng]);
  renderFixedMarkers();
}

// Remove last fixed marker (for undo in admin mode)
export function undoLastFixedMarker() {
  if (fixedState.length > 0) {
    fixedState.pop();
    renderFixedMarkers();
  }
}

// Load fixed markers from JSON file
export async function loadFixedMarkers(mapId) {
  try {
    const response = await fetch(`assets/fixed-markers/${mapId}.json`);
    if (!response.ok) {
      console.warn(`No fixed markers file found for ${mapId}`);
      fixedState = [];
      renderFixedMarkers();
      return;
    }

    const data = await response.json();
    
    if (!Array.isArray(data)) {
      console.warn(`Invalid fixed markers data for ${mapId}`);
      fixedState = [];
      renderFixedMarkers();
      return;
    }

    // Validate entries
    const validState = [];
    for (const entry of data) {
      if (!Array.isArray(entry) || entry.length !== 3) continue;
      const [typeId, lat, lng] = entry;
      if (
        typeof typeId !== "number" ||
        typeof lat !== "number" ||
        typeof lng !== "number"
      ) {
        continue;
      }
      if (!MARKER_TYPES_BY_ID[typeId]) continue;
      validState.push([typeId, lat, lng]);
    }

    fixedState = validState;
    renderFixedMarkers();
  } catch (err) {
    console.warn(`Failed to load fixed markers for ${mapId}:`, err);
    fixedState = [];
    renderFixedMarkers();
  }
}

// Download fixed markers as JSON file (for admin mode)
export function downloadFixedMarkers(mapId) {
  const json = JSON.stringify(fixedState, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = `${mapId}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Check if marker type is fixed
export function isFixedMarkerType(markerType) {
  return FIXED_MARKER_TYPES.includes(markerType);
}

