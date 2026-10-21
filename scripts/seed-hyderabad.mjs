// One-time Hyderabad place seed: neutral "places in {area}" searches on Serper's
// Google Maps endpoint (3 credits each, ~20 places per search), saved into
// Supabase place_info for good. Our own code tags category / veg / price; the
// searches never ask for those.
//
//   node scripts/seed-hyderabad.mjs --plan          list the searches and credits; no network
//   node scripts/seed-hyderabad.mjs --test          ONE search (3 credits); prints what Serper returns; saves nothing
//   node scripts/seed-hyderabad.mjs --run           every search; resumes where it stopped
//   node scripts/seed-hyderabad.mjs --run --page2   also page 2 for the busiest areas
//
// Needs SERPER_KEY, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local,
// and supabase-places-seed.sql run first.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs
    .readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map(([, k, v]) => [k, v.replace(/^"|"$/g, '')])
);

const AREAS = [
  // West / IT belt
  'Gachibowli', 'Hitech City', 'Madhapur', 'Kondapur', 'Kokapet', 'Financial District', 'Nanakramguda',
  'Raidurg', 'Manikonda', 'Narsingi', 'Lingampally', 'Chandanagar', 'Miyapur', 'Nizampet', 'Bachupally',
  'Kukatpally', 'KPHB Colony', 'Moosapet',
  // Central
  'Banjara Hills', 'Jubilee Hills', 'Film Nagar', 'Ameerpet', 'Panjagutta', 'Somajiguda', 'Begumpet',
  'Khairatabad', 'Lakdikapul', 'Himayatnagar', 'Abids', 'Koti', 'Nampally', 'Masab Tank', 'Mehdipatnam',
  'Tolichowki', 'Attapur',
  // Old City
  'Charminar', 'Banjara Darwaza',
  // North / East
  'Secunderabad', 'Tarnaka', 'Habsiguda', 'Uppal', 'Malkajgiri', 'Sainikpuri', 'AS Rao Nagar', 'Kompally', 'Alwal',
  // South / East
  'Dilsukhnagar', 'LB Nagar', 'Shamshabad',
];
const BUSY = new Set(['Gachibowli', 'Hitech City', 'Madhapur', 'Kondapur', 'Banjara Hills', 'Jubilee Hills', 'Kukatpally']);

// Neutral, physical places only: no veg, vibe or budget words.
const TEMPLATES = [
  'restaurants in {area}',
  'cafes in {area}',
  'hidden gem cafes in {area}',
  'new cafes in {area}',
  'bakeries and desserts in {area}',
  'street food in {area}',
  'places to hang out in {area}',
  'tourist places and parks in {area}',
  // 'biryani in {area}', // waiting on a yes: it's a cuisine word
];

// Greater Hyderabad; anything Google returns outside this is dropped.
const BOX = { s: 17.15, n: 17.75, w: 78.1, e: 78.85 };

// Google's type → our category chips (lib/categories.js). Order matters.
const TYPE_RULES = [
  // "Coffee bar", "juice bar" and "snack bar" aren't bars.
  [/(?<!coffee |juice |snack |dessert |salad |tea )bar|pub|brew|lounge|night ?club|wine/i, 'bar'],
  [/caf[eé]|coffee|tea house|tea shop|bakery|cake|dessert|ice cream|patisserie|chocolate|juice/i, 'cafe'],
  [/fast food|street food|snack|chaat|food court|tiffin|sandwich|burger|pizza delivery|shawarma/i, 'fastfood'],
  [/restaurant|biryani|dhaba|diner|eatery|meal|buffet|kitchen|grill|bistro/i, 'restaurant'],
  [/park|garden|lake|nature|zoo/i, 'park'],
  [/museum|art gallery|historical|monument|fort|palace|tourist attraction|heritage|temple|mosque|church|theatre|planetarium/i, 'culture'],
  [/bowling|gaming|arcade|escape room|amusement|go[- ]?kart|trampoline|play ?area|paintball/i, 'games'],
  [/shopping mall|mall|market/i, 'shopping'],
  [/gym|fitness|sports|stadium|swimming|badminton|cricket|football/i, 'sport'],
];
// Google's main type decides; the other types only when the main one says nothing.
const categoryOf = (p) => {
  for (const text of [p.type, (p.types || []).join(' | ')]) {
    if (!text) continue;
    for (const [re, id] of TYPE_RULES) if (re.test(text)) return id;
  }
  return null;
};
const isVeg = (p) => /vegetarian|pure veg/i.test([p.type, ...(p.types || [])].join(' ')) || null;
const photoBase = (u) => (u && /googleusercontent\.com|ggpht\.com/.test(u) ? u.replace(/=[^/=]*$/, '') : u || null);

function plan(page2) {
  const out = [];
  for (const area of AREAS) {
    for (const t of TEMPLATES) {
      const q = `${t.replace('{area}', area)}, Hyderabad`;
      out.push({ q, page: 1 });
      if (page2 && BUSY.has(area)) out.push({ q, page: 2 });
    }
  }
  return out;
}

// Serper needs a map position for page 2+: the middle of page 1's places.
const centres = new Map();
const centreOf = (places) => {
  const pts = (places || []).filter((p) => Number.isFinite(p.latitude));
  if (!pts.length) return null;
  const lat = pts.reduce((a, p) => a + p.latitude, 0) / pts.length;
  const lng = pts.reduce((a, p) => a + p.longitude, 0) / pts.length;
  return `@${lat.toFixed(5)},${lng.toFixed(5)},14z`;
};

async function serper(q, page) {
  const body = { q, gl: 'in', hl: 'en', page };
  if (page > 1) {
    if (!centres.get(q)) return { places: [], credits: 0 }; // page 1 found nothing
    body.ll = centres.get(q);
  }
  const res = await fetch('https://google.serper.dev/maps', {
    method: 'POST',
    headers: { 'X-API-KEY': env.SERPER_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Serper ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

function toRow(p, q) {
  const lat = p.latitude;
  const lng = p.longitude;
  if (!p.cid || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < BOX.s || lat > BOX.n || lng < BOX.w || lng > BOX.e) return null;
  const category = categoryOf(p);
  const info = {
    name: p.title,
    title: p.title,
    lat,
    lng,
    category,
    cid: String(p.cid),
    // SerpApi's data_id; Serper calls it fid. Lets a first open skip the find search.
    dataId: /^0x[0-9a-f]+:0x[0-9a-f]+$/i.test(p.fid || '') ? p.fid : null,
    placeId: p.placeId || null,
    rating: p.rating ?? null,
    reviewCount: p.ratingCount ?? null,
    price: p.priceLevel ?? null,
    type: p.type ?? null,
    types: p.types || null,
    veg: isVeg(p),
    address: p.address ?? null,
    website: p.website ?? null,
    phone: p.phoneNumber ?? null,
    cover: photoBase(p.thumbnailUrl),
    seeded: true,
    seedQuery: q,
  };
  return {
    place_key: `g:${info.cid}`,
    info,
    // Rating etc. are fresh as of now; galleries load on first open.
    fetched_at: new Date().toISOString(),
    lat,
    lng,
    category,
    rating: info.rating,
  };
}

const args = new Set(process.argv.slice(2));
const jobs = plan(args.has('--page2'));

if (args.has('--plan')) {
  console.log(`${AREAS.length} areas × ${TEMPLATES.length} searches${args.has('--page2') ? ' (+ page 2 for busy areas)' : ''}`);
  console.log(`= ${jobs.length} searches`);
  console.log('Serper charges 3 credits per Maps search (seen in the --test run):');
  console.log(`= ${jobs.length * 3} Serper credits`);
  for (const j of jobs.slice(0, 10)) console.log(' ', j.q, j.page > 1 ? `(page ${j.page})` : '');
  console.log('  …');
  process.exit(0);
}

if (!env.SERPER_KEY) throw new Error('SERPER_KEY is missing from .env.local');

if (args.has('--test')) {
  const json = await serper(jobs[1].q, 1);
  const places = json.places || [];
  console.log(`"${jobs[1].q}" → ${places.length} places; credits used: ${json.credits ?? '?'}`);
  console.log('fields:', Object.keys(places[0] || {}).join(', '));
  for (const p of places.slice(0, 5)) {
    const r = toRow(p, jobs[1].q);
    console.log(' ', p.title, '|', p.type, '→', r?.category, '| rating', p.rating, '| cover', p.thumbnailUrl ? 'yes' : 'no', '| fid', p.fid ? 'yes' : 'no');
  }
  process.exit(0);
}

if (!args.has('--run')) {
  console.log('Pass --plan, --test or --run.');
  process.exit(1);
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
fs.mkdirSync('seed-out', { recursive: true });
const PROGRESS = 'seed-out/progress.json';
const done = new Set(fs.existsSync(PROGRESS) ? JSON.parse(fs.readFileSync(PROGRESS, 'utf8')) : []);
if (fs.existsSync('seed-out/raw.jsonl')) {
  for (const line of fs.readFileSync('seed-out/raw.jsonl', 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(line);
    if (r.page === 1) centres.set(r.q, centreOf(r.places));
  }
}
let saved = 0;
let credits = 0;

for (const [i, j] of jobs.entries()) {
  const id = `${j.q}#${j.page}`;
  if (done.has(id)) continue;
  const json = await serper(j.q, j.page);
  credits += json.credits ?? 3;
  if (j.page === 1) centres.set(j.q, centreOf(json.places));
  const rows = [...new Map((json.places || []).map((p) => toRow(p, j.q)).filter(Boolean).map((r) => [r.place_key, r])).values()];
  fs.appendFileSync('seed-out/raw.jsonl', JSON.stringify({ q: j.q, page: j.page, places: json.places || [] }) + '\n');
  if (rows.length) {
    // ignoreDuplicates: a place already saved (maybe with its gallery) is left alone.
    const { error } = await supabase.from('place_info').upsert(rows, { onConflict: 'place_key', ignoreDuplicates: true });
    if (error) throw new Error(`Supabase: ${error.message} (did supabase-places-seed.sql run?)`);
    saved += rows.length;
  }
  done.add(id);
  fs.writeFileSync(PROGRESS, JSON.stringify([...done]));
  console.log(`${i + 1}/${jobs.length}  ${j.q}${j.page > 1 ? ' p2' : ''}  → ${rows.length}`);
}
console.log(`Done. ${credits} credits, ${saved} rows sent (duplicates skipped by the database).`);
