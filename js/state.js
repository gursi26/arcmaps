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

  // Filter route nodes for polyline
  const routeNodes = state
    .filter(([typeId]) => typeId === MARKER_TYPES.route)
    .map(([, lat, lng]) => L.latLng(lat, lng));

  // Draw polyline if we have route nodes
  if (routeNodes.length > 0) {
    L.polyline(routeNodes, {
      color: "#e5e7eb",
      weight: 4,
      opacity: 1,
      dashArray: "2 10",
      interactive: false,
    }).addTo(routeLayer);
  }

  // Draw all markers
  state.forEach(([typeId, lat, lng], idx) => {
    const latlng = L.latLng(lat, lng);
    const markerType = MARKER_TYPES_BY_ID[typeId];

    if (typeId === MARKER_TYPES.route) {
      // Route node
      const marker = L.circleMarker(latlng, {
        radius: 5,
        color: "#facc15",
        weight: 2,
        fillColor: "#fbbf24",
        fillOpacity: 0.95,
      }).addTo(markersLayer);
      marker.stateIndex = idx;
      marker.markerType = "route";
      
      if (onMarkerClick) {
        marker.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          onMarkerClick(marker, e);
        });
      }
    } else {
      // Regular pin marker
      const icon = PIN_ICONS[markerType] || undefined;
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

