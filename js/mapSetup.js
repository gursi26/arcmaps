import { clearState } from "./state.js";

let currentTileLayer = null;
let currentBounds = null;

// Initialize Leaflet map with Simple CRS
export function createLeafletMap(containerId) {
  const leafletMap = L.map(containerId, {
    crs: L.CRS.Simple,
    minZoom: 0,
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

// Load a map using tile layers
export function loadMap(leafletMap, mapEntry, markersLayer, routeLayer) {
  return new Promise((resolve, reject) => {
    try {
      // Remove existing tile layer if present
      if (currentTileLayer) {
        leafletMap.removeLayer(currentTileLayer);
      }

      // Clear layers when switching maps (but keep state)
      markersLayer.clearLayers();
      routeLayer.clearLayers();

      // Tiles are 512×512 pixels each
      // At zoom 1: 2×2 tiles = 1024×1024 pixels total
      // At zoom 2: 4×4 tiles = 2048×2048 pixels total
      // At zoom 3: 8×8 tiles = 4096×4096 pixels total
      const tileSize = 512;
      const minNativeZoom = 1;
      const mapSize = tileSize; // 1024
      
      // Set bounds for Simple CRS
      // For Leaflet Simple CRS, Y axis goes downward from top
      // Format: [[minY, minX], [maxY, maxX]] or [[top, left], [bottom, right]]
      const imageBounds = [
        [-mapSize, 0],      // Top-left corner  
        [0, mapSize],       // Bottom-right corner
      ];
      const bounds = L.latLngBounds(imageBounds);
      const paddedBounds = bounds.pad(0.5);

      // Create tile layer
      currentTileLayer = L.tileLayer(`${mapEntry.tilesPath}/{z}/{x}/{y}.webp`, {
        minZoom: 0,
        maxZoom: 4,
        minNativeZoom: 1,
        maxNativeZoom: 3,
        tileSize: tileSize,
        noWrap: true,
        tms: false, // Standard XYZ tile system (Y=0 at top)
        errorTileUrl: '',
      }).addTo(leafletMap);

      currentBounds = bounds;
      leafletMap.setMaxBounds(paddedBounds);
      leafletMap.options.maxBoundsViscosity = 0.85;
      
      // Fit the map to show all bounds in viewport
      leafletMap.fitBounds(bounds);

      resolve();
    } catch (err) {
      reject(err);
    }
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

