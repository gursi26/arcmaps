// Configuration of available maps.
// Keys will show in the dropdown; values are relative paths for GitHub Pages.
const MAPS = [
  { id: "stella-montis", label: "Stella Montis", file: "maps/stella-montis.png" },
  { id: "spaceport", label: "Spaceport", file: "maps/spaceport.png" },
  { id: "dam-battlegrounds", label: "Dam Battlegrounds", file: "maps/dam-battlegrounds.png" },
  { id: "buried-city", label: "Buried City", file: "maps/buried-city.png" },
  { id: "blue-gate", label: "Blue Gate", file: "maps/blue-gate.png" },
];

// --- State encoding / decoding helpers ---

const PIN_TYPE_CODES = {
  custom: 0,
  spawn: 1,
  extract: 2,
};

const PIN_TYPES_BY_CODE = ["custom", "spawn", "extract"];

const roundCoord = (value) => Math.round(value * 100) / 100;

function base64UrlEncode(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeToBytes(encoded) {
  let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Decode compact state from ?state= query param (gzipped+base64url JSON, or plain base64url JSON for older links).
async function decodeStateFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get("state");
    if (!encoded) return null;

    const bytes = base64UrlDecodeToBytes(encoded);
    let json;

    if (window.DecompressionStream) {
      try {
        const ds = new DecompressionStream("gzip");
        const writer = ds.writable.getWriter();
        writer.write(bytes);
        writer.close();
        const decompressed = await new Response(ds.readable).arrayBuffer();
        json = new TextDecoder().decode(decompressed);
      } catch (err) {
        // Not gzipped or failed to decompress → treat as plain UTF-8 JSON
        json = new TextDecoder().decode(bytes);
      }
    } else {
      json = new TextDecoder().decode(bytes);
    }

    const obj = JSON.parse(json);
    if (!obj || typeof obj !== "object") return null;
    return obj;
  } catch (err) {
    console.warn("Failed to decode state from URL", err);
    return null;
  }
}

const mapSelectEl = document.getElementById("map-select");
const pinButtons = Array.from(
  document.querySelectorAll(".pin-button[data-pin-type]")
);
const routeButtonEl = document.getElementById("route-button");
const shareButtonEl = document.getElementById("share-button");
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
let actionHistory = []; // stack of draw actions: { kind: 'pin'|'route-node', marker }

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
      actionHistory = [];

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

  // Try to restore state from ?state=. Map id comes from ?map= (or legacy state.m).
  const urlState = await decodeStateFromUrl();
  const params = new URLSearchParams(window.location.search);
  const urlMapIdFromParam = params.get("map");
  const urlMapIdFromState =
    urlState && typeof urlState.m === "string" ? urlState.m : null;

  const selectedMapId = urlMapIdFromParam || urlMapIdFromState;
  const initialMap =
    (selectedMapId && MAPS.find((m) => m.id === selectedMapId)) ?? MAPS[0];

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
        interactive: false, // let clicks go to the node markers underneath
      }).addTo(routesLayer);
    } else {
      currentRoute.setLatLngs(latlngs);
    }
  };

  // Create a pin marker of a given type at a latlng
  const createPin = (latlng, pinType) => {
    const icon = PIN_ICONS[pinType] || undefined;
    const markerOptions = icon ? { icon } : undefined;
    const marker = L.marker(latlng, markerOptions).addTo(pinsLayer);
    marker.pinType = pinType;

    // Right-click on marker → show delete option
    marker.on("contextmenu", (ev) => {
      L.DomEvent.preventDefault(ev);
      const clientX = ev.originalEvent?.clientX ?? 0;
      const clientY = ev.originalEvent?.clientY ?? 0;
      showContextMenu("marker", clientX, clientY, { marker });
    });

    actionHistory.push({ kind: "pin", marker });
    return marker;
  };

  // Add a route node and update the polyline
  const addRouteNode = (latlng) => {
    const nodeMarker = L.circleMarker(latlng, {
      radius: 5,
      color: "#facc15",
      weight: 2,
      fillColor: "#fbbf24",
      fillOpacity: 0.95,
    }).addTo(routesLayer);

    const node = { latlng, marker: nodeMarker };
    routeNodes.push(node);
    updateRouteFromNodes();

    // Right-click on any node → offer delete full route
    nodeMarker.on("contextmenu", (ev) => {
      L.DomEvent.preventDefault(ev);
      const clientX = ev.originalEvent?.clientX ?? 0;
      const clientY = ev.originalEvent?.clientY ?? 0;
      showContextMenu("route", clientX, clientY);
    });

    actionHistory.push({ kind: "route-node", marker: nodeMarker });
    return node;
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
        // Remove from undo history
        actionHistory = actionHistory.filter(
          (a) => a.kind !== "pin" || a.marker !== contextMenuState.marker
        );
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
        // Remove all route nodes from undo history
        actionHistory = actionHistory.filter((a) => a.kind !== "route-node");
      }
      hideContextMenu();
    });
  }

  // If there is encoded state in the URL and it targets this map, apply it
  if (urlState) {
    // Restore markers
    if (Array.isArray(urlState.p)) {
      for (const entry of urlState.p) {
        if (!Array.isArray(entry) || entry.length !== 3) {
          continue;
        }
        const [code, lat, lng] = entry;
        if (
          typeof code !== "number" ||
          typeof lat !== "number" ||
          typeof lng !== "number"
        ) {
          continue;
        }
        const type = PIN_TYPES_BY_CODE[code];
        if (!type) continue;
        createPin(L.latLng(lat, lng), type);
      }
    }

    // Restore route
    if (Array.isArray(urlState.r)) {
      for (const entry of urlState.r) {
        if (!Array.isArray(entry) || entry.length !== 2) continue;
        const [lat, lng] = entry;
        if (typeof lat !== "number" || typeof lng !== "number") continue;
        addRouteNode(L.latLng(lat, lng));
      }
    }
  }

  // Share Map URL
  if (shareButtonEl) {
    const buildCurrentState = () => {
      // Serialize pins
      const p = [];
      pinsLayer.getLayers().forEach((marker) => {
        if (!marker || typeof marker.getLatLng !== "function") return;
        const latlng = marker.getLatLng();
        const type = marker.pinType || "custom";
        if (
          type !== "custom" &&
          type !== "spawn" &&
          type !== "extract"
        ) {
          return;
        }
        const code = PIN_TYPE_CODES[type];
        if (code === undefined) return;
        p.push([code, roundCoord(latlng.lat), roundCoord(latlng.lng)]);
      });

      // Serialize route
      const r = routeNodes.map((n) => [
        roundCoord(n.latlng.lat),
        roundCoord(n.latlng.lng),
      ]);

      return { p, r };
    };

    const originalShareText = shareButtonEl.textContent.trim() || "Share Map URL";
    let shareResetTimeoutId = null;

    const showShareCopied = () => {
      if (shareResetTimeoutId) {
        clearTimeout(shareResetTimeoutId);
      }
      shareButtonEl.textContent = "URL copied to clipboard ✓";
      shareResetTimeoutId = setTimeout(() => {
        shareButtonEl.textContent = originalShareText;
      }, 3000);
    };

    const encodeStateToFragment = async (stateObj) => {
      const json = JSON.stringify(stateObj);
      const encoder = new TextEncoder();
      const inputBytes = encoder.encode(json);
      let bytes = inputBytes;

      if (window.CompressionStream) {
        try {
          const cs = new CompressionStream("gzip");
          const writer = cs.writable.getWriter();
          writer.write(inputBytes);
          writer.close();
          const compressed = await new Response(cs.readable).arrayBuffer();
          bytes = new Uint8Array(compressed);
        } catch (err) {
          // fall back to uncompressed
          bytes = inputBytes;
        }
      }

      return base64UrlEncode(bytes);
    };

    shareButtonEl.addEventListener("click", async () => {
      try {
        const state = buildCurrentState();
        const encoded = await encodeStateToFragment(state);
        const url = new URL(window.location.href);
        url.searchParams.set("state", encoded);
        url.searchParams.set("map", mapSelectEl.value);

        const urlStr = url.toString();

        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(urlStr);
          showShareCopied();
        } else {
          // Fallback for older browsers
          prompt("Copy this URL:", urlStr);
        }
      } catch (err) {
        console.error("Failed to build or copy share URL", err);
      }
    });
  }

  // Undo last drawn thing (pin or route node) with Ctrl+Z / Cmd+Z
  const performUndo = () => {
    while (actionHistory.length) {
      const last = actionHistory.pop();
      if (last.kind === "pin") {
        if (!last.marker || typeof last.marker.getLatLng !== "function") {
          // malformed entry; try earlier one
          continue;
        }
        if (pinsLayer.hasLayer(last.marker)) {
          pinsLayer.removeLayer(last.marker);
          break; // removed one pin, we're done
        }
        // marker already gone (e.g. via context menu) → look at earlier history
      } else if (last.kind === "route-node") {
        const idx = routeNodes.findIndex((n) => n.marker === last.marker);
        if (idx !== -1) {
          const node = routeNodes[idx];
          routesLayer.removeLayer(node.marker);
          routeNodes.splice(idx, 1);
          updateRouteFromNodes();
          break;
        }
        // if not found, try earlier history entries
      }
    }
  };

  document.addEventListener("keydown", (e) => {
    const isUndoKey =
      (e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey);
    if (!isUndoKey) return;

    e.preventDefault();
    performUndo();
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
      }

      updateRouteButtonUI();
    });

    updateRouteButtonUI();
  }

  // Map click handler for pins and routes
  leafletMap.on("click", (e) => {
    // Pin placement
    if (activePinType) {
      createPin(e.latlng, activePinType);
      return;
    }

    // Route drawing
    if (routeModeEnabled) {
      addRouteNode(e.latlng);
    }
  });
}

init();


