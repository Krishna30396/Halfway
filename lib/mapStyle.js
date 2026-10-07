'use client';

import { useEffect, useState } from 'react';

const OSM_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

// Light: the classic, colourful OpenStreetMap map (pink main roads, orange
// roads, green parks). It's pictures, not data, so the 3D buildings come from
// OpenFreeMap's vector tiles of the same OpenStreetMap data, drawn on top.
const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 19,
      attribution: OSM_ATTRIBUTION,
    },
    openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

// Dark: OpenFreeMap's vector dark style. Both are free with no key.
export const MAP_STYLE = {
  light: OSM_STYLE,
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

export const MAP_ATTRIBUTION = {
  light: OSM_ATTRIBUTION,
  dark: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
};

export function themeMode() {
  const mode = document.documentElement.getAttribute('data-mode');
  if (mode === 'dark' || mode === 'light') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** 'light' | 'dark', following the in-app toggle and the phone's setting. */
export function useThemeMode() {
  const [mode, setMode] = useState(themeMode);
  useEffect(() => {
    const update = () => setMode(themeMode());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] });
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', update);
    return () => {
      observer.disconnect();
      media.removeEventListener('change', update);
    };
  }, []);
  return mode;
}

// Neither base map ships 3D buildings, so add them from OpenFreeMap's data.
export function add3dBuildings(map, mode) {
  if (map.getStyle().layers.some((l) => l.type === 'fill-extrusion')) return;
  map.addLayer({
    id: 'halfway-3d-buildings',
    source: 'openmaptiles',
    'source-layer': 'building',
    type: 'fill-extrusion',
    minzoom: 14,
    paint: {
      'fill-extrusion-color': mode === 'dark' ? '#30343a' : '#d9d0c9',
      'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 10],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': 0.85,
    },
  });
}
