// Configuration of available maps
export const MAPS = [
  { id: "stella-montis", label: "Stella Montis", tilesPath: "assets/map-tiles/stella-montis/tiles" },
  { id: "spaceport", label: "Spaceport", tilesPath: "assets/map-tiles/spaceport/tiles" },
  { id: "dam-battlegrounds", label: "Dam Battlegrounds", tilesPath: "assets/map-tiles/dam-battlegrounds/tiles" },
  { id: "buried-city", label: "Buried City", tilesPath: "assets/map-tiles/buried-city/tiles" },
  { id: "blue-gate", label: "Blue Gate", tilesPath: "assets/map-tiles/blue-gate/tiles" },
];

// Reserved IDs for user-drawn markers
const RESERVED_CUSTOM_IDS = {
  custom: 0,
  route: 3,
  custom1: 10,
  custom2: 11,
  route1: 12,
  route2: 13,
};

// Dynamic marker type data (populated on load)
export let MARKER_TYPES = { ...RESERVED_CUSTOM_IDS };
export let MARKER_TYPES_BY_ID = [];
export let PIN_ICONS = {
  custom: null,
  route: null,
  custom1: null,
  custom2: null,
  route1: null,
  route2: null,
};
export let MARKER_CATEGORIES = [];

// Load marker types from JSON
export async function loadMarkerTypes() {
  try {
    const response = await fetch("assets/fixed-markers/fixed-marker-types.json");
    const data = await response.json();
    
    MARKER_CATEGORIES = data.categories;
    
    // Find the maximum ID in the JSON to size the array appropriately
    let maxId = Math.max(...Object.values(RESERVED_CUSTOM_IDS));
    for (const category of data.categories) {
      for (const marker of category.markers) {
        if (marker.id > maxId) maxId = marker.id;
      }
    }
    
    // Build MARKER_TYPES_BY_ID array
    MARKER_TYPES_BY_ID = new Array(maxId + 1).fill(null);
    
    // Fill in reserved custom/route types
    for (const [type, id] of Object.entries(RESERVED_CUSTOM_IDS)) {
      MARKER_TYPES[type] = id;
      MARKER_TYPES_BY_ID[id] = type;
    }
    
    // Process fixed markers from JSON
    for (const category of data.categories) {
      for (const marker of category.markers) {
        const { id, type, icon } = marker;
        
        // Check if ID is reserved
        const reservedIds = Object.values(RESERVED_CUSTOM_IDS);
        if (reservedIds.includes(id)) {
          console.error(`ERROR: Marker type "${type}" uses reserved ID ${id}. Reserved IDs are: ${reservedIds.join(', ')}`);
          console.error(`Please use a different ID that is not in this list: ${reservedIds.join(', ')}`);
          continue; // Skip this marker
        }
        
        // Map both type string and numeric ID
        MARKER_TYPES[type] = id;
        MARKER_TYPES_BY_ID[id] = type;
        
        // Create Leaflet divIcon with SVG
        PIN_ICONS[type] = L.divIcon({
          className: `pin-icon pin-icon-${type}`,
          html: icon,
          iconSize: [26, 26],
          iconAnchor: [13, 26],
        });
      }
    }
    
    return true;
  } catch (error) {
    console.error("Failed to load marker types:", error);
    return false;
  }
}

