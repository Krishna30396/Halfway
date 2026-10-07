// MapLibre runs tile parsing in a Web Worker that webpack can't bundle, so the
// worker file is served as a static asset matching the installed version.
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync('public/vendor', { recursive: true });
copyFileSync('node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs', 'public/vendor/maplibre-gl-worker.mjs');
