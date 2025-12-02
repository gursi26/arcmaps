import { MARKER_TYPES, MARKER_TYPES_BY_ID, PIN_ICONS } from "./constants.js";
import { roundCoord } from "./urlState.js";

// Single unified state array: each entry is [typeId, lat, lng, note?]
// note is optional and can be undefined or a string
let state = [];

// Layer groups for rendering
let markersLayer = null;
let routeLayer = null;

// Visibility state for user-drawn marker types
const visibilityState = {
  custom: true,
  custom1: true,
  custom2: true,
  route: true,
  route1: true,
  route2: true,
};

// Initialize with Leaflet layers
export function initState(markersLayerGroup, routeLayerGroup) {
  markersLayer = markersLayerGroup;
  routeLayer = routeLayerGroup;
}

// Get current state array
export function getState() {
  return state;
}

// Set state array (used when loading from URL)
export function setState(newState) {
  state = newState;
}

// Clear all state
export function clearState() {
  state = [];
}

// Toggle visibility for a marker type
export function toggleMarkerVisibility(markerType) {
  if (visibilityState.hasOwnProperty(markerType)) {
    visibilityState[markerType] = !visibilityState[markerType];
    return visibilityState[markerType];
  }
  return true;
}

// Check if a marker type is visible
export function isMarkerVisible(markerType) {
  return visibilityState[markerType] !== false;
}

// Set note for a marker at specific index
export function setMarkerNote(index, note) {
  if (index >= 0 && index < state.length) {
    const entry = state[index];
    // Update or add note (4th element in tuple)
    if (note && note.trim()) {
      state[index] = [entry[0], entry[1], entry[2], note.trim()];
    } else {
      // Remove note if empty
      state[index] = [entry[0], entry[1], entry[2]];
    }
    renderState(window._markerClickHandler);
    if (window._triggerAutosave) window._triggerAutosave();
  }
}

// Get note for a marker at specific index
export function getMarkerNote(index) {
  if (index >= 0 && index < state.length) {
    return state[index][3] || null;
  }
  return null;
}

// Render all markers from state array
export function renderState(onMarkerClick = null) {
  if (!markersLayer || !routeLayer) return;

  markersLayer.clearLayers();
  routeLayer.clearLayers();

  // Define route colors
  const routeColors = {
    route: { line: "#e5e7eb", dot: "#fbbf24", dotBorder: "#facc15" },
    route1: { line: "#bfdbfe", dot: "#3b82f6", dotBorder: "#60a5fa" },
    route2: { line: "#fecaca", dot: "#ef4444", dotBorder: "#f87171" },
  };

  // Filter and draw route nodes for each route type
  ["route", "route1", "route2"].forEach(routeType => {
    // Only render if this route type is visible
    if (!isMarkerVisible(routeType)) return;
    
    const routeNodes = state
      .filter(([typeId]) => typeId === MARKER_TYPES[routeType])
      .map(([, lat, lng]) => L.latLng(lat, lng));

    // Draw polyline if we have route nodes
    if (routeNodes.length > 0) {
      L.polyline(routeNodes, {
        color: routeColors[routeType].line,
        weight: 4,
        opacity: 1,
        dashArray: "2 10",
        interactive: false,
      }).addTo(routeLayer);
    }
  });

  // Draw all markers
  state.forEach((entry, idx) => {
    const [typeId, lat, lng, note] = entry;
    const latlng = L.latLng(lat, lng);
    const markerType = MARKER_TYPES_BY_ID[typeId];
    
    // Skip if this marker type is hidden
    if (!isMarkerVisible(markerType)) return;

    if (typeId === MARKER_TYPES.route || typeId === MARKER_TYPES.route1 || typeId === MARKER_TYPES.route2) {
      // Route node - get colors based on route type
      const colors = routeColors[markerType] || routeColors.route;
      const marker = L.circleMarker(latlng, {
        radius: 5,
        color: colors.dotBorder,
        weight: 2,
        fillColor: colors.dot,
        fillOpacity: 0.95,
      }).addTo(markersLayer);
      marker.stateIndex = idx;
      marker.markerType = markerType;
      
      // Bind tooltip if note exists
      if (note) {
        marker.bindTooltip(note, {
          permanent: false,
          direction: 'top',
          offset: [0, -5],
          className: 'marker-note-tooltip'
        });
        
        // Add note indicator icon (speech bubble with lines)
        const indicatorIcon = L.divIcon({
          className: 'note-indicator',
          html: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2z"/><line x1="7" y1="8" x2="17" y2="8" stroke="#0f172a" stroke-width="2" stroke-linecap="round"/><line x1="7" y1="12" x2="13" y2="12" stroke="#0f172a" stroke-width="2" stroke-linecap="round"/></svg>',
          iconSize: [16, 16],
          iconAnchor: [-2, 14],
        });
        const indicator = L.marker(latlng, { icon: indicatorIcon, interactive: false }).addTo(markersLayer);
        indicator.isNoteIndicator = true;
      }
      
      if (onMarkerClick) {
        marker.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          onMarkerClick(marker, e);
        });
      }
      
      // Attach contextmenu handler for route nodes
      marker.on("contextmenu", (e) => {
        L.DomEvent.preventDefault(e);
        L.DomEvent.stopPropagation(e);
        if (window._showMarkerContextMenu) {
          window._showMarkerContextMenu(marker, e.originalEvent);
        }
      });
    } else {
      // Regular pin marker
      let icon = PIN_ICONS[markerType];
      
      // Create custom colored icons for custom marker variants
      if (markerType === "custom1") {
        icon = L.divIcon({
          className: "custom-marker-icon",
          html: '<svg xmlns="http://www.w3.org/2000/svg" width="25" height="41" viewBox="0 0 25 41"><path fill="#dc2626" stroke="#ffffff" stroke-width="1" d="M12.5 0C5.596 0 0 5.596 0 12.5c0 9.375 12.5 28.125 12.5 28.125S25 21.875 25 12.5C25 5.596 19.404 0 12.5 0z"/><circle cx="12.5" cy="12.5" r="4" fill="#ffffff"/></svg>',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
        });
      } else if (markerType === "custom2") {
        icon = L.divIcon({
          className: "custom-marker-icon",
          html: '<svg xmlns="http://www.w3.org/2000/svg" width="25" height="41" viewBox="0 0 25 41"><path fill="#16a34a" stroke="#ffffff" stroke-width="1" d="M12.5 0C5.596 0 0 5.596 0 12.5c0 9.375 12.5 28.125 12.5 28.125S25 21.875 25 12.5C25 5.596 19.404 0 12.5 0z"/><circle cx="12.5" cy="12.5" r="4" fill="#ffffff"/></svg>',
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [1, -34],
        });
      }
      
      const markerOptions = icon ? { icon } : undefined;
      const marker = L.marker(latlng, markerOptions).addTo(markersLayer);
      marker.stateIndex = idx;
      marker.markerType = markerType;
      
      // Bind tooltip if note exists
      if (note) {
        marker.bindTooltip(note, {
          permanent: false,
          direction: 'top',
          offset: [0, -40],
          className: 'marker-note-tooltip'
        });
        
        // Add note indicator icon (offset for pin markers which are taller)
        const indicatorIcon = L.divIcon({
          className: 'note-indicator',
          html: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4V4c0-1.1-.9-2-2-2z"/><line x1="7" y1="8" x2="17" y2="8" stroke="#0f172a" stroke-width="2" stroke-linecap="round"/><line x1="7" y1="12" x2="13" y2="12" stroke="#0f172a" stroke-width="2" stroke-linecap="round"/></svg>',
          iconSize: [16, 16],
          iconAnchor: [-6, 46],
        });
        const indicator = L.marker(latlng, { icon: indicatorIcon, interactive: false }).addTo(markersLayer);
        indicator.isNoteIndicator = true;
      }
      
      if (onMarkerClick) {
        marker.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          onMarkerClick(marker, e);
        });
      }
      
      // Attach contextmenu handler for custom markers
      marker.on("contextmenu", (e) => {
        L.DomEvent.preventDefault(e);
        L.DomEvent.stopPropagation(e);
        if (window._showMarkerContextMenu) {
          window._showMarkerContextMenu(marker, e.originalEvent);
        }
      });
    }
  });

  // Add hover effects to all regular markers after rendering
  setTimeout(() => {
    markersLayer.eachLayer((layer) => {
      if (layer.markerType !== "route") {
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
      }
    });
  }, 0);

  return markersLayer;
}

// Add a marker to state and re-render
export function addMarker(latlng, markerType) {
  const typeId = MARKER_TYPES[markerType];
  if (typeId === undefined) return;
  state.push([typeId, roundCoord(latlng.lat), roundCoord(latlng.lng)]);
  renderState(window._markerClickHandler);
  if (window._triggerAutosave) window._triggerAutosave();
}

// Remove marker at specific index
export function removeMarker(index) {
  if (index >= 0 && index < state.length) {
    state.splice(index, 1);
    renderState(window._markerClickHandler);
    if (window._triggerAutosave) window._triggerAutosave();
  }
}

// Remove all markers of a specific type
export function removeMarkersByType(markerType) {
  const typeId = MARKER_TYPES[markerType];
  if (typeId === undefined) return;
  state = state.filter(([id]) => id !== typeId);
  renderState(window._markerClickHandler);
  if (window._triggerAutosave) window._triggerAutosave();
}

// Undo last marker
export function undoLastMarker() {
  if (state.length > 0) {
    state.pop();
    renderState(window._markerClickHandler);
    if (window._triggerAutosave) window._triggerAutosave();
  }
}

