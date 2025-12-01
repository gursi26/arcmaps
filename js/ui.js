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

  const deleteMarkerBtn = contextMenuEl.querySelector('[data-action="delete-marker"]');
  const deleteRouteBtn = contextMenuEl.querySelector('[data-action="delete-route"]');

  // Toggle which actions are visible
  if (deleteMarkerBtn) {
    deleteMarkerBtn.style.display = type === "marker" ? "block" : "none";
  }
  if (deleteRouteBtn) {
    deleteRouteBtn.style.display = type === "route" ? "block" : "none";
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

  const deleteMarkerBtn = contextMenuEl.querySelector('[data-action="delete-marker"]');
  const deleteRouteBtn = contextMenuEl.querySelector('[data-action="delete-route"]');

  // Close menu on outside click
  document.addEventListener("click", (e) => {
    if (!contextMenuEl.hidden && !contextMenuEl.contains(e.target)) {
      hideContextMenu(contextMenuEl);
    }
  });

  // Delete marker action
  if (deleteMarkerBtn) {
    deleteMarkerBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (contextMenuState?.type === "marker" && contextMenuState.marker) {
        const idx = contextMenuState.marker.stateIndex;
        removeMarker(idx);
      }
      hideContextMenu(contextMenuEl);
    });
  }

  // Delete route action
  if (deleteRouteBtn) {
    deleteRouteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (contextMenuState?.type === "route") {
        removeMarkersByType("route");
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
export function setupModeButtons(pinButtons, routeButton, onModeChange) {
  let activePinType = null;
  let routeModeEnabled = false;

  const updatePinButtons = () => {
    pinButtons.forEach((btn) => {
      const type = btn.dataset.pinType;
      btn.classList.toggle("pin-button-active", type === activePinType);
    });
  };

  const updateRouteButton = () => {
    routeButton.classList.toggle("route-button-active", routeModeEnabled);
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
        updateRouteButton();
      }

      updatePinButtons();
      onModeChange(activePinType, false);
    });
  });

  // Route drawing button
  if (routeButton) {
    routeButton.addEventListener("click", () => {
      routeModeEnabled = !routeModeEnabled;

      if (routeModeEnabled) {
        activePinType = null;
        updatePinButtons();
      }

      updateRouteButton();
      onModeChange(null, routeModeEnabled);
    });
  }

  updatePinButtons();
  updateRouteButton();

  return { activePinType, routeModeEnabled };
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

