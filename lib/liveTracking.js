import { haversine } from './geo';

// How often to upload my location, by how fast I'm going (metres per second).
// On a bike or in a car the friend's pin should move every couple of seconds;
// standing still, a heartbeat is enough and saves battery and data.
export function sendGapMs(speedMps) {
  if (speedMps == null || !Number.isFinite(speedMps)) return 3000;
  if (speedMps >= 5) return 2000; // ~18 km/h and up: bike, car
  if (speedMps >= 1.2) return 3000; // walking, cycling slowly
  return 8000;
}

/** Adds a smoothed `speedKmh` to a friend's new location row, from the previous one. */
export function withSpeed(prev, next) {
  if (!prev || !next) return next;
  if (prev.updated_at === next.updated_at) return { ...next, speedKmh: prev.speedKmh };
  const dt = (Date.parse(next.updated_at) - Date.parse(prev.updated_at)) / 1000;
  if (!(dt >= 1 && dt <= 90)) return { ...next, speedKmh: prev.speedKmh };
  const kmh = (haversine([prev.lat, prev.lng], [next.lat, next.lng]) / dt) * 3600;
  // GPS jitter on a parked phone reads as a few km/h; treat it as stopped.
  const raw = kmh < 3 ? 0 : kmh;
  const speedKmh = prev.speedKmh == null ? raw : prev.speedKmh * 0.4 + raw * 0.6;
  return { ...next, speedKmh };
}

export const fmtSpeed = (kmh) => (kmh != null && kmh >= 3 ? `${Math.round(kmh)} km/h` : null);

/**
 * Animates a marker from where it is to `to` instead of jumping, so a friend on
 * the move glides between updates. `get`/`set` adapt Leaflet and MapLibre markers
 * ([lat, lng] in and out). Big jumps (a fresh fix after a gap) snap straight there.
 */
export function glideMarker(state, get, set, to) {
  const from = get();
  const now = performance.now();
  const sinceLast = state.last ? now - state.last : 0;
  state.last = now;
  cancelAnimationFrame(state.raf);
  if (!from || !sinceLast || haversine(from, to) > 2) {
    set(to);
    return;
  }
  // Glide for most of the gap between updates, but never lag more than 1.5 s.
  const ms = Math.min(1500, Math.max(250, sinceLast * 0.8));
  const step = (t) => {
    const f = Math.min(1, (t - now) / ms);
    set([from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f]);
    if (f < 1) state.raf = requestAnimationFrame(step);
  };
  state.raf = requestAnimationFrame(step);
}
