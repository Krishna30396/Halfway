import { useEffect, useMemo, useRef, useState } from 'react';
import { haversine, cumulative } from './geo';

/** Precompute what progress tracking needs from a route ({coords, steps, durationMin}). */
export function prepareRoute(route) {
  if (!route?.coords?.length) return null;
  const { coords } = route;
  const { steps: cum, total } = cumulative(coords);
  const nearestIndex = (pt, from = 0) => {
    let best = from;
    let bestD = Infinity;
    for (let i = from; i < coords.length; i++) {
      const d = haversine(pt, coords[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };
  const steps = (route.steps || []).map((s) => ({ ...s, index: nearestIndex(s.location) }));
  return { ...route, cum, total, steps };
}

/**
 * Where a person is along a prepared route: remaining km and minutes, the next
 * maneuver and how far away it is, and how far off the line they are.
 */
export function routeProgress(nav, pos) {
  if (!nav || !pos) return null;
  const here = [pos.lat, pos.lng];
  let idx = 0;
  let offKm = Infinity;
  for (let i = 0; i < nav.coords.length; i++) {
    const d = haversine(here, nav.coords[i]);
    if (d < offKm) {
      offKm = d;
      idx = i;
    }
  }
  const remainingKm = Math.max(0, nav.total - nav.cum[idx]) + offKm;
  const next = nav.steps.find((s) => s.index > idx && s.type !== 'depart') || nav.steps[nav.steps.length - 1] || null;
  const nextKm = next ? Math.max(0, nav.cum[next.index] - nav.cum[idx]) + offKm : remainingKm;
  const etaMin = nav.total > 0 && nav.durationMin != null ? (nav.durationMin * remainingKm) / nav.total : null;
  return { remainingKm, etaMin, next, nextKm, offRouteM: offKm * 1000, bearing: bearingAlong(nav, idx) };
}

function bearingBetween(a, b) {
  const rad = Math.PI / 180;
  const y = Math.sin((b[1] - a[1]) * rad) * Math.cos(b[0] * rad);
  const x =
    Math.cos(a[0] * rad) * Math.sin(b[0] * rad) -
    Math.sin(a[0] * rad) * Math.cos(b[0] * rad) * Math.cos((b[1] - a[1]) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

// Direction of travel: from the person's spot on the route to ~40 m further along,
// which stays steady even when GPS jitters or they're standing still.
function bearingAlong(nav, idx) {
  const { coords, cum } = nav;
  if (coords.length < 2) return 0;
  let j = idx + 1;
  while (j < coords.length - 1 && cum[j] - cum[idx] < 0.04) j++;
  const from = coords[Math.min(idx, coords.length - 2)];
  const to = coords[Math.min(j, coords.length - 1)];
  return bearingBetween(from, to);
}

/**
 * Keeps a road route from `pos` to `dest` and progress along it, re-routing when
 * the person strays more than `offRouteM` from the line (at most every `minGapMs`).
 */
export function useLiveRoute(pos, dest, { offRouteM = 60, minGapMs = 15000 } = {}) {
  const [nav, setNav] = useState(null);
  const [error, setError] = useState(null);
  const [retry, setRetry] = useState(0);
  const inFlight = useRef(false);
  const lastFetch = useRef(0);
  const destKey = dest ? `${dest.lat},${dest.lng}` : null;
  const progress = useMemo(() => routeProgress(nav, pos), [nav, pos?.lat, pos?.lng]);
  const atDestination = !!(pos && dest && haversine([pos.lat, pos.lng], [dest.lat, dest.lng]) < 0.05);

  useEffect(() => {
    if (!destKey) setNav(null);
  }, [destKey]);

  useEffect(() => {
    if (!destKey || !pos || inFlight.current || atDestination) return;
    const here = [pos.lat, pos.lng];
    const stale = !nav || nav.destKey !== destKey;
    const off = progress && progress.offRouteM > offRouteM;
    if (!stale && !off) return;
    if (Date.now() - lastFetch.current < (stale ? 5000 : minGapMs)) return;

    inFlight.current = true;
    lastFetch.current = Date.now();
    let retryTimer;
    fetch(`/api/route?from=${here.map((v) => v.toFixed(5)).join(',')}&to=${dest.lat},${dest.lng}`)
      .then((r) => r.json())
      .then((d) => {
        const r = d.routes?.[0];
        if (!r) throw new Error(d.error || 'No route found');
        setNav({ ...prepareRoute(r), destKey });
        setError(null);
      })
      .catch((err) => {
        setError(err.message || 'Could not load the route');
        // A standing user produces no new GPS events, so retry on a timer.
        retryTimer = setTimeout(() => setRetry((n) => n + 1), 6000);
      })
      .finally(() => {
        inFlight.current = false;
      });
    return () => clearTimeout(retryTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destKey, pos?.lat, pos?.lng, nav, progress, retry, atDestination]);

  return { nav, progress, error, atDestination };
}

export const fmtKm = (km) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`);
export const fmtMin = (m) =>
  m < 1 ? '<1 min' : m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${Math.round(m % 60)} min`;

const ARROWS = {
  left: '↰',
  'sharp left': '↰',
  'slight left': '↖',
  right: '↱',
  'sharp right': '↱',
  'slight right': '↗',
  straight: '↑',
  uturn: '↶',
};

export function maneuverArrow(step) {
  if (!step) return '↑';
  if (step.type === 'arrive') return '⚑';
  if (step.type === 'roundabout' || step.type === 'rotary' || step.type === 'roundabout turn') return '⟳';
  return ARROWS[step.modifier] || '↑';
}
