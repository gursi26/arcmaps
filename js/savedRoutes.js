// Saved routes management using localStorage

const STORAGE_KEY = "arcmaps_saved_routes";

// Get all saved routes from localStorage
export function getSavedRoutes() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (err) {
    console.error("Failed to load saved routes:", err);
    return [];
  }
}

// Save a new route to localStorage
export function saveRoute(routeName, mapId, stateString) {
  try {
    const routes = getSavedRoutes();
    const newRoute = {
      id: Date.now().toString(),
      name: routeName.trim() || "Unnamed route",
      mapId,
      state: stateString,
      savedAt: new Date().toISOString(),
    };
    routes.push(newRoute);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routes));
    return newRoute;
  } catch (err) {
    console.error("Failed to save route:", err);
    return null;
  }
}

// Delete a route from localStorage
export function deleteRoute(routeId) {
  try {
    const routes = getSavedRoutes();
    const filtered = routes.filter((r) => r.id !== routeId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    return true;
  } catch (err) {
    console.error("Failed to delete route:", err);
    return false;
  }
}

// Get a specific route by ID
export function getRoute(routeId) {
  const routes = getSavedRoutes();
  return routes.find((r) => r.id === routeId);
}

