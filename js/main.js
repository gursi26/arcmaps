import { MAPS, MARKER_TYPES_BY_ID } from "./constants.js";
import { decodeStateFromUrl, encodeStateToUrl } from "./urlState.js";
import {
  initState,
  getState,
  setState,
  renderState,
  addMarker,
  removeMarker,
} from "./state.js";
import {
  createLeafletMap,
  addZoomControl,
  loadMap,
  setupResizeHandler,
} from "./mapSetup.js";
import {
  setupContextMenu,
  setupUndoHandler,
  setupModeButtons,
  setupShareButton,
  setupAdminControls,
  showContextMenu,
} from "./ui.js";
import {
  initFixedMarkers,
  loadFixedMarkers,
  addFixedMarker,
  isFixedMarkerType,
  toggleMarkerTypeVisibility,
  showAllMarkerTypes,
  hideAllMarkerTypes,
} from "./fixedMarkers.js";

// ADMIN MODE TOGGLE - Set to false before deploying to production
const ALLOW_ADMIN_MODE = false;

// Check if admin mode is enabled
function isAdminMode() {
  if (!ALLOW_ADMIN_MODE) return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("admin") === "true";
}

// Main initialization
async function init() {
  if (!MAPS.length) return;

  const adminMode = isAdminMode();

  // Get DOM elements
  const mapSelectEl = document.getElementById("map-select");
  const pinButtons = Array.from(
    document.querySelectorAll(".pin-button[data-pin-type]")
  );
  const routeButtonEl = document.getElementById("route-button");
  const shareButtonEl = document.getElementById("share-button");
  const contextMenuEl = document.getElementById("context-menu");
  const adminControlsEl = document.getElementById("admin-controls");
  const fixedLocationsSection = document.getElementById("fixed-locations-section");
  const drawSection = document.getElementById("draw-section");
  const adminSection = document.getElementById("admin-section");
  const legendButtons = Array.from(
    document.querySelectorAll(".legend-button[data-legend-type]")
  );
  const showAllBtn = document.getElementById("show-all-btn");
  const hideAllBtn = document.getElementById("hide-all-btn");

  // Show/hide sections based on mode
  if (adminMode) {
    if (fixedLocationsSection) fixedLocationsSection.style.display = "none";
    if (drawSection) drawSection.style.display = "none";
    if (adminSection) adminSection.style.display = "block";
    if (shareButtonEl) shareButtonEl.style.display = "none";
    if (adminControlsEl) adminControlsEl.style.display = "flex";
  } else {
    if (fixedLocationsSection) fixedLocationsSection.style.display = "block";
    if (drawSection) drawSection.style.display = "block";
    if (adminSection) adminSection.style.display = "none";
    if (shareButtonEl) shareButtonEl.style.display = "block";
    if (adminControlsEl) adminControlsEl.style.display = "none";
  }

  // Populate map dropdown
  for (const m of MAPS) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.label;
    mapSelectEl.appendChild(opt);
  }

  // Create Leaflet map and layers
  const leafletMap = createLeafletMap("map");
  const markersLayer = L.layerGroup().addTo(leafletMap);
  const routeLayer = L.layerGroup().addTo(leafletMap);
  const fixedMarkersLayer = L.layerGroup().addTo(leafletMap);

  // Initialize state with layers
  initState(markersLayer, routeLayer);
  initFixedMarkers(fixedMarkersLayer);

  // Add zoom controls
  addZoomControl(leafletMap);

  // Setup resize handler
  setupResizeHandler(leafletMap);

  // Track current drawing mode
  let currentMode = { activePinType: null, routeModeEnabled: false };

  // Route preview line (shows from last node to cursor)
  let routePreviewLine = null;

  // Helper to get all route nodes from current state
  const getRouteNodes = () => {
    return getState()
      .filter(([typeId]) => typeId === MARKER_TYPES_BY_ID.indexOf("route"))
      .map(([, lat, lng]) => L.latLng(lat, lng));
  };

  // Update route preview line
  const updateRoutePreview = (cursorLatLng) => {
    if (!currentMode.routeModeEnabled || adminMode) {
      if (routePreviewLine) {
        leafletMap.removeLayer(routePreviewLine);
        routePreviewLine = null;
      }
      return;
    }

    const routeNodes = getRouteNodes();
    if (routeNodes.length === 0) {
      if (routePreviewLine) {
        leafletMap.removeLayer(routePreviewLine);
        routePreviewLine = null;
      }
      return;
    }

    const lastNode = routeNodes[routeNodes.length - 1];
    const previewPath = [lastNode, cursorLatLng];

    if (routePreviewLine) {
      routePreviewLine.setLatLngs(previewPath);
    } else {
      routePreviewLine = L.polyline(previewPath, {
        color: "#fbbf24",
        weight: 3,
        opacity: 0.6,
        dashArray: "5 8",
        interactive: false,
      }).addTo(leafletMap);
    }
  };

  // Setup UI handlers
  setupContextMenu(contextMenuEl, adminMode);
  setupUndoHandler(adminMode);
  setupModeButtons(pinButtons, routeButtonEl, (pinType, routeMode) => {
    currentMode.activePinType = pinType;
    currentMode.routeModeEnabled = routeMode;
    
    // Clear preview line when route mode is disabled
    if (!routeMode && routePreviewLine) {
      leafletMap.removeLayer(routePreviewLine);
      routePreviewLine = null;
    }
  });
  
  if (!adminMode) {
    setupShareButton(
      shareButtonEl,
      async () => encodeStateToUrl(getState()),
      () => mapSelectEl.value
    );

    // Setup legend buttons for visibility toggling
    legendButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const legendType = btn.dataset.legendType;
        if (!legendType) return;

        // Toggle visibility
        const isVisible = toggleMarkerTypeVisibility(legendType);

        // Update button style
        if (isVisible) {
          btn.classList.add("legend-button-active");
        } else {
          btn.classList.remove("legend-button-active");
        }
      });
    });

    // Setup show/hide all buttons
    if (showAllBtn) {
      showAllBtn.addEventListener("click", () => {
        showAllMarkerTypes();
        // Update all legend button styles
        legendButtons.forEach((btn) => {
          btn.classList.add("legend-button-active");
        });
      });
    }

    if (hideAllBtn) {
      hideAllBtn.addEventListener("click", () => {
        hideAllMarkerTypes();
        // Update all legend button styles
        legendButtons.forEach((btn) => {
          btn.classList.remove("legend-button-active");
        });
      });
    }
  } else {
    setupAdminControls(adminControlsEl, () => mapSelectEl.value);
  }

  // Handle marker context menu (only for user markers, not fixed markers)
  markersLayer.on("contextmenu", (ev) => {
    const marker = ev.layer;
    if (!marker || marker.isFixed) return; // Fixed markers can't be deleted
    L.DomEvent.preventDefault(ev);
    const clientX = ev.originalEvent?.clientX ?? 0;
    const clientY = ev.originalEvent?.clientY ?? 0;

    if (marker.markerType === "route") {
      showContextMenu(contextMenuEl, "route", clientX, clientY);
    } else {
      showContextMenu(contextMenuEl, "marker", clientX, clientY, { marker });
    }
  });

  // Set up marker click handler for user markers
  const handleMarkerClick = (marker, e) => {
    // If in custom marker draw mode and clicked on a custom marker, remove it
    if (
      !adminMode &&
      currentMode.activePinType === "custom" &&
      marker.markerType === "custom"
    ) {
      const idx = marker.stateIndex;
      if (idx !== undefined) {
        removeMarker(idx);
      }
    }
  };

  // Store the handler globally so renderState can use it
  window._markerClickHandler = handleMarkerClick;

  // Track mouse movement for route preview
  leafletMap.on("mousemove", (e) => {
    if (currentMode.routeModeEnabled && !adminMode) {
      updateRoutePreview(e.latlng);
    }
  });

  // Clear preview when mouse leaves map
  leafletMap.on("mouseout", () => {
    if (routePreviewLine) {
      leafletMap.removeLayer(routePreviewLine);
      routePreviewLine = null;
    }
  });

  // Handle map clicks for drawing
  leafletMap.on("click", (e) => {
    if (currentMode.activePinType) {
      if (adminMode) {
        // In admin mode, add to fixed markers
        addFixedMarker(e.latlng, currentMode.activePinType);
      } else {
        // In normal mode, add to user markers
        addMarker(e.latlng, currentMode.activePinType);
      }
    } else if (currentMode.routeModeEnabled && !adminMode) {
      addMarker(e.latlng, "route");
      // Update preview to start from new node
      updateRoutePreview(e.latlng);
    }
  });

  // Try to restore state from URL
  const urlState = await decodeStateFromUrl();
  const params = new URLSearchParams(window.location.search);
  const urlMapIdFromParam = params.get("map");
  const urlMapIdFromState =
    urlState && typeof urlState.m === "string" ? urlState.m : null;

  const selectedMapId = urlMapIdFromParam || urlMapIdFromState;
  const initialMap =
    (selectedMapId && MAPS.find((m) => m.id === selectedMapId)) ?? MAPS[0];

  mapSelectEl.value = initialMap.id;

  // Load initial map
  try {
    await loadMap(leafletMap, initialMap, markersLayer, routeLayer);
    // Load fixed markers for this map
    await loadFixedMarkers(initialMap.id);
  } catch (e) {
    console.error("Failed to load default map", e);
  }

  // Restore state from URL if present (only in normal mode)
  if (!adminMode && urlState && Array.isArray(urlState)) {
    const validState = [];
    for (const entry of urlState) {
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
    setState(validState);
    renderState(handleMarkerClick);
  }

  // Handle map switching
  mapSelectEl.addEventListener("change", async (e) => {
    const selectedId = e.target.value;
    const selectedMap = MAPS.find((m) => m.id === selectedId);
    if (!selectedMap) return;

    // Update URL
    const url = new URL(window.location.href);
    url.searchParams.set("map", selectedId);
    if (adminMode) {
      url.searchParams.set("admin", "true");
    }
    window.history.replaceState(null, "", url.toString());

    try {
      await loadMap(leafletMap, selectedMap, markersLayer, routeLayer);
      // Load fixed markers for the new map
      await loadFixedMarkers(selectedId);
    } catch (err) {
      console.error("Failed to load selected map", err);
    }
  });
}

// Start the app
init();

