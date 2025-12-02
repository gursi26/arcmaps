import { MAPS, MARKER_TYPES_BY_ID } from "./constants.js";
import { decodeStateFromUrl, encodeStateToUrl, base64UrlDecodeToBytes } from "./urlState.js";
import {
  initState,
  getState,
  setState,
  renderState,
  addMarker,
  removeMarker,
  clearState,
  toggleMarkerVisibility,
  isMarkerVisible,
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
import {
  getSavedRoutes,
  saveRoute,
  deleteRoute,
  getRoute,
} from "./savedRoutes.js";

// TODO - populate fixed markers for all maps
// TODO - route naming and saving to local storage
// TODO - text hints for draw mode, remove custom marker, ctrl-z, etc.
// TODO - embedding into web pages? not sure how to do maybe iframe.

// ADMIN MODE TOGGLE - Set to false before deploying to production
const ALLOW_ADMIN_MODE = true;

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
  const routeButtons = Array.from(
    document.querySelectorAll(".route-button[data-route-type]")
  );
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
  const backButton = document.getElementById("back-button");
  const savedRoutesTitle = document.getElementById("saved-routes-title");
  const routeNameInput = document.getElementById("route-name-input");
  const saveRouteButton = document.getElementById("save-route-button");
  const clearMapButton = document.getElementById("clear-map-button");
  const newRouteButton = document.getElementById("new-route-button");
  const mainView = document.getElementById("main-view");
  const savedRoutesView = document.getElementById("saved-routes-view");
  const savedRoutesList = document.getElementById("saved-routes-list");
  const emptyRoutesMessage = document.getElementById("empty-routes-message");
  const mainFooter = document.getElementById("main-footer");
  const savedRoutesFooter = document.getElementById("saved-routes-footer");
  const deleteModal = document.getElementById("delete-modal");
  const modalCancel = document.getElementById("modal-cancel");
  const modalConfirm = document.getElementById("modal-confirm");

  // Delete modal functionality
  let pendingDeleteRouteId = null;
  let onDeleteConfirm = null;

  const showDeleteModal = (routeId, onConfirm) => {
    pendingDeleteRouteId = routeId;
    onDeleteConfirm = onConfirm;
    if (deleteModal) deleteModal.style.display = "flex";
  };

  const hideDeleteModal = () => {
    pendingDeleteRouteId = null;
    onDeleteConfirm = null;
    if (deleteModal) deleteModal.style.display = "none";
  };

  if (modalCancel) {
    modalCancel.addEventListener("click", hideDeleteModal);
  }

  if (modalConfirm) {
    modalConfirm.addEventListener("click", () => {
      if (pendingDeleteRouteId && onDeleteConfirm) {
        deleteRoute(pendingDeleteRouteId);
        onDeleteConfirm();
      }
      hideDeleteModal();
    });
  }

  // Close modal when clicking overlay
  if (deleteModal) {
    deleteModal.querySelector(".modal-overlay")?.addEventListener("click", hideDeleteModal);
  }

  // Show/hide sections based on mode
  if (adminMode) {
    if (fixedLocationsSection) fixedLocationsSection.style.display = "none";
    if (drawSection) drawSection.style.display = "none";
    if (adminSection) adminSection.style.display = "block";
    if (shareButtonEl) shareButtonEl.style.display = "none";
    if (saveRouteButton) saveRouteButton.style.display = "none";
    if (clearMapButton) clearMapButton.style.display = "none";
    if (backButton) backButton.style.display = "none";
    if (routeNameInput) routeNameInput.parentElement.style.display = "none";
    if (adminControlsEl) adminControlsEl.style.display = "flex";
  } else {
    if (fixedLocationsSection) fixedLocationsSection.style.display = "block";
    if (drawSection) drawSection.style.display = "block";
    if (adminSection) adminSection.style.display = "none";
    if (shareButtonEl) shareButtonEl.style.display = "block";
    if (saveRouteButton) saveRouteButton.style.display = "block";
    if (clearMapButton) clearMapButton.style.display = "block";
    if (backButton) backButton.style.display = "block";
    if (routeNameInput) routeNameInput.parentElement.style.display = "flex";
    if (adminControlsEl) adminControlsEl.style.display = "none";
  }

  // Populate map dropdown
  for (const m of MAPS) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.label;
    mapSelectEl.appendChild(opt);
  }

  // Create Leaflet map and layers (order matters: bottom to top)
  const leafletMap = createLeafletMap("map");
  const routeLayer = L.layerGroup().addTo(leafletMap); // Bottom layer
  const markersLayer = L.layerGroup().addTo(leafletMap); // Middle layer
  const fixedMarkersLayer = L.layerGroup().addTo(leafletMap); // Top layer

  // Initialize state with layers
  initState(markersLayer, routeLayer);
  initFixedMarkers(fixedMarkersLayer);

  // Add zoom controls
  addZoomControl(leafletMap);

  // Setup resize handler
  setupResizeHandler(leafletMap);

  // Track current drawing mode
  let currentMode = { activePinType: null, routeModeEnabled: false, activeRouteType: "route" };

  // Route preview line (shows from last node to cursor)
  let routePreviewLine = null;

  // Helper to get all route nodes from current state for the active route type
  const getRouteNodes = (routeType) => {
    return getState()
      .filter(([typeId]) => typeId === MARKER_TYPES_BY_ID.indexOf(routeType))
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

    const routeType = currentMode.activeRouteType || "route";
    const routeNodes = getRouteNodes(routeType);
    if (routeNodes.length === 0) {
      if (routePreviewLine) {
        leafletMap.removeLayer(routePreviewLine);
        routePreviewLine = null;
      }
      return;
    }

    // Define colors for each route type
    const routeColors = {
      route: "#fbbf24",
      route1: "#3b82f6",
      route2: "#ef4444",
    };
    const previewColor = routeColors[routeType] || routeColors.route;

    const lastNode = routeNodes[routeNodes.length - 1];
    const previewPath = [lastNode, cursorLatLng];

    if (routePreviewLine) {
      routePreviewLine.setLatLngs(previewPath);
      routePreviewLine.setStyle({ color: previewColor });
    } else {
      routePreviewLine = L.polyline(previewPath, {
        color: previewColor,
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
  const modeControls = setupModeButtons(pinButtons, routeButtons, (pinType, routeMode, routeType) => {
    currentMode.activePinType = pinType;
    currentMode.routeModeEnabled = routeMode;
    currentMode.activeRouteType = routeType;
    
    // Toggle CSS class on map container for hover effects
    const mapContainer = leafletMap.getContainer();
    if (routeMode && !adminMode) {
      mapContainer.classList.add('route-mode-active');
    } else {
      mapContainer.classList.remove('route-mode-active');
    }
    
    // Clear preview line when route mode is disabled
    if (!routeMode && routePreviewLine) {
      leafletMap.removeLayer(routePreviewLine);
      routePreviewLine = null;
    }
  });

  // Setup keyboard shortcuts for drawing tools
  document.addEventListener("keydown", (e) => {
    // Don't trigger if typing in an input field
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    
    // Q key - deselect all tools
    if (e.key === "q" || e.key === "Q") {
      if (modeControls && modeControls.deselectAll) {
        modeControls.deselectAll();
      }
      return;
    }
    
    // Number keys 1-6 for draw tools
    const keyMap = {
      "1": { type: "pin", value: "custom" },
      "2": { type: "pin", value: "custom1" },
      "3": { type: "pin", value: "custom2" },
      "4": { type: "route", value: "route" },
      "5": { type: "route", value: "route1" },
      "6": { type: "route", value: "route2" },
    };
    
    if (keyMap[e.key] && !adminMode) {
      const action = keyMap[e.key];
      
      if (action.type === "pin") {
        // Find and click the corresponding pin button
        const button = pinButtons.find(btn => btn.dataset.pinType === action.value);
        if (button) button.click();
      } else if (action.type === "route") {
        // Find and click the corresponding route button
        const button = routeButtons.find(btn => btn.dataset.routeType === action.value);
        if (button) button.click();
      }
    }
  });

  // Setup visibility toggles for draw buttons
  if (!adminMode) {
    const visibilityToggles = document.querySelectorAll(".button-visibility-toggle");
    visibilityToggles.forEach((toggle) => {
      toggle.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent button click
        const markerType = toggle.dataset.markerType;
        if (!markerType) return;

        // Toggle visibility
        const isVisible = toggleMarkerVisibility(markerType);
        
        // Update icon
        if (isVisible) {
          toggle.innerHTML = `
            <svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          `;
          toggle.classList.remove("hidden");
        } else {
          toggle.innerHTML = `
            <svg class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
              <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
          `;
          toggle.classList.add("hidden");
        }
        
        // Re-render markers
        renderState(handleMarkerClick);
      });
    });
  }
  
  // Saved routes functionality (define outside if block for accessibility)
  const showMainView = () => {
    if (mainView) mainView.style.display = "block";
    if (savedRoutesView) savedRoutesView.style.display = "none";
    if (backButton) {
      backButton.style.display = "block";
      backButton.textContent = "← Saved Maps";
    }
    if (savedRoutesTitle) savedRoutesTitle.style.display = "none";
    if (mainFooter) mainFooter.style.display = "block";
    if (savedRoutesFooter) savedRoutesFooter.style.display = "none";
  };

  const showSavedRoutesView = () => {
    if (mainView) mainView.style.display = "none";
    if (savedRoutesView) savedRoutesView.style.display = "block";
    if (backButton) backButton.style.display = "none";
    if (savedRoutesTitle) savedRoutesTitle.style.display = "block";
    if (mainFooter) mainFooter.style.display = "none";
    if (savedRoutesFooter) savedRoutesFooter.style.display = "block";
    renderSavedRoutesList();
  };

  const renderSavedRoutesList = () => {
      const routes = getSavedRoutes();
      
      if (routes.length === 0) {
        savedRoutesList.innerHTML = "";
        if (emptyRoutesMessage) emptyRoutesMessage.style.display = "block";
        return;
      }

      if (emptyRoutesMessage) emptyRoutesMessage.style.display = "none";
      
      savedRoutesList.innerHTML = routes
        .reverse()
        .map((route) => {
          const mapName = MAPS.find((m) => m.id === route.mapId)?.label || route.mapId;
          const savedDate = new Date(route.savedAt);
          const date = savedDate.toLocaleDateString();
          const time = savedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return `
            <div class="saved-route-item" data-route-id="${route.id}">
              <div class="saved-route-content">
                <div class="saved-route-name">${route.name}</div>
                <div class="saved-route-info">${mapName} · ${date} ${time}</div>
              </div>
              <button class="saved-route-share" data-route-id="${route.id}" data-map-id="${route.mapId}" data-state="${route.state}" title="Copy share link">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                </svg>
              </button>
              <button class="saved-route-delete" data-route-id="${route.id}" title="Delete route">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>
            </div>
          `;
        })
        .join("");

      // Add click handlers for route items
      savedRoutesList.querySelectorAll(".saved-route-item").forEach((item) => {
        item.addEventListener("click", (e) => {
          // Don't load route if clicking action buttons
          if (e.target.closest(".saved-route-delete") || e.target.closest(".saved-route-share")) return;
          const routeId = item.dataset.routeId;
          loadSavedRoute(routeId);
        });
      });

      // Add click handlers for share buttons
      savedRoutesList.querySelectorAll(".saved-route-share").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const mapId = btn.dataset.mapId;
          const stateString = btn.dataset.state;
          
          // Construct share URL
          const url = new URL(window.location.href);
          url.searchParams.set("state", stateString);
          url.searchParams.set("map", mapId);
          const urlStr = url.toString();
          
          // Copy to clipboard
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(urlStr);
              
              // Visual feedback
              const originalHTML = btn.innerHTML;
              btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
              btn.style.color = "#22c55e";
              setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.style.color = "";
              }, 2000);
            } else {
              prompt("Copy this URL:", urlStr);
            }
          } catch (err) {
            console.error("Failed to copy URL:", err);
          }
        });
      });

      // Add click handlers for delete buttons
      savedRoutesList.querySelectorAll(".saved-route-delete").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const routeId = btn.dataset.routeId;
          showDeleteModal(routeId, renderSavedRoutesList);
        });
      });
  };

  const loadSavedRoute = async (routeId) => {
      const route = getRoute(routeId);
      if (!route) return;

      // Switch to the correct map
      const targetMap = MAPS.find((m) => m.id === route.mapId);
      if (!targetMap) return;

      mapSelectEl.value = route.mapId;

      // Load the map
      try {
        await loadMap(leafletMap, targetMap, markersLayer, routeLayer);
        await loadFixedMarkers(route.mapId);
        // Clear existing state before loading saved route
        clearState();
      } catch (err) {
        console.error("Failed to load map:", err);
        return;
      }

      // Decode and load the state
      try {
        const stateData = await decodeStateFromUrl();
        // The state is stored directly in route.state, but we need to decode it
        // Actually, we need to manually construct a URL with the state param
        const fakeUrl = `?state=${route.state}`;
        const params = new URLSearchParams(fakeUrl);
        const encoded = params.get("state");
        
        if (encoded) {
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
              json = new TextDecoder().decode(bytes);
            }
          } else {
            json = new TextDecoder().decode(bytes);
          }

          const stateArray = JSON.parse(json);
          if (Array.isArray(stateArray)) {
            setState(stateArray);
            renderState(handleMarkerClick);
          }
        }
      } catch (err) {
        console.error("Failed to load route state:", err);
      }

      // Set route name and show main view
      if (routeNameInput) routeNameInput.value = route.name;
      showMainView();
  };

  if (!adminMode) {
    setupShareButton(
      shareButtonEl,
      async () => encodeStateToUrl(getState()),
      () => mapSelectEl.value
    );

    // Back button toggles between views
    if (backButton) {
      backButton.addEventListener("click", () => {
        if (mainView && mainView.style.display !== "none") {
          showSavedRoutesView();
        } else {
          showMainView();
        }
      });
    }

    // Clear map button
    if (clearMapButton) {
      clearMapButton.addEventListener("click", () => {
        if (confirm("Clear all markers and routes from the map?")) {
          clearState();
          renderState(handleMarkerClick);
        }
      });
    }

    // Save route button
    if (saveRouteButton) {
      saveRouteButton.addEventListener("click", async () => {
        const routeName = routeNameInput?.value || "Unnamed map";
        const currentMapId = mapSelectEl.value;
        const stateString = await encodeStateToUrl(getState());
        
        const savedRoute = saveRoute(routeName, currentMapId, stateString);
        if (savedRoute) {
          const originalText = saveRouteButton.textContent;
          saveRouteButton.textContent = "✓ Saved!";
          setTimeout(() => {
            saveRouteButton.textContent = originalText;
          }, 2000);
        }
      });
    }

    // New route button - create a clean slate
    if (newRouteButton) {
      newRouteButton.addEventListener("click", () => {
        // Clear current state
        clearState();
        renderState(handleMarkerClick);
        
        // Reset route name
        if (routeNameInput) routeNameInput.value = "Unnamed map";
        
        // Show main view
        showMainView();
      });
    }

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
    // Route mode: add route node at marker location
    if (currentMode.routeModeEnabled && !adminMode) {
      const latlng = marker.getLatLng();
      addMarker(latlng, currentMode.activeRouteType || "route");
      return;
    }
    
    // If in custom marker draw mode and clicked on a custom marker, remove it
    if (
      !adminMode &&
      currentMode.activePinType &&
      (currentMode.activePinType === "custom" || currentMode.activePinType === "custom1" || currentMode.activePinType === "custom2") &&
      (marker.markerType === "custom" || marker.markerType === "custom1" || marker.markerType === "custom2")
    ) {
      const idx = marker.stateIndex;
      if (idx !== undefined) {
        removeMarker(idx);
      }
    }
  };

  // Store the handler globally so renderState can use it
  window._markerClickHandler = handleMarkerClick;
  
  // Set up click handler for fixed markers
  const handleFixedMarkerClick = (marker, e) => {
    // Route mode: add route node at marker location
    if (currentMode.routeModeEnabled && !adminMode) {
      const latlng = marker.getLatLng();
      addMarker(latlng, currentMode.activeRouteType || "route");
    }
  };
  
  // Store globally for fixedMarkers.js
  window._fixedMarkerClickHandler = handleFixedMarkerClick;

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
      addMarker(e.latlng, currentMode.activeRouteType || "route");
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
    
    // Show main view when loading from a shared URL
    if (!adminMode) {
      if (routeNameInput) routeNameInput.value = "Unnamed map";
      showMainView();
    }
  } else if (!adminMode) {
    // No URL state - show saved routes view
    showSavedRoutesView();
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
      // Re-render user markers after map switch
      if (!adminMode) {
        renderState(handleMarkerClick);
      }
    } catch (err) {
      console.error("Failed to load selected map", err);
    }
  });
}

// Start the app
init();

