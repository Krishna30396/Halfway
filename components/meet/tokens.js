'use client';

import { useMemo } from 'react';
import { useThemeMode } from '@/lib/mapStyle';

// Map libraries draw lines and circles as SVG/WebGL paint, which can't read
// CSS variables, so the theme's colours are resolved to real values here.
const FALLBACK = {
  light: { ember: '#F2541B', ink: '#8C2B0C', onInk: '#FFFFFF', paper: '#FCFBFA' },
  dark: { ember: '#F2541B', ink: '#FFC9AE', onInk: '#17171A', paper: '#0E0E10' },
};

export function readTokens(mode) {
  const fb = FALLBACK[mode] || FALLBACK.light;
  if (typeof window === 'undefined') return fb;
  const css = getComputedStyle(document.documentElement);
  const get = (name, f) => css.getPropertyValue(name).trim() || f;
  return {
    ember: get('--ember', fb.ember),
    ink: get('--color-friend', fb.ink),
    onInk: get('--on-ink', fb.onInk),
    paper: get('--paper', fb.paper),
  };
}

/** Ember / ink colours for the current light or dark theme. */
export function useMapColors() {
  const mode = useThemeMode();
  return useMemo(() => ({ mode, ...readTokens(mode) }), [mode]);
}

/** Rough travel minutes for a straight-line distance: ~1.3× for real roads at ~25 km/h. */
export function approxMinutes(km) {
  return (km * 1.3 * 60) / 25;
}
