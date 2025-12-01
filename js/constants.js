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
  "metro-entrance": 2,
  route: 3,
  "security-breach": 4,
  "weapon-case": 5,
  metro: 6,
  elevator: 7,
  "raider-hatch": 8,
};

export const MARKER_TYPES_BY_ID = [
  "custom",
  "spawn",
  "metro-entrance",
  "route",
  "security-breach",
  "weapon-case",
  "metro",
  "elevator",
  "raider-hatch",
];

// Leaflet icons for different marker types
export const spawnIcon = L.divIcon({
  className: "pin-icon pin-icon-spawn",
  html: "S",
  iconSize: [26, 26],
  iconAnchor: [13, 26],
});

export const metroEntranceIcon = L.divIcon({
  className: "pin-icon pin-icon-metro-entrance",
  html: "M",
  iconSize: [26, 26],
  iconAnchor: [13, 26],
});

export const securityBreachIcon = L.divIcon({
  className: "pin-icon pin-icon-security-breach",
  html: "B",
  iconSize: [26, 26],
  iconAnchor: [13, 26],
});

export const weaponCaseIcon = L.divIcon({
  className: "pin-icon pin-icon-weapon-case",
  html: "W",
  iconSize: [26, 26],
  iconAnchor: [13, 26],
});

export const metroIcon = L.divIcon({
  className: "pin-icon pin-icon-metro",
  html: "T",
  iconSize: [26, 26],
  iconAnchor: [13, 26],
});

export const elevatorIcon = L.divIcon({
  className: "pin-icon pin-icon-elevator",
  html: "↕",
  iconSize: [26, 26],
  iconAnchor: [13, 26],
});

export const raiderHatchIcon = L.divIcon({
  className: "pin-icon pin-icon-raider-hatch",
  html: "R",
  iconSize: [26, 26],
  iconAnchor: [13, 26],
});

export const PIN_ICONS = {
  custom: null,
  spawn: spawnIcon,
  "metro-entrance": metroEntranceIcon,
  "security-breach": securityBreachIcon,
  "weapon-case": weaponCaseIcon,
  metro: metroIcon,
  elevator: elevatorIcon,
  "raider-hatch": raiderHatchIcon,
};

