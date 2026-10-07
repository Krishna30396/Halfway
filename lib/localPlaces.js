// Instant place search, on the phone, with no network per keystroke.
// public/data/places-in.json (built by scripts/build-place-index.mjs from
// OpenStreetMap) holds ~20k names: every Indian city and town, Telangana
// towns and villages, and Hyderabad neighbourhoods and landmarks. Live geocoder
// results are merged in underneath when they arrive.

import { haversine } from './geo';

const LAST_POS_KEY = 'halfway-last-pos';
const HYDERABAD = { lat: 17.385, lng: 78.4867 };

// Ranking = how far away × how much distance matters for that kind, plus a
// flat cost for small or niche kinds. A city 250 km off still beats a clinic
// 5 km off for "vijay"; a well-known area (Madhapur) beats a small colony
// that happens to be nearer for "mad".
const KIND_RANK = {
  city: [0.05, 0],
  suburb: [0.5, 0],
  town: [0.3, 2],
  airport: [0.2, 2],
  neighbourhood: [1, 3],
  quarter: [1, 3],
  metro: [1, 3],
  station: [1, 4],
  mall: [1, 4],
  village: [1.5, 8],
  hamlet: [2, 10],
  college: [1.5, 8],
  hospital: [1.5, 8],
  park: [1.5, 8],
  cinema: [1.5, 8],
  stadium: [1.5, 8],
  attraction: [1.5, 8],
  bus: [1.5, 10],
};
const OTHER_RANK = [2, 15];

const KIND_LABEL = {
  city: 'city',
  town: 'town',
  village: 'village',
  hamlet: 'village',
  suburb: 'area',
  neighbourhood: 'area',
  quarter: 'area',
  metro: 'metro',
  station: 'station',
  bus: 'bus stop',
  mall: 'mall',
  airport: 'airport',
  college: 'college',
  school: 'school',
  hospital: 'hospital',
  park: 'park',
  cinema: 'cinema',
  theatre: 'theatre',
  stadium: 'stadium',
  attraction: 'sight',
  museum: 'museum',
  zoo: 'zoo',
  library: 'library',
  restaurant: 'restaurant',
  fast_food: 'food',
  cafe: 'café',
  ice_cream: 'café',
  bar: 'bar',
  grocery: 'shop',
  clothing_store: 'shop',
  lodging: 'hotel',
  town_hall: 'hall',
  place_of_worship: 'temple / church',
};

/** Remember where the person is, so their next search ranks nearby places first. */
export function rememberPosition(lat, lng) {
  try {
    localStorage.setItem(LAST_POS_KEY, JSON.stringify({ lat: +lat.toFixed(3), lng: +lng.toFixed(3) }));
  } catch {
    // private mode — ranking falls back to Hyderabad
  }
}

function lastPosition() {
  try {
    const p = JSON.parse(localStorage.getItem(LAST_POS_KEY));
    if (Number.isFinite(p?.lat) && Number.isFinite(p?.lng)) return p;
  } catch {
    // ignore
  }
  return HYDERABAD;
}

const norm = (s) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

let entries = null;
let loading = null;

/** Starts loading the list (once); resolves when it's searchable. */
export function loadPlaces() {
  if (entries) return Promise.resolve(entries);
  loading ||= fetch('/data/places-in.json')
    .then((r) => r.json())
    .then((rows) => {
      entries = rows.map(([name, lat, lng, kind]) => {
        const n = norm(name);
        return { name, lat, lng, kind, n, words: n.split(' ') };
      });
      return entries;
    })
    .catch(() => {
      loading = null;
      return null;
    });
  return loading;
}

export const placesReady = () => !!entries;

// 0: the name starts with what was typed; 1: a word in it does; 2: every typed
// word starts a word in the name ("miyapur met"); -1: no match.
function matchTier(e, q, qWords) {
  if (e.n.startsWith(q)) return 0;
  if (e.words.some((w) => w.startsWith(q))) return 1;
  if (qWords.length > 1 && qWords.every((qw) => e.words.some((w) => w.startsWith(qw)))) return 2;
  return -1;
}

/** Best matches for `text`, nearest-and-most-relevant first. Empty until loaded. */
export function searchPlaces(text, near, limit = 8) {
  if (!entries) return [];
  const q = norm(text);
  if (!q) return [];
  const qWords = q.split(' ');
  const from = near || lastPosition();
  const hits = [];
  for (const e of entries) {
    const tier = matchTier(e, q, qWords);
    if (tier < 0) continue;
    const km = haversine([from.lat, from.lng], [e.lat, e.lng]);
    const [perKm, base] = KIND_RANK[e.kind] || OTHER_RANK;
    // Typing the whole name means they want that one, nearer partials aside.
    const exact = e.n === q ? -50 : 0;
    hits.push({ e, km, score: tier * 40 + km * perKm + base + exact });
  }
  hits.sort((a, b) => a.score - b.score);
  const out = [];
  const seen = new Set();
  for (const { e, km } of hits) {
    const key = `${e.n}|${e.lat.toFixed(2)}|${e.lng.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const dist = km < 1 ? `${Math.round(km * 1000)} m` : km < 100 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
    const kind = KIND_LABEL[e.kind] || 'place';
    out.push({ name: e.name, kind: `${kind} · ${dist}`, lat: e.lat, lng: e.lng, local: true });
    if (out.length >= limit) break;
  }
  return out;
}
