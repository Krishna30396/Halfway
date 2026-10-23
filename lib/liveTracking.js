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

// ---- My own position: which GPS readings to believe ---------------------------
const JUMP_KM = 0.3; // a reading this far from the last one…
const JUMP_KMH = 180; // …at an impossible speed is a glitch until a second reading agrees
const CONFIRM_KM = 0.15;

/**
 * Decides whether a new reading `p` ({lat, lng, accuracy}) replaces the current
 * position `cur` ({…, at}). Phones mix in rough Wi-Fi/network guesses and the
 * odd wild jump; neither should move your pin. Returns { fix, pending }: `fix`
 * is the position to use (or null to keep the current one), `pending` a
 * suspicious reading waiting for a second one to confirm it.
 */
export function acceptFix(cur, pending, p, now) {
  const fix = { ...p, at: now };
  if (cur?.at == null || now - cur.at > 60000) return { fix, pending: null };
  const better = p.accuracy != null && cur.accuracy != null && p.accuracy < cur.accuracy * 0.7;
  if (better) return { fix, pending: null };
  const worse = cur.accuracy != null && p.accuracy != null && p.accuracy > Math.max(100, cur.accuracy * 2);
  if (worse) return { fix: null, pending };
  const km = haversine([cur.lat, cur.lng], [p.lat, p.lng]);
  const kmh = (km / Math.max(1, (now - cur.at) / 1000)) * 3600;
  if (km > JUMP_KM && kmh > JUMP_KMH) {
    // Two readings in a row in the new place: it's real (e.g. GPS caught up).
    if (pending && haversine([pending.lat, pending.lng], [p.lat, p.lng]) < CONFIRM_KM) return { fix, pending: null };
    return { fix: null, pending: fix };
  }
  return { fix, pending: null };
}

// ---- Arrived ------------------------------------------------------------------
export const ARRIVE_KM = 0.15;
const LEAVE_KM = 0.4;

/**
 * Arrived at the place, allowing for GPS error (a reading can sit 100+ m off
 * near tall buildings) and staying arrived while walking around the entrance.
 */
export function isArrived(wasArrived, distKm, accuracyM) {
  if (distKm == null) return !!wasArrived;
  if (wasArrived) return distKm <= LEAVE_KM;
  return distKm <= ARRIVE_KM + Math.min(Math.max(accuracyM || 0, 0), 150) / 1000;
}

// ---- What to tell me about my own location --------------------------------------
export const ROUGH_M = 200;
export const MY_STALE_MS = 75000;
// Standing still, phones send no new readings; after this long ask for one.
export const PROBE_AFTER_MS = 30000;

/** null when all's well, else { kind: 'finding' | 'stale' | 'rough', … } for the on-screen strip. */
export function myLocationStatus({ sharing, manual, pos, now }) {
  if (!sharing || manual) return null;
  if (!pos) return { kind: 'finding' };
  if (now - pos.at > MY_STALE_MS) return { kind: 'stale', ageSec: Math.round((now - pos.at) / 1000) };
  if (pos.accuracy > ROUGH_M) return { kind: 'rough', accuracyM: Math.round(pos.accuracy) };
  return null;
}
