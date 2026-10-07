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
  return { remainingKm, etaMin, next, nextKm, offRouteM: offKm * 1000 };
}

/**
 * Keeps a road route from `pos` to `dest` and progress along it, re-routing when
 * the person strays more than `offRouteM` from the line (at most every `minGapMs`).
 */
export function useLiveRoute(pos, dest, { offRouteM = 60, minGapMs = 15000 } = {}) {
  const [nav, setNav] = useState(null);
  const inFlight = useRef(false);
  const lastFetch = useRef(0);
  const destKey = dest ? `${dest.lat},${dest.lng}` : null;
  const progress = useMemo(() => routeProgress(nav, pos), [nav, pos?.lat, pos?.lng]);

  useEffect(() => {
    if (!destKey) setNav(null);
  }, [destKey]);

  useEffect(() => {
    if (!destKey || !pos || inFlight.current) return;
    const here = [pos.lat, pos.lng];
    if (haversine(here, [dest.lat, dest.lng]) < 0.05) return;
    const stale = !nav || nav.destKey !== destKey;
    const off = progress && progress.offRouteM > offRouteM;
    if (!stale && !off) return;
    if (Date.now() - lastFetch.current < (stale ? 5000 : minGapMs)) return;

    inFlight.current = true;
    lastFetch.current = Date.now();
    fetch(`/api/route?from=${here.map((v) => v.toFixed(5)).join(',')}&to=${dest.lat},${dest.lng}`)
      .then((r) => r.json())
      .then((d) => {
        const r = d.routes?.[0];
        if (r) setNav({ ...prepareRoute(r), destKey });
      })
      .catch(() => {})
      .finally(() => {
        inFlight.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destKey, pos?.lat, pos?.lng, nav, progress]);

  return { nav, progress };
}

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
