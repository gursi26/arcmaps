// Configuration of available maps.
// Keys will show in the dropdown; values are relative paths for GitHub Pages.
const MAPS = [
  { id: "stella-montis", label: "Stella Montis", file: "maps/stella-montis.png" },
  { id: "spaceport", label: "Spaceport", file: "maps/spaceport.png" },
  { id: "dam-battlegrounds", label: "Dam Battlegrounds", file: "maps/dam-battlegrounds.png" },
  { id: "buried-city", label: "Buried City", file: "maps/buried-city.png" },
  { id: "blue-gate", label: "Blue Gate", file: "maps/blue-gate.png" },
];

const mapSelectEl = document.getElementById("map-select");
const pinButtons = Array.from(
  document.querySelectorAll(".pin-button[data-pin-type]")
);
const routeButtonEl = document.getElementById("route-button");
const mapContainerId = "map";
const contextMenuEl = document.getElementById("context-menu");
const contextDeleteMarkerBtn = contextMenuEl?.querySelector(
  '[data-action="delete-marker"]'
);
const contextDeleteRouteBtn = contextMenuEl?.querySelector(
  '[data-action="delete-route"]'
);

// Populate dropdown
for (const m of MAPS) {
  const opt = document.createElement("option");
  opt.value = m.id;
  opt.textContent = m.label;
  mapSelectEl.appendChild(opt);
}

// Use Leaflet with a simple CRS, treating image pixels as map units.
const leafletMap = L.map(mapContainerId, {
  crs: L.CRS.Simple,
  minZoom: -4,
  maxZoom: 4,
  zoomSnap: 0.25,
  zoomDelta: 0.5,
  attributionControl: false,
  zoomControl: false, // we'll add our own custom control with "fit to screen"
});

const pinsLayer = L.layerGroup().addTo(leafletMap);
const routesLayer = L.layerGroup().addTo(leafletMap);
let activePinType = null;
let routeModeEnabled = false;
let currentRoute = null;
let routeNodes = [];
let contextMenuState = null; // { type: 'marker' | 'route', marker?: L.Marker }

const spawnIcon = L.divIcon({
  className: "pin-icon pin-icon-spawn",
  html: "S",
  iconSize: [26, 26],
  iconAnchor: [13, 26],
});

const extractIcon = L.divIcon({
  className: "pin-icon pin-icon-extract",
  html: "E",
  iconSize: [26, 26],
  iconAnchor: [13, 26],
});

const PIN_ICONS = {
  custom: null,
  spawn: spawnIcon,
  extract: extractIcon,
};

let currentOverlay = null;
let currentBounds = null;

function loadMap(mapEntry) {
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
      const paddedBounds = bounds.pad(0.5); // small buffer so map can stay centered

      if (currentOverlay) {
        leafletMap.removeLayer(currentOverlay);
      }

      // Clear any pins and routes when switching maps
      pinsLayer.clearLayers();
      routesLayer.clearLayers();
      currentRoute = null;
      routeNodes = [];

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

async function init() {
  if (!MAPS.length) return;

  // Read initial map from URL params, e.g. ?map=spaceport
  const params = new URLSearchParams(window.location.search);
  const urlMapId = params.get("map");
  const initialMap =
    MAPS.find((m) => m.id === urlMapId) ?? MAPS[0];

  mapSelectEl.value = initialMap.id;

  try {
    await loadMap(initialMap);
  } catch (e) {
    console.error("Failed to load default map", e);
  }

  mapSelectEl.addEventListener("change", async (e) => {
    const selectedId = e.target.value;
    const selectedMap = MAPS.find((m) => m.id === selectedId);
    if (!selectedMap) return;

    // Update the URL so the selected map is shareable.
    const url = new URL(window.location.href);
    url.searchParams.set("map", selectedId);
    window.history.replaceState(null, "", url.toString());

    try {
      await loadMap(selectedMap);
    } catch (err) {
      console.error("Failed to load selected map", err);
    }
  });

  // Custom zoom control with "fit to screen"
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
        L.DomEvent.on(link, "click", L.DomEvent.preventDefault)
          .on(link, "click", onClick, this);
        return link;
      };

      // Fit-to-screen button above zoom controls
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

  // Keep map centered if the window is resized
  window.addEventListener("resize", () => {
    leafletMap.invalidateSize();
    if (currentBounds) {
      leafletMap.fitBounds(currentBounds);
    }
  });

  // Pin type buttons
  let updatePinButtons = () => {};

  if (pinButtons.length) {
    updatePinButtons = () => {
      pinButtons.forEach((btn) => {
        const type = btn.dataset.pinType;
        btn.classList.toggle("pin-button-active", type === activePinType);
      });
    };

    pinButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const type = btn.dataset.pinType;
        if (!type) return;
        // Clicking the active type turns pin mode off; otherwise switches type
        activePinType = activePinType === type ? null : type;

        // Turning on a pin type disables route drawing
        if (activePinType) {
          routeModeEnabled = false;
          if (routeButtonEl) {
            routeButtonEl.classList.remove("route-button-active");
          }
        }

        updatePinButtons();
      });
    });

    updatePinButtons();
  }

  // Route drawing mode toggle
  if (routeButtonEl) {
    const updateRouteButtonUI = () => {
      routeButtonEl.classList.toggle("route-button-active", routeModeEnabled);
    };

    routeButtonEl.addEventListener("click", () => {
      routeModeEnabled = !routeModeEnabled;

      if (routeModeEnabled) {
        // Disable pin mode and clear any existing route points
        activePinType = null;
        updatePinButtons();
        routesLayer.clearLayers();
        currentRoute = null;
        routeNodes = [];
      }

      updateRouteButtonUI();
    });

    updateRouteButtonUI();
  }

  // Helper to sync polyline with current route nodes
  const updateRouteFromNodes = () => {
    if (!routeNodes.length) {
      if (currentRoute) {
        routesLayer.removeLayer(currentRoute);
        currentRoute = null;
      }
      return;
    }

    const latlngs = routeNodes.map((n) => n.latlng);

    if (!currentRoute) {
      currentRoute = L.polyline(latlngs, {
        color: "#e5e7eb",
        weight: 4,
        opacity: 1,
        dashArray: "2 10", // clearly dotted
      }).addTo(routesLayer);
    } else {
      currentRoute.setLatLngs(latlngs);
    }
  };

  // Context menu helpers
  const hideContextMenu = () => {
    if (!contextMenuEl) return;
    contextMenuEl.hidden = true;
    contextMenuState = null;
  };

  const showContextMenu = (type, clientX, clientY, payload = {}) => {
    if (!contextMenuEl) return;

    contextMenuState = { type, ...payload };

    // Toggle which actions are visible
    if (contextDeleteMarkerBtn) {
      contextDeleteMarkerBtn.style.display = type === "marker" ? "block" : "none";
    }
    if (contextDeleteRouteBtn) {
      contextDeleteRouteBtn.style.display = type === "route" ? "block" : "none";
    }

    // Position menu
    const menuRect = contextMenuEl.getBoundingClientRect();
    let x = clientX;
    let y = clientY;

    // Basic viewport clamping
    const padding = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (x + menuRect.width > vw - padding) x = vw - menuRect.width - padding;
    if (y + menuRect.height > vh - padding) y = vh - menuRect.height - padding;

    contextMenuEl.style.left = `${x}px`;
    contextMenuEl.style.top = `${y}px`;
    contextMenuEl.hidden = false;
  };

  // Global clicks close context menu
  document.addEventListener("click", (e) => {
    if (!contextMenuEl || contextMenuEl.hidden) return;
    if (contextMenuEl.contains(e.target)) return;
    hideContextMenu();
  });

  // Context menu actions
  if (contextDeleteMarkerBtn) {
    contextDeleteMarkerBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (contextMenuState?.type === "marker" && contextMenuState.marker) {
        pinsLayer.removeLayer(contextMenuState.marker);
      }
      hideContextMenu();
    });
  }

  if (contextDeleteRouteBtn) {
    contextDeleteRouteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (contextMenuState?.type === "route") {
        routesLayer.clearLayers();
        currentRoute = null;
        routeNodes = [];
      }
      hideContextMenu();
    });
  }

  // Map click handler for pins and routes
  leafletMap.on("click", (e) => {
    // Pin placement
    if (activePinType) {
      const pinType = activePinType;
      const icon = PIN_ICONS[pinType] || undefined;
      const markerOptions = icon ? { icon } : undefined;
      const marker = L.marker(e.latlng, markerOptions).addTo(pinsLayer);

      // Right-click on marker → show delete option
      marker.on("contextmenu", (ev) => {
        L.DomEvent.preventDefault(ev);
        const clientX = ev.originalEvent?.clientX ?? 0;
        const clientY = ev.originalEvent?.clientY ?? 0;
        showContextMenu("marker", clientX, clientY, { marker });
      });

      return;
    }

    // Route drawing
    if (routeModeEnabled) {
      // Add a visible point marker for each click and track it
      const nodeMarker = L.circleMarker(e.latlng, {
        radius: 5,
        color: "#facc15",
        weight: 2,
        fillColor: "#fbbf24",
        fillOpacity: 0.95,
      }).addTo(routesLayer);

      const node = { latlng: e.latlng, marker: nodeMarker };
      routeNodes.push(node);
      updateRouteFromNodes();

      // Right-click on any node → offer delete full route
      nodeMarker.on("contextmenu", (ev) => {
        L.DomEvent.preventDefault(ev);
        const clientX = ev.originalEvent?.clientX ?? 0;
        const clientY = ev.originalEvent?.clientY ?? 0;
        showContextMenu("route", clientX, clientY);
      });
    }
  });
}

init();


