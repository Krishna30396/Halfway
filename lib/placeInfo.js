// Rating, price, photos and reviews for a place, from Google Maps via SerpApi.
// Server-only. Every place is fetched once and then kept (Supabase table
// `place_info` when the service key is set, plus an in-process cache), so
// repeat opens cost no searches. Searches are paced across the month so the
// free allowance never runs out mid-month.
import { createClient } from '@supabase/supabase-js';
import { haversine } from '@/lib/geo';

const SERPAPI = 'https://serpapi.com/search.json';
const FRESH_MS = 60 * 24 * 60 * 60 * 1000; // refresh after ~60 days
const MATCH_KM = 0.4; // Google's pin must be this close to ours

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

function bestMatch(json, name, lat, lng) {
  const list = json.place_results ? [json.place_results] : json.local_results || [];
  const want = words(name);
  let best = null;
  for (const p of list) {
    const g = p.gps_coordinates;
    if (!g || !p.data_id) continue;
    const km = haversine([lat, lng], [g.latitude, g.longitude]);
    if (km > MATCH_KM) continue;
    const got = words(p.title);
    const overlap = [...want].filter((w) => got.has(w)).length;
    const score = overlap * 2 - km * 5;
    if (!best || score > best.score) best = { p, score, overlap };
  }
  // A single result right on our pin is accepted even if the names differ.
  if (best && (best.overlap > 0 || list.length === 1)) return best.p;
  return null;
}

// Google photo links differ only by their size ending ("=w203-h152-k-no"), so
// one base link per photo is kept and the app asks for the size it needs.
const photoBase = (u) => (/googleusercontent\.com|ggpht\.com/.test(u) ? u.replace(/=[^/=]*$/, '') : u);
const shapePhotos = (json) =>
  (json.photos || [])
    .map((x) => x.image || x.thumbnail)
    .filter(Boolean)
    .map(photoBase)
    .slice(0, 20);

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

async function save(key, info) {
  const row = { ...info, fetchedAt: new Date().toISOString() };
  remember(key, row);
  const client = db();
  if (client) {
    await client
      .from('place_info')
      .upsert({ place_key: key, info, fetched_at: row.fetchedAt }, { onConflict: 'place_key' })
      .then(() => {}, () => {});
  }
  return row;
}

// ---- Public ---------------------------------------------------------------
/**
 * Info for one place. `name`, `lat`, `lng` identify it; `key` is our stable id.
 * Returns { status: 'ok', info } | { status: 'notFound' } | { status: 'later' }.
 */
export async function getPlaceInfo({ key, name, lat, lng }) {
  const saved = await load(key);
  if (saved && Date.now() - new Date(saved.fetchedAt).getTime() < FRESH_MS) {
    return saved.notFound ? { status: 'notFound' } : { status: 'ok', info: saved };
  }
  if (inflight.has(key)) return inflight.get(key);

  const job = (async () => {
    if (!(await canSpend(3))) return saved && !saved.notFound ? { status: 'ok', info: saved } : { status: 'later' };
    const found = bestMatch(
      await serp({ engine: 'google_maps', type: 'search', q: name, ll: `@${lat},${lng},17z` }),
      name,
      lat,
      lng
    );
    if (!found) {
      await save(key, { notFound: true });
      return { status: 'notFound' };
    }
    const [photos, reviews] = await Promise.all([
      serp({ engine: 'google_maps_photos', data_id: found.data_id }),
      serp({ engine: 'google_maps_reviews', data_id: found.data_id, sort_by: 'newestFirst' }),
    ]);
    const menuCat = (photos.categories || []).find((c) => /menu/i.test(c.title));
    const info = await save(key, {
      dataId: found.data_id,
      title: found.title,
      rating: found.rating ?? null,
      reviewCount: found.reviews ?? null,
      price: found.price ?? null,
      type: found.type ?? null,
      address: found.address ?? null,
      hours: hoursText(found),
      photos: shapePhotos(photos),
      menuCategory: menuCat?.id ?? null,
      menuPhotos: null,
      reviews: shapeReviews(reviews),
    });
    return { status: 'ok', info };
  })().finally(() => inflight.delete(key));

  inflight.set(key, job);
  return job;
}

/** Menu photos, fetched the first time someone opens the Menu tab. */
export async function getMenuPhotos(key) {
  const saved = await load(key);
  if (!saved || saved.notFound || !saved.menuCategory) return { status: 'none' };
  if (saved.menuPhotos) return { status: 'ok', photos: saved.menuPhotos };
  if (!(await canSpend(1))) return { status: 'later' };
  const json = await serp({ engine: 'google_maps_photos', data_id: saved.dataId, category_id: saved.menuCategory });
  const { fetchedAt, ...info } = saved;
  const row = await save(key, { ...info, menuPhotos: shapePhotos(json) });
  return { status: 'ok', photos: row.menuPhotos };
}
