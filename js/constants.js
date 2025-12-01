// Configuration of available maps
export const MAPS = [
  { id: "stella-montis", label: "Stella Montis", file: "maps/stella-montis.png" },
  { id: "spaceport", label: "Spaceport", file: "maps/spaceport.png" },
  { id: "dam-battlegrounds", label: "Dam Battlegrounds", file: "maps/dam-battlegrounds.png" },
  { id: "buried-city", label: "Buried City", file: "maps/buried-city.png" },
  { id: "blue-gate", label: "Blue Gate", file: "maps/blue-gate.png" },
];

// Marker type IDs - single source of truth
export const MARKER_TYPES = {
  custom: 0,
  spawn: 1,
  extract: 2,
  route: 3,
};

export const MARKER_TYPES_BY_ID = ["custom", "spawn", "extract", "route"];

// Leaflet icons for different marker types
export const spawnIcon = L.divIcon({
  className: "pin-icon pin-icon-spawn",
  html: "S",
  iconSize: [26, 26],
  iconAnchor: [13, 26],
});

export const extractIcon = L.divIcon({
  className: "pin-icon pin-icon-extract",
  html: "E",
  iconSize: [26, 26],
  iconAnchor: [13, 26],
});

export const PIN_ICONS = {
  custom: null,
  spawn: spawnIcon,
  extract: extractIcon,
};

