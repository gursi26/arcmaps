import { MAPS, MARKER_TYPES_BY_ID } from "./constants.js";
import { decodeStateFromUrl, encodeStateToUrl } from "./urlState.js";
import {
  initState,
  getState,
  setState,
  renderState,
  addMarker,
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
  showContextMenu,
} from "./ui.js";

// Main initialization
async function init() {
  if (!MAPS.length) return;

  // Get DOM elements
  const mapSelectEl = document.getElementById("map-select");
  const pinButtons = Array.from(
    document.querySelectorAll(".pin-button[data-pin-type]")
  );
  const routeButtonEl = document.getElementById("route-button");
  const shareButtonEl = document.getElementById("share-button");
  const contextMenuEl = document.getElementById("context-menu");

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

  // Initialize state with layers
  initState(markersLayer, routeLayer);

  // Add zoom controls
  addZoomControl(leafletMap);

  // Setup resize handler
  setupResizeHandler(leafletMap);

  // Track current drawing mode
  let currentMode = { activePinType: null, routeModeEnabled: false };

  // Setup UI handlers
  setupContextMenu(contextMenuEl);
  setupUndoHandler();
  setupModeButtons(pinButtons, routeButtonEl, (pinType, routeMode) => {
    currentMode.activePinType = pinType;
    currentMode.routeModeEnabled = routeMode;
  });
  setupShareButton(
    shareButtonEl,
    async () => encodeStateToUrl(getState()),
    () => mapSelectEl.value
  );

  // Handle marker context menu
  markersLayer.on("contextmenu", (ev) => {
    const marker = ev.layer;
    if (!marker) return;
    L.DomEvent.preventDefault(ev);
    const clientX = ev.originalEvent?.clientX ?? 0;
    const clientY = ev.originalEvent?.clientY ?? 0;

    if (marker.markerType === "route") {
      showContextMenu(contextMenuEl, "route", clientX, clientY);
    } else {
      showContextMenu(contextMenuEl, "marker", clientX, clientY, { marker });
    }
  });

  // Handle map clicks for drawing
  leafletMap.on("click", (e) => {
    if (currentMode.activePinType) {
      addMarker(e.latlng, currentMode.activePinType);
    } else if (currentMode.routeModeEnabled) {
      addMarker(e.latlng, "route");
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
  } catch (e) {
    console.error("Failed to load default map", e);
  }

  // Restore state from URL if present
  if (urlState && Array.isArray(urlState)) {
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
    renderState();
  }

  // Handle map switching
  mapSelectEl.addEventListener("change", async (e) => {
    const selectedId = e.target.value;
    const selectedMap = MAPS.find((m) => m.id === selectedId);
    if (!selectedMap) return;

    // Update URL
    const url = new URL(window.location.href);
    url.searchParams.set("map", selectedId);
    window.history.replaceState(null, "", url.toString());

    try {
      await loadMap(leafletMap, selectedMap, markersLayer, routeLayer);
    } catch (err) {
      console.error("Failed to load selected map", err);
    }
  });
}

// Start the app
init();

