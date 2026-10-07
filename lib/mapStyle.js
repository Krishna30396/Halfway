'use client';

import { useEffect, useState } from 'react';

// OpenFreeMap vector styles: free, no key, same look in 2D and 3D.
export const STYLE_URL = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

export const MAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

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

// Liberty ships 3D buildings; Dark doesn't, so add them from the same data.
export function add3dBuildings(map, mode) {
  if (map.getStyle().layers.some((l) => l.type === 'fill-extrusion')) return;
  map.addLayer({
    id: 'halfway-3d-buildings',
    source: 'openmaptiles',
    'source-layer': 'building',
    type: 'fill-extrusion',
    minzoom: 14,
    paint: {
      'fill-extrusion-color': mode === 'dark' ? '#30343a' : '#d6d0c4',
      'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 10],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': 0.85,
    },
  });
}
