// Rating, price, photos and reviews for a place, from Google Maps via SerpApi.
// Server-only. Every place is fetched once and then kept for good (Supabase
// table `place_info` when the service key is set, plus an in-process cache), so
// repeat opens cost no searches, for anyone. Photos, menu and reviews are never
// fetched twice; only rating, price and hours are refreshed when they get old.
// Searches are paced across the month so the free allowance never runs out.
//
// Places seeded from the Hyderabad search (scripts/seed-hyderabad.mjs) already
// have Google's id and a cover photo, so opening one skips the find search.
import { createClient } from '@supabase/supabase-js';
import { haversine } from '@/lib/geo';

const SERPAPI = 'https://serpapi.com/search.json';
const REFRESH_MS = 90 * 24 * 60 * 60 * 1000; // rating / price / hours after ~90 days
const MATCH_KM = 0.4; // Google's pin must be this close to ours
const SEED_MATCH_KM = 0.15; // an OSM place and a seeded place are the same spot
const PHOTOS_MAX = 20;

// Survives hot reloads in dev and requests within one server instance.
// Capped at the most recently used places; Supabase holds the rest.
const MEM_MAX = 500;
const mem = globalThis.__placeInfoMem || (globalThis.__placeInfoMem = new Map());
function remember(key, row) {
  mem.delete(key); // re-insert so the Map's order is least → most recently used
  mem.set(key, row);
  while (mem.size > MEM_MAX) mem.delete(mem.keys().next().value);
}
const inflight = globalThis.__placeInfoInflight || (globalThis.__placeInfoInflight = new Map());

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function serp(params) {
  const u = new URL(SERPAPI);
  for (const [k, v] of Object.entries({ hl: 'en', ...params, api_key: process.env.SERPAPI_KEY })) {
    u.searchParams.set(k, v);
  }
  const res = await fetch(u, { signal: AbortSignal.timeout(12000), cache: 'no-store' });
  const json = await res.json();
  if (json.error && !/hasn't returned any results/i.test(json.error)) throw new Error(json.error);
  return json;
}

// ---- Monthly pacing -------------------------------------------------------
// Allow a search only if what is left still covers the remaining days at an
// even daily rate. Checking the account is free and does not use a search.
let account = { at: 0, left: 0, perMonth: 0 };
async function canSpend(n) {
  if (n === 0) return true;
  if (!process.env.SERPAPI_KEY) return false;
  if (Date.now() - account.at > 60_000) {
    try {
      const a = await (
        await fetch(`https://serpapi.com/account.json?api_key=${process.env.SERPAPI_KEY}`, {
          signal: AbortSignal.timeout(6000),
          cache: 'no-store',
        })
      ).json();
      account = { at: Date.now(), left: a.total_searches_left ?? 0, perMonth: a.searches_per_month ?? 0 };
    } catch {
      return false;
    }
  }
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysAfterToday = daysInMonth - now.getDate();
  const daily = account.perMonth / daysInMonth;
  const keepForLater = Math.floor(daysAfterToday * daily);
  if (account.left - n < keepForLater) return false;
  account.left -= n;
  return true;
}

// ---- Shaping SerpApi results ---------------------------------------------
const firstName = (s) => (s || '').trim().split(/\s+/)[0] || 'Someone';
const words = (s) => new Set((s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2));
const overlap = (a, b) => {
  const got = words(b);
  return [...words(a)].filter((w) => got.has(w)).length;
};

function bestMatch(json, name, lat, lng) {
  const list = json.place_results ? [json.place_results] : json.local_results || [];
  let best = null;
  for (const p of list) {
    const g = p.gps_coordinates;
    if (!g || !p.data_id) continue;
    const km = haversine([lat, lng], [g.latitude, g.longitude]);
    if (km > MATCH_KM) continue;
    const shared = overlap(name, p.title);
    const score = shared * 2 - km * 5;
    if (!best || score > best.score) best = { p, score, shared };
  }
  // A single result right on our pin is accepted even if the names differ.
  if (best && (best.shared > 0 || list.length === 1)) return best.p;
  return null;
}

// Google photo links differ only by their size ending ("=w203-h152-k-no"), so
// one base link per photo is kept and the app asks for the size it needs.
export const photoBase = (u) => (/googleusercontent\.com|ggpht\.com/.test(u) ? u.replace(/=[^/=]*$/, '') : u);
const shapePhotos = (json) =>
  (json.photos || [])
    .map((x) => x.image || x.thumbnail)
    .filter(Boolean)
    .map(photoBase)
    .slice(0, PHOTOS_MAX);

const shapeReviews = (json) =>
  (json.reviews || []).slice(0, 5).map((r) => ({
    name: firstName(r.user?.name),
    rating: r.rating ?? null,
    date: r.date || '',
    text: (r.snippet || r.extracted_snippet?.original || '').slice(0, 600),
  }));

function hoursText(p) {
  if (p.open_state) return p.open_state;
  if (typeof p.hours === 'string') return p.hours;
  return null;
}

// What a Google Maps search result tells us about the place itself.
const placeFields = (found) => ({
  dataId: found.data_id,
  title: found.title,
  rating: found.rating ?? null,
  reviewCount: found.reviews ?? null,
  price: found.price ?? null,
  type: found.type ?? null,
  address: found.address ?? null,
  hours: hoursText(found),
  cover: found.thumbnail ? photoBase(found.thumbnail) : null,
});

// ---- Store ----------------------------------------------------------------
async function load(key) {
  const m = mem.get(key);
  if (m) {
    remember(key, m);
    return m;
  }
  const client = db();
  if (!client) return null;
  const { data } = await client.from('place_info').select('info, fetched_at').eq('place_key', key).maybeSingle();
  if (!data) return null;
  const row = { ...data.info, fetchedAt: data.fetched_at };
  remember(key, row);
  return row;
}

// `fetchedAt` is when rating / price / hours were last checked.
async function save(key, info, fetchedAt = new Date().toISOString()) {
  const { fetchedAt: _old, ...clean } = info;
  const row = { ...clean, fetchedAt };
  remember(key, row);
  const client = db();
  if (client) {
    const cols = { place_key: key, info: clean, fetched_at: fetchedAt };
    const withPlace = Number.isFinite(clean.lat)
      ? { ...cols, lat: clean.lat, lng: clean.lng, category: clean.category || null, rating: clean.rating ?? null }
      : cols;
    // The lat/lng/category/rating columns come from supabase-places-seed.sql;
    // before that has run, save the row without them.
    const { error } = await client.from('place_info').upsert(withPlace, { onConflict: 'place_key' });
    if (error && withPlace !== cols) await client.from('place_info').upsert(cols, { onConflict: 'place_key' }).then(() => {}, () => {});
  }
  return row;
}

// Saved places inside a box around a point (needs the seed columns).
async function savedInBox(lat, lng, km, extra) {
  const client = db();
  if (!client) return [];
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((lat * Math.PI) / 180));
  let q = client
    .from('place_info')
    .select('place_key, info, fetched_at')
    .gte('lat', lat - dLat)
    .lte('lat', lat + dLat)
    .gte('lng', lng - dLng)
    .lte('lng', lng + dLng);
  if (extra) q = extra(q);
  const { data, error } = await q;
  return error ? [] : data || [];
}

// A seeded place at the same spot as an OSM one, so we can reuse its Google id.
async function findSeeded(name, lat, lng) {
  const rows = await savedInBox(lat, lng, SEED_MATCH_KM, (q) => q.like('place_key', 'g:%').limit(30));
  let best = null;
  for (const r of rows) {
    const km = haversine([lat, lng], [r.info.lat, r.info.lng]);
    const shared = overlap(name, r.info.title || r.info.name);
    if (!shared) continue;
    const score = shared * 2 - km * 10;
    if (!best || score > best.score) best = { r, score };
  }
  return best ? { ...best.r.info, fetchedAt: best.r.fetched_at } : null;
}

// Rows saved before galleries were tracked already have their photos.
const hasGallery = (row) => !!row && (row.gallery || Array.isArray(row.photos));
const isStale = (row) => !row.fetchedAt || Date.now() - new Date(row.fetchedAt).getTime() > REFRESH_MS;

// ---- Public ---------------------------------------------------------------
/**
 * Info for one place. `name`, `lat`, `lng` identify it; `key` is our stable id.
 * Returns { status: 'ok', info } | { status: 'notFound' } | { status: 'later' }.
 * Costs: 0 when saved; 1 for a seeded place (photos only); 1–2 for a new one
 * (find + photos, photos skipped when Google shows none). Reviews load on tap.
 */
export async function getPlaceInfo({ key, name, lat, lng, category }) {
  let saved = await load(key);
  if (saved?.notFound && !isStale(saved)) return { status: 'notFound' };
  if (hasGallery(saved) && !isStale(saved)) return { status: 'ok', info: saved };
  if (inflight.has(key)) return inflight.get(key);

  const job = (async () => {
    const asIs = () => (saved && !saved.notFound ? { status: 'ok', info: saved } : { status: 'later' });
    if (!saved || saved.notFound) {
      const seeded = await findSeeded(name, lat, lng).catch(() => null);
      if (seeded) saved = seeded;
    }
    const base = saved && !saved.notFound ? saved : null;

    // Rating / price / hours are old (or we don't know the place yet): one find search.
    const needFind = !base?.dataId || isStale(base);
    // Photos once, ever — and not at all when Google shows none for it.
    const needPhotos = !hasGallery(base);
    const spend = (needFind ? 1 : 0) + (needPhotos && !(base?.dataId && base.cover === null) ? 1 : 0);
    if (!(await canSpend(spend))) return asIs();

    let fields = {};
    let fetchedAt = base?.fetchedAt;
    if (needFind) {
      const found = bestMatch(
        await serp({ engine: 'google_maps', type: 'search', q: base?.title || name, ll: `@${lat},${lng},17z` }),
        name,
        lat,
        lng
      );
      if (!found) {
        if (base) {
          // Couldn't re-find it; keep what we have and try again next time it's old.
          return { status: 'ok', info: await save(key, base, new Date().toISOString()) };
        }
        await save(key, { notFound: true });
        return { status: 'notFound' };
      }
      fields = placeFields(found);
      fetchedAt = new Date().toISOString();
    }
    const info = {
      ...base,
      name: base?.name || name,
      lat: base?.lat ?? lat,
      lng: base?.lng ?? lng,
      category: base?.category || category || null,
      ...fields,
      cover: fields.cover !== undefined ? fields.cover : base?.cover ?? null,
    };

    if (needPhotos) {
      if (info.cover === null) {
        info.photos = []; // Google shows no photo for this place; don't spend on it
      } else {
        const photos = await serp({ engine: 'google_maps_photos', data_id: info.dataId });
        info.photos = shapePhotos(photos);
        info.menuCategory = (photos.categories || []).find((c) => /menu/i.test(c.title))?.id ?? null;
      }
      if (!info.photos.length && info.cover) info.photos = [info.cover];
      info.gallery = true;
    }
    return { status: 'ok', info: await save(key, info, fetchedAt) };
  })().finally(() => inflight.delete(key));

  inflight.set(key, job);
  return job;
}

/** Only what is already saved; never spends a search. */
export async function getSavedPlaceInfo(key) {
  const saved = await load(key);
  if (!saved || saved.notFound) return { status: 'none' };
  return { status: 'ok', info: saved };
}

const featuredShape = (place_key, info, lat, lng) => ({
  id: place_key,
  name: info.name || info.title,
  lat: info.lat,
  lng: info.lng,
  category: info.category || 'restaurant',
  rating: info.rating ?? null,
  reviewCount: info.reviewCount ?? null,
  price: info.price ?? null,
  type: info.type ?? null,
  photo: info.photos?.[0] || info.cover || null,
  distanceKm: Number.isFinite(lat) ? haversine([lat, lng], [info.lat, info.lng]) : null,
});

// Saved places near a point, for Explore's top-rated rail. Read at most once a
// minute per server instance and area.
const featuredMem = new Map();
export async function getFeatured(lat, lng, maxKm = 30) {
  const area = Number.isFinite(lat) ? `${lat.toFixed(1)},${lng.toFixed(1)}` : 'any';
  let hit = featuredMem.get(area);
  if (!hit || Date.now() - hit.at > 60_000) {
    let rows = Number.isFinite(lat)
      ? await savedInBox(lat, lng, maxKm, (q) => q.not('rating', 'is', null).order('rating', { ascending: false }).limit(300))
      : [];
    if (!rows.length) {
      // Before the seed columns exist: the old small-table read.
      const client = db();
      if (!client) return [];
      const { data } = await client.from('place_info').select('place_key, info').not('info->lat', 'is', null).limit(500);
      rows = data || [];
    }
    hit = { at: Date.now(), rows };
    featuredMem.set(area, hit);
  }
  return hit.rows
    .filter(({ info }) => !info.notFound && Number.isFinite(info.lat))
    .map(({ place_key, info }) => featuredShape(place_key, info, lat, lng))
    .filter((p) => p.distanceKm == null || p.distanceKm <= maxKm)
    // Places with photos first, then nearest.
    .sort((a, b) => !a.photo - !b.photo || (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
}

/**
 * Saved (mostly seeded) places for a Search: adds Google's cover photo and
 * rating to matching OSM results, and adds the places OSM doesn't have.
 */
export async function mergeSaved(results, { lat, lng, radiusKm, categoryIds }) {
  const rows = await savedInBox(lat, lng, radiusKm, (q) => q.in('category', categoryIds).limit(400)).catch(() => []);
  if (!rows.length) return results;
  const out = results.map((p) => ({ ...p }));
  for (const { place_key, info } of rows) {
    if (info.notFound || !Number.isFinite(info.lat)) continue;
    const km = haversine([lat, lng], [info.lat, info.lng]);
    if (km > radiusKm) continue;
    const same = out.find(
      (p) => haversine([p.lat, p.lng], [info.lat, info.lng]) <= SEED_MATCH_KM && overlap(p.name, info.title || info.name) > 0
    );
    const photo = info.photos?.[0] || info.cover || null;
    if (same) {
      same.photo = same.photo || photo;
      same.rating = same.rating ?? info.rating ?? null;
      continue;
    }
    out.push({
      id: place_key,
      name: info.name || info.title,
      lat: info.lat,
      lng: info.lng,
      category: info.category,
      cuisine: null,
      website: info.website || null,
      openingHours: null,
      street: info.address || null,
      distanceKm: km,
      photo,
      rating: info.rating ?? null,
    });
  }
  out.sort((a, b) => a.distanceKm - b.distanceKm);
  return out;
}

/** Menu photos, fetched the first time someone opens the Menu tab. */
export async function getMenuPhotos(key) {
  const saved = await load(key);
  if (!saved || saved.notFound || !saved.menuCategory) return { status: 'none' };
  if (saved.menuPhotos) return { status: 'ok', photos: saved.menuPhotos };
  if (!(await canSpend(1))) return { status: 'later' };
  const json = await serp({ engine: 'google_maps_photos', data_id: saved.dataId, category_id: saved.menuCategory });
  const row = await save(key, { ...saved, menuPhotos: shapePhotos(json) }, saved.fetchedAt);
  return { status: 'ok', photos: row.menuPhotos };
}

/** Reviews, fetched the first time someone opens them; then kept for everyone. */
export async function getReviews(key) {
  const saved = await load(key);
  if (!saved || saved.notFound || !saved.dataId) return { status: 'none' };
  if (saved.reviews) return { status: 'ok', reviews: saved.reviews };
  if (!(await canSpend(1))) return { status: 'later' };
  const json = await serp({ engine: 'google_maps_reviews', data_id: saved.dataId, sort_by: 'newestFirst' });
  const row = await save(key, { ...saved, reviews: shapeReviews(json) }, saved.fetchedAt);
  return { status: 'ok', reviews: row.reviews };
}
