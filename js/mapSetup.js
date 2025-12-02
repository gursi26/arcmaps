import { clearState } from "./state.js";

let currentOverlay = null;
let currentBounds = null;

// Initialize Leaflet map with Simple CRS
export function createLeafletMap(containerId) {
  const leafletMap = L.map(containerId, {
    crs: L.CRS.Simple,
    minZoom: -4,
    maxZoom: 4,
    zoomSnap: 0.25,
    zoomDelta: 0.5,
    attributionControl: false,
    zoomControl: false,
  });

  return leafletMap;
}

// Add custom zoom control with fit-to-screen button
export function addZoomControl(leafletMap) {
  const FitZoomControl = L.Control.extend({
    options: {
      position: "bottomright",
    },
    onAdd(map) {
      const container = L.DomUtil.create(
        "div",
        "leaflet-bar leaflet-control custom-zoom-control"
      );

      const createButton = (html, title, className, onClick) => {
        const link = L.DomUtil.create("a", className, container);
        link.innerHTML = html;
        link.href = "#";
        link.title = title;
        L.DomEvent.disableClickPropagation(link);
        L.DomEvent.on(link, "click", L.DomEvent.preventDefault).on(
          link,
          "click",
          onClick,
          this
        );
        return link;
      };

      createButton("⤢", "Fit to screen", "leaflet-fit-screen", () => {
        if (currentBounds) {
          map.fitBounds(currentBounds);
        }
      });

      createButton("+", "Zoom in", "leaflet-zoom-in", () => {
        map.zoomIn();
      });

      createButton("−", "Zoom out", "leaflet-zoom-out", () => {
        map.zoomOut();
      });

      return container;
    },
  });

  leafletMap.addControl(new FitZoomControl());
}

// Load a map image onto the Leaflet map
export function loadMap(leafletMap, mapEntry, markersLayer, routeLayer) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const imageBounds = [
        [0, 0],
        [h, w],
      ];
      const bounds = L.latLngBounds(imageBounds);
      const paddedBounds = bounds.pad(0.5);

      if (currentOverlay) {
        leafletMap.removeLayer(currentOverlay);
      }

      // Clear layers when switching maps (but keep state)
      markersLayer.clearLayers();
      routeLayer.clearLayers();

      currentOverlay = L.imageOverlay(mapEntry.file, imageBounds).addTo(
        leafletMap
      );
      currentBounds = bounds;
      leafletMap.setMaxBounds(paddedBounds);
      leafletMap.options.maxBoundsViscosity = 0.85;
      leafletMap.fitBounds(bounds);

      resolve();
    };
    img.onerror = reject;
    img.src = mapEntry.file;
  });
}

// Setup window resize handler
export function setupResizeHandler(leafletMap) {
  window.addEventListener("resize", () => {
    leafletMap.invalidateSize();
    if (currentBounds) {
      leafletMap.fitBounds(currentBounds);
    }
  });
}

// Get current bounds (for fit-to-screen)
export function getCurrentBounds() {
  return currentBounds;
}

