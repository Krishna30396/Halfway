import { CATEGORIES, CATEGORY_IDS } from '@/lib/categories';
import { cumulative, pointAtFraction } from '@/lib/geo';

/* ---------- "On the way": a corridor around the route ---------- */

// Typical door-to-door city speed. A detour off the route and back costs
// 2 × (distance from the route) at this speed.
export const CITY_KMH = 30;
export const corridorKm = (detourMin) => ((detourMin / 60) * CITY_KMH) / 2;
export const detourMinutes = (offKm) => ((2 * offKm) / CITY_KMH) * 60;

/** Thin a long polyline so distance checks stay cheap (keeps both ends). */
export function thin(coords, max = 400) {
  if (!coords || coords.length <= max) return coords || [];
  const step = (coords.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i++) out.push(coords[Math.round(i * step)]);
  return out;
}

/** Shortest distance (km) from a point to a [lat, lng] polyline. */
export function distanceToPolylineKm(lat, lng, coords) {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  const ky = 110.57;
  let best = Infinity;
  for (let i = 1; i < coords.length; i++) {
    const ax = (coords[i - 1][1] - lng) * kx;
    const ay = (coords[i - 1][0] - lat) * ky;
    const bx = (coords[i][1] - lng) * kx;
    const by = (coords[i][0] - lat) * ky;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? -(ax * dx + ay * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const px = ax + t * dx;
    const py = ay + t * dy;
    const d = Math.sqrt(px * px + py * py);
    if (d < best) best = d;
  }
  if (coords.length === 1) {
    best = Math.hypot((coords[0][1] - lng) * kx, (coords[0][0] - lat) * ky);
  }
  return best;
}

/**
 * Where to ask /api/places along a route: a handful of evenly spaced circles
 * that together cover the corridor (the API caps a circle at 25 km).
 */
export function corridorQueries(coords, widthKm) {
  const { total } = cumulative(coords);
  const n = Math.max(1, Math.min(6, Math.ceil(total / 15)));
  const radiusKm = Math.min(25, Math.max(1, total / (2 * n) + widthKm));
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = pointAtFraction(coords, (i + 0.5) / n)?.point;
    if (p) out.push({ lat: +p[0].toFixed(4), lng: +p[1].toFixed(4), radiusKm: +radiusKm.toFixed(1) });
  }
  return out;
}

/* ---------- Free-text "Not listed? Type anything" ---------- */

const KEYWORDS = {
  restaurant: ['food', 'restaurant', 'dinner', 'lunch', 'eat', 'pizza', 'sushi', 'curry', 'indian', 'italian', 'thai', 'chinese', 'brunch', 'steak', 'ramen', 'tapas', 'vegan'],
  cafe: ['cafe', 'café', 'coffee', 'tea', 'breakfast', 'bakery', 'cake', 'ice cream', 'gelato', 'dessert'],
  bar: ['bar', 'pub', 'beer', 'drink', 'drinks', 'cocktail', 'wine', 'brewery'],
  fastfood: ['burger', 'fast food', 'takeaway', 'chips', 'kebab', 'fried chicken', 'snack', 'quick'],
  park: ['park', 'garden', 'walk', 'picnic', 'outdoor', 'nature'],
  sport: ['gym', 'sport', 'fitness', 'swim', 'pool', 'climbing', 'tennis', 'football', 'leisure centre', 'yoga'],
  culture: ['cinema', 'movie', 'film', 'theatre', 'theater', 'museum', 'gallery', 'art', 'show', 'library'],
  games: ['bowling', 'escape', 'arcade', 'games', 'game', 'laser', 'karting', 'mini golf'],
  shopping: ['shop', 'shopping', 'mall', 'market', 'shops', 'store'],
};

/** Category ids a free-text query points at (empty when nothing matches). */
export function categoriesForQuery(q) {
  const s = (q || '').trim().toLowerCase();
  if (!s) return [];
  const hits = [];
  for (const [id, words] of Object.entries(KEYWORDS)) {
    if (words.some((w) => s.includes(w) || (s.length >= 4 && w.startsWith(s)))) hits.push(id);
  }
  for (const c of CATEGORIES) {
    if (!hits.includes(c.id) && c.label.toLowerCase().startsWith(s)) hits.push(c.id);
  }
  return hits.filter((id) => CATEGORY_IDS.has(id));
}

export const ALL_CATEGORY_IDS = CATEGORIES.map((c) => c.id);

/** "cafés", "cafés & parks", or "places" — for the button label. */
export function lookingFor(cats, query) {
  if (query?.trim()) return `“${query.trim()}”`;
  const names = cats.map((id) => CATEGORIES.find((c) => c.id === id)?.plural).filter(Boolean);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return 'places';
}
