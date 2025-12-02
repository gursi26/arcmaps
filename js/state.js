import { MARKER_TYPES, MARKER_TYPES_BY_ID, PIN_ICONS } from "./constants.js";
import { roundCoord } from "./urlState.js";

// Single unified state array: each entry is [typeId, lat, lng]
let state = [];

// Layer groups for rendering
let markersLayer = null;
let routeLayer = null;

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
  state.forEach(([typeId, lat, lng], idx) => {
    const latlng = L.latLng(lat, lng);
    const markerType = MARKER_TYPES_BY_ID[typeId];

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
      
      if (onMarkerClick) {
        marker.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          onMarkerClick(marker, e);
        });
      }
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
      
      if (onMarkerClick) {
        marker.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          onMarkerClick(marker, e);
        });
      }
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
}

// Remove marker at specific index
export function removeMarker(index) {
  if (index >= 0 && index < state.length) {
    state.splice(index, 1);
    renderState(window._markerClickHandler);
  }
}

// Remove all markers of a specific type
export function removeMarkersByType(markerType) {
  const typeId = MARKER_TYPES[markerType];
  if (typeId === undefined) return;
  state = state.filter(([id]) => id !== typeId);
  renderState(window._markerClickHandler);
}

// Undo last marker
export function undoLastMarker() {
  if (state.length > 0) {
    state.pop();
    renderState(window._markerClickHandler);
  }
}

