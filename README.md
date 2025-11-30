# ArcMaps

Static map viewer prototype that displays local PNG map assets with pan/zoom controls using Leaflet.

## Getting started

Install dependencies (for local testing scripts) and serve the project from the repository root, or simply open `index.html` directly in your browser. Examples:

```bash
npm install
npm start
# or use any static file server
python -m http.server 8000
```

Then visit `http://localhost:8000` and pick a map from the left-hand panel. The selected map is stored in the URL as `?map=<id>` so you can share deep links.

## Assets

High-resolution map images live in the `maps/` directory and are referenced directly by the viewer. Add new maps by dropping additional PNGs in `maps/` and updating `main.js` with the new entries.
