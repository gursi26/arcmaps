import { removeMarker, removeMarkersByType, undoLastMarker } from "./state.js";
import { undoLastFixedMarker, downloadFixedMarkers, clearFixedState, renderFixedMarkers } from "./fixedMarkers.js";

let contextMenuState = null;

// Context menu helpers
export function hideContextMenu(contextMenuEl) {
  if (!contextMenuEl) return;
  contextMenuEl.hidden = true;
  contextMenuState = null;
}

export function showContextMenu(contextMenuEl, type, clientX, clientY, payload = {}) {
  if (!contextMenuEl) return;

  contextMenuState = { type, ...payload };

  const addNoteBtn = contextMenuEl.querySelector('[data-action="add-note"]');
  const deleteMarkerBtn = contextMenuEl.querySelector('[data-action="delete-marker"]');
  const deleteRouteBtn = contextMenuEl.querySelector('[data-action="delete-route"]');

  // Determine if marker can have notes (custom markers or route nodes)
  const canHaveNote = payload.marker && payload.marker.markerType && 
    (payload.marker.markerType.startsWith('custom') || payload.marker.markerType.startsWith('route'));
  
  // Check if this is a route node
  const isRouteNode = payload.marker && payload.marker.markerType && 
    payload.marker.markerType.startsWith('route');

  // Toggle which actions are visible and update text
  if (addNoteBtn) {
    if (canHaveNote) {
      // Check if marker already has a note
      const hasNote = window._getMarkerNote && 
        payload.marker && 
        payload.marker.stateIndex !== undefined &&
        window._getMarkerNote(payload.marker.stateIndex);
      
      addNoteBtn.textContent = hasNote ? "Edit Note" : "Add Note";
      addNoteBtn.style.display = "block";
    } else {
      addNoteBtn.style.display = "none";
    }
  }
  if (deleteMarkerBtn) {
    deleteMarkerBtn.style.display = payload.marker ? "block" : "none";
    deleteMarkerBtn.textContent = isRouteNode ? "Delete Node" : "Delete Marker";
  }
  if (deleteRouteBtn) {
    // Show "Delete Route" only for route nodes
    deleteRouteBtn.style.display = isRouteNode ? "block" : "none";
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
}

// Setup context menu event handlers
export function setupContextMenu(contextMenuEl, adminMode = false) {
  if (!contextMenuEl) return;
  
  // In admin mode, disable context menu entirely
  if (adminMode) {
    contextMenuEl.style.display = "none";
    return;
  }

  const addNoteBtn = contextMenuEl.querySelector('[data-action="add-note"]');
  const deleteMarkerBtn = contextMenuEl.querySelector('[data-action="delete-marker"]');
  const deleteRouteBtn = contextMenuEl.querySelector('[data-action="delete-route"]');

  // Close menu on outside click
  document.addEventListener("click", (e) => {
    if (!contextMenuEl.hidden && !contextMenuEl.contains(e.target)) {
      hideContextMenu(contextMenuEl);
    }
  });

  // Add note action
  if (addNoteBtn) {
    addNoteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (contextMenuState?.marker) {
        const marker = contextMenuState.marker;
        const idx = marker.stateIndex;
        
        // Show note input popup
        if (window._showNoteInput) {
          window._showNoteInput(idx, e.clientX, e.clientY);
        }
      }
      hideContextMenu(contextMenuEl);
    });
  }

  // Delete marker action
  if (deleteMarkerBtn) {
    deleteMarkerBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (contextMenuState?.marker) {
        const idx = contextMenuState.marker.stateIndex;
        removeMarker(idx);
      }
      hideContextMenu(contextMenuEl);
    });
  }

  // Delete route action (delete all route nodes of this type)
  if (deleteRouteBtn) {
    deleteRouteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (contextMenuState?.marker && contextMenuState.marker.markerType) {
        const routeType = contextMenuState.marker.markerType;
        removeMarkersByType(routeType);
      }
      hideContextMenu(contextMenuEl);
    });
  }
}

// Setup undo keyboard shortcut
export function setupUndoHandler(adminMode = false) {
  document.addEventListener("keydown", (e) => {
    const isUndoKey = (e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey);
    if (!isUndoKey) return;
    e.preventDefault();
    if (adminMode) {
      undoLastFixedMarker();
    } else {
      undoLastMarker();
    }
  });
}

// Setup pin/route mode buttons
export function setupModeButtons(pinButtons, routeButtons, onModeChange) {
  let activePinType = null;
  let routeModeEnabled = false;
  let activeRouteType = "route";

  const updatePinButtons = () => {
    pinButtons.forEach((btn) => {
      const type = btn.dataset.pinType;
      btn.classList.toggle("pin-button-active", type === activePinType);
    });
  };

  const updateRouteButtons = () => {
    routeButtons.forEach((btn) => {
      const type = btn.dataset.routeType || "route";
      btn.classList.toggle("route-button-active", routeModeEnabled && type === activeRouteType);
    });
  };

  // Pin type buttons
  pinButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.pinType;
      if (!type) return;

      activePinType = activePinType === type ? null : type;

      // Disable route mode when pin mode is active
      if (activePinType) {
        routeModeEnabled = false;
        updateRouteButtons();
      }

      updatePinButtons();
      onModeChange(activePinType, false, activeRouteType);
    });
  });

  // Route drawing buttons
  routeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.routeType || "route";
      
      // If clicking the same route button, toggle off
      if (routeModeEnabled && activeRouteType === type) {
        routeModeEnabled = false;
      } else {
        // Otherwise, enable route mode with this route type
        routeModeEnabled = true;
        activeRouteType = type;
        activePinType = null;
        updatePinButtons();
      }

      updateRouteButtons();
      onModeChange(null, routeModeEnabled, activeRouteType);
    });
  });

  updatePinButtons();
  updateRouteButtons();

  // Function to deselect all tools
  const deselectAll = () => {
    activePinType = null;
    routeModeEnabled = false;
    updatePinButtons();
    updateRouteButtons();
    onModeChange(null, false, activeRouteType);
  };

  return { activePinType, routeModeEnabled, activeRouteType, deselectAll };
}

// Setup share button
export function setupShareButton(shareButton, getStateCallback, getMapId) {
  if (!shareButton) return;

  const originalText = shareButton.textContent.trim() || "Share Map URL";
  let resetTimeoutId = null;

  const showCopied = () => {
    if (resetTimeoutId) clearTimeout(resetTimeoutId);
    shareButton.textContent = "URL copied to clipboard ✓";
    resetTimeoutId = setTimeout(() => {
      shareButton.textContent = originalText;
    }, 3000);
  };

  shareButton.addEventListener("click", async () => {
    try {
      const encoded = await getStateCallback();
      const url = new URL(window.location.href);
      url.searchParams.set("state", encoded);
      url.searchParams.set("map", getMapId());

      const urlStr = url.toString();

      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(urlStr);
        showCopied();
      } else {
        prompt("Copy this URL:", urlStr);
      }
    } catch (err) {
      console.error("Failed to build or copy share URL", err);
    }
  });
}

// Setup admin controls
export function setupAdminControls(adminControlsEl, getMapId) {
  if (!adminControlsEl) return;

  const saveBtn = adminControlsEl.querySelector('[data-action="save-fixed"]');
  const clearBtn = adminControlsEl.querySelector('[data-action="clear-fixed"]');

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      const mapId = getMapId();
      downloadFixedMarkers(mapId);
      
      // Show feedback
      const originalText = saveBtn.textContent;
      saveBtn.textContent = "Saved! ✓";
      setTimeout(() => {
        saveBtn.textContent = originalText;
      }, 2000);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      if (confirm("Clear all fixed markers for this map?")) {
        clearFixedState();
        renderFixedMarkers();
      }
    });
  }
}

