// Live-meetup trip simulator: replays a real road route second by second through
// the app's own tracking code (lib/liveTracking, lib/navigation, lib/geo) and the
// same rules the meetup screen uses (upload gaps, heartbeat, stale warning,
// "almost there", "arrived"), for a sender whose phone is locked.
//
//   node scripts/sim-meetup.mjs                  (needs `npm run dev` on :3200 for the route)
//   node scripts/sim-meetup.mjs --timers=frozen  worst case: the locked phone runs no JS timers
//
// It does not touch the database or send notifications; it prints a timeline and
// a pass/fail table. Start and destination are seeded places from place_info.
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import { createClient } from '@supabase/supabase-js';

// The lib files import each other without ".js" (Next resolves that); do the same.
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (err) {
      if (spec.startsWith('.') && !spec.endsWith('.js')) return next(`${spec}.js`, ctx);
      throw err;
    }
  },
});
const { haversine, cumulative } = await import('../lib/geo.js');
const { sendGapMs, withSpeed, isArrived } = await import('../lib/liveTracking.js');
const { prepareRoute, routeProgress: rawProgress, paceEta, trackPace } = await import('../lib/navigation.js');

// ---- The meetup screen's rules (app/meet/[id]/page.jsx) ----------------------
const STALE_MS = 2 * 60 * 1000;
const ARRIVE_KM = 0.15;
const ALMOST_KM = 0.5;
const ALMOST_MIN = 5;
const HEARTBEAT_MS = 30000;
const MIN_MOVE_KM = 0.01;
const DISTANCE_FILTER_M = 5; // background watcher's distanceFilter

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const TIMERS = args.timers || 'throttled'; // throttled: hidden-page timers fire at most once a minute
const env = Object.fromEntries(
  fs
    .readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map(([, k, v]) => [k, v.replace(/^"|"$/g, '')])
);

// ---- Places from the database --------------------------------------------------
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: startRow } = await db.from('place_info').select('info').eq('place_key', args.from || 'g:1404654591918253546').single();
const start = startRow.info;
const { data: cands } = await db
  .from('place_info')
  .select('place_key, info, rating')
  .eq('category', 'cafe')
  .gte('lat', 17.44)
  .lte('lat', 17.47)
  .gte('lng', 78.36)
  .lte('lng', 78.39)
  .order('rating', { ascending: false })
  .limit(1);
const dest = cands[0].info;

const routeRes = await fetch(`http://localhost:3200/api/route?from=${start.lat},${start.lng}&to=${dest.lat},${dest.lng}`).then((r) => r.json());
const nav = prepareRoute(routeRes.routes[0]);
const { steps: cum, total } = cumulative(nav.coords);

// ---- The rider: scooter speeds, two red lights, a jam, a 4-minute stop, a GPS gap --
const speedAt = (frac) => {
  if (frac > 0.35 && frac < 0.45) return 8; // jam
  return 28;
};
// --scenario=clear: same ride without the 4-minute stop and the GPS gap.
const CLEAR = args.scenario === 'clear';
const STOPS = [
  { at: 0.2, sec: 60, why: 'red light' },
  ...(CLEAR ? [] : [{ at: 0.55, sec: 240, why: 'stuck (4 min, phone fine)' }]),
  { at: 0.7, sec: 60, why: 'red light' },
];
const GPS_GAP = CLEAR ? [2, 2] : [0.8, 0.86]; // no signal (flyover / underpass)
const LOCK_AT = 120; // sender locks the phone 2 minutes in

const pointAt = (km) => {
  let i = 1;
  while (i < cum.length && cum[i] < km) i++;
  if (i >= cum.length) return nav.coords[nav.coords.length - 1];
  const f = (km - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1]);
  const a = nav.coords[i - 1];
  const b = nav.coords[i];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
};
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const jitter = (p, m) => [p[0] + ((rand() - 0.5) * 2 * m) / 111000, p[1] + ((rand() - 0.5) * 2 * m) / 105000];

// The hook's pace-corrected ETA (useLiveRoute), on the simulated clock.
let simNow = 0;
let track = null;
const routeProgress = (n, pos) => {
  const p = rawProgress(n, pos);
  if (!p) return p;
  track = trackPace(track, simNow, p.remainingKm);
  return { ...p, etaMin: paceEta(n, track, simNow, p.remainingKm, p.etaMin) };
};

// ---- Run ---------------------------------------------------------------------------
const log = [];
const note = (t, who, msg) => log.push(`${fmtT(t)}  ${who.padEnd(8)} ${msg}`);
const fmtT = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`;

let km = 0;
let stopLeft = 0;
const stopsDone = new Set();
let lastFix = null; // last position the watcher reported
let myPos = null;
let lastSent = null;
let lastBeat = 0;
let wasFar = false;
let almost = null;
let arrived = null;
let trueArrive = null;
const uploads = [];
let friendSeen = null; // what the friend's phone shows (last row)
let staleFrom = null;
const staleWindows = [];
const etaChecks = [];
const speedErrors = [];
let maxGap = 0;

const upload = (t, force) => {
  if (!myPos) return;
  const now = t * 1000;
  if (!force && lastSent) {
    const moved = haversine([lastSent.lat, lastSent.lng], [myPos.lat, myPos.lng]);
    const speed = myPos.speed ?? (moved * 1e6) / Math.max(1, now - lastSent.t);
    if (now - lastSent.t < sendGapMs(speed) || (moved < MIN_MOVE_KM && now - lastSent.t < HEARTBEAT_MS)) return;
  }
  lastSent = { t: now, lat: myPos.lat, lng: myPos.lng };
  const prog = routeProgress(nav, myPos);
  const row = { lat: myPos.lat, lng: myPos.lng, updated_at: new Date(Date.UTC(2026, 0, 1) + now).toISOString(), eta_min: prog?.etaMin };
  if (uploads.length) maxGap = Math.max(maxGap, t - uploads[uploads.length - 1]);
  uploads.push(t);
  friendSeen = withSpeed(friendSeen, row); // the friend's realtime handler
};

for (let t = 0; t < 3600; t++) {
  simNow = t * 1000;
  const locked = t >= LOCK_AT;
  // Move.
  const frac = km / total;
  const stop = STOPS.find((s) => !stopsDone.has(s) && frac >= s.at);
  if (stop && !stopLeft) {
    stopsDone.add(stop);
    stopLeft = stop.sec;
    note(t, 'rider', `stops: ${stop.why}`);
  }
  let trueKmh = 0;
  if (stopLeft > 0) stopLeft--;
  else {
    trueKmh = speedAt(frac);
    km = Math.min(total, km + trueKmh / 3600);
  }
  const truth = pointAt(km);
  const distToDest = haversine(truth, [dest.lat, dest.lng]);
  if (trueArrive == null && distToDest <= ARRIVE_KM) trueArrive = t;

  // GPS: the background watcher fires after 5 m of (noisy) movement, except in the gap.
  const inGap = frac >= GPS_GAP[0] && frac <= GPS_GAP[1];
  const reading = jitter(truth, 6);
  if (!inGap && (!lastFix || haversine(lastFix, reading) * 1000 >= DISTANCE_FILTER_M)) {
    lastFix = reading;
    myPos = { lat: reading[0], lng: reading[1], accuracy: 10, speed: trueKmh / 3.6 };
    upload(t, false); // the app's effect on every new position
  }
  // Heartbeat timer (every 30 s on screen; hidden pages: at most once a minute, or never).
  const beatEvery = !locked ? HEARTBEAT_MS / 1000 : TIMERS === 'frozen' ? Infinity : 60;
  if (t - lastBeat >= beatEvery) {
    lastBeat = t;
    upload(t, true);
  }

  // Sender's alerts (same conditions as the screen).
  const myDist = myPos ? haversine([myPos.lat, myPos.lng], [dest.lat, dest.lng]) : null;
  const myEta = myPos ? routeProgress(nav, myPos)?.etaMin : null;
  if (myDist != null && !almost) {
    if (myDist > ALMOST_KM * 2) wasFar = true;
    const close = myDist <= ALMOST_KM || (myEta != null && myEta <= ALMOST_MIN);
    if (wasFar && close && !isArrived(false, myDist, myPos.accuracy)) {
      almost = { t, myDist, myEta, lockedFor: locked ? t - LOCK_AT : 0 };
      note(t, 'alert', `"almost there" sent (${(myDist * 1000).toFixed(0)} m, app ETA ${myEta?.toFixed(1)} min)`);
    }
  }
  if (myDist != null && isArrived(false, myDist, myPos.accuracy) && !arrived) {
    arrived = { t, lockedFor: locked ? t - LOCK_AT : 0 };
    note(t, 'alert', '"arrived" sent');
  }

  // Friend's screen.
  if (friendSeen) {
    const age = t * 1000 - (Date.parse(friendSeen.updated_at) - Date.UTC(2026, 0, 1));
    const stale = age > STALE_MS && !arrived;
    if (stale && staleFrom == null) {
      staleFrom = t;
      note(t, 'friend', 'sees "Not updating"');
    }
    if (!stale && staleFrom != null) {
      staleWindows.push([staleFrom, t]);
      note(t, 'friend', `back to "Tracking live" after ${t - staleFrom}s`);
      staleFrom = null;
    }
    if (trueKmh >= 20 && friendSeen.speedKmh != null && t % 10 === 0) speedErrors.push(Math.abs(friendSeen.speedKmh - trueKmh));
  }
  for (const f of [0.25, 0.5, 0.75]) {
    if (!etaChecks.find((e) => e.f === f) && frac >= f && myPos) etaChecks.push({ f, t, eta: routeProgress(nav, myPos)?.etaMin });
  }
  if (arrived && t > arrived.t + 30) break;
}
if (staleFrom != null) staleWindows.push([staleFrom, null]);

// ---- Report ------------------------------------------------------------------------
const trip = arrived?.t ?? trueArrive;
const minutes = trip / 60;
console.log(`Route: ${start.title} (Nizampet) → ${dest.title}, ${total.toFixed(1)} km, OSRM says ${nav.durationMin.toFixed(1)} min`);
console.log(`Timers on a locked phone: ${TIMERS}\n`);
console.log(log.join('\n'));
const rows = [];
const row = (name, pass, detail) => rows.push({ check: name, result: pass ? 'PASS' : 'FAIL', detail });
row('Uploads keep coming while locked', uploads.filter((t) => t > LOCK_AT).length > 10, `${uploads.length} uploads, ${(uploads.length / minutes).toFixed(1)}/min, longest gap ${maxGap}s`);
row('"Not updating" only for a real signal loss', staleWindows.length <= 1, staleWindows.length ? staleWindows.map(([a, b]) => `${fmtT(a)}–${b ? fmtT(b) : 'end'}`).join(', ') : 'never shown');
row('"Almost there" fires ~5 min out', !!almost && almost.t <= trueArrive - 120, almost ? `at ${fmtT(almost.t)}, real time left ${((trueArrive - almost.t) / 60).toFixed(1)} min` : 'never');
row('"Arrived" fires on arrival', !!arrived && Math.abs(arrived.t - trueArrive) <= 15, arrived ? `${arrived.t - trueArrive}s after reaching 150 m` : 'never');
row('Alerts leave a locked phone (new native path)', !!almost && !!arrived, `phone locked ${Math.round(almost?.lockedFor / 60)} / ${Math.round(arrived?.lockedFor / 60)} min when sent`);
row('Old path would have delivered them', !(almost?.lockedFor > 300) && !(arrived?.lockedFor > 300), 'WebView requests are throttled after ~5 min in the background');
for (const e of etaChecks) {
  const real = (trueArrive - e.t) / 60;
  row(`ETA at ${e.f * 100}% of the way`, Math.abs(e.eta - real) / real < 0.5, `app ${e.eta?.toFixed(1)} min vs real ${real.toFixed(1)} min`);
}
const avgSpeedErr = speedErrors.reduce((a, b) => a + b, 0) / Math.max(1, speedErrors.length);
row('Friend sees the right speed (cruising)', avgSpeedErr < 6, `average error ${avgSpeedErr.toFixed(1)} km/h`);
row('Realtime cost per hour', uploads.length / minutes * 60 < 2000, `~${Math.round((uploads.length / minutes) * 60)} messages/hour per sharer (free plan: 2M/month)`);
console.log('');
console.table(rows);
