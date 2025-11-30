const mapList = [
  { id: 'blue-gate', name: 'Blue Gate', file: 'maps/blue-gate.png' },
  { id: 'buried-city', name: 'Buried City', file: 'maps/buried-city.png' },
  { id: 'dam-battlegrounds', name: 'Dam Battlegrounds', file: 'maps/dam-battlegrounds.png' },
  { id: 'spaceport', name: 'Spaceport', file: 'maps/spaceport.png' },
  { id: 'stella-montis', name: 'Stella Montis', file: 'maps/stella-montis.png' },
];

const mapSelect = document.getElementById('map-select');
const sidebar = document.querySelector('.sidebar');
const toggleButton = document.querySelector('.sidebar__toggle');
const toggleIcon = document.querySelector('.sidebar__toggle-icon');
let leafletMap;
let currentOverlay;

function populateOptions() {
  mapList.forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.name;
    mapSelect.appendChild(option);
  });
}

function getSelectedMapFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const mapId = params.get('map');
  if (mapId && mapList.some((item) => item.id === mapId)) {
    return mapId;
  }
  return mapList[0].id;
}

function updateUrl(mapId) {
  const params = new URLSearchParams(window.location.search);
  params.set('map', mapId);
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, '', newUrl);
}

function loadImageOverlay(mapId) {
  const mapConfig = mapList.find((entry) => entry.id === mapId);
  if (!mapConfig) return;

  const img = new Image();
  img.src = mapConfig.file;
  img.onload = () => {
    const { width, height } = img;
    const bounds = [
      [0, 0],
      [height, width],
    ];

    if (!leafletMap) {
      leafletMap = L.map('map', {
        crs: L.CRS.Simple,
        minZoom: -5,
        maxZoom: 5,
        zoomSnap: 0.25,
      });
    }

    if (currentOverlay) {
      leafletMap.removeLayer(currentOverlay);
    }

    currentOverlay = L.imageOverlay(mapConfig.file, bounds).addTo(leafletMap);
    leafletMap.setMaxBounds(bounds);
    leafletMap.fitBounds(bounds);
    leafletMap.invalidateSize(true);
  };
  img.onerror = () => {
    console.error(`Failed to load map image for ${mapId}`);
  };
}

function attachListeners() {
  mapSelect.addEventListener('change', (event) => {
    const nextId = event.target.value;
    updateUrl(nextId);
    loadImageOverlay(nextId);
  });

  toggleButton.addEventListener('click', () => {
    const isCollapsed = sidebar.classList.toggle('sidebar--collapsed');
    toggleButton.setAttribute('aria-expanded', (!isCollapsed).toString());
    toggleButton.setAttribute(
      'aria-label',
      isCollapsed ? 'Show controls panel' : 'Hide controls panel',
    );
    toggleIcon.textContent = isCollapsed ? '▶' : '◀';
    setTimeout(() => {
      if (leafletMap) {
        leafletMap.invalidateSize();
      }
    }, 250);
  });
}

function initialize() {
  populateOptions();
  attachListeners();
  const initialMap = getSelectedMapFromUrl();
  mapSelect.value = initialMap;
  loadImageOverlay(initialMap);
}

document.addEventListener('DOMContentLoaded', initialize);
