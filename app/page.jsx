'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { pointAtFraction, cumulative, haversine } from '@/lib/geo';
import { CATEGORY_IDS } from '@/lib/categories';
import { useFriends } from '@/lib/useFriends';
import { displayName, initialOf } from '@/lib/social';
import LocationInput from '@/components/LocationInput';
import Ribbon from '@/components/Ribbon';
import RadiusControl from '@/components/RadiusControl';
import CategoryChips from '@/components/CategoryChips';
import ResultsList from '@/components/ResultsList';
import BottomSheet from '@/components/BottomSheet';
import AreaGuide from '@/components/AreaGuide';
import ThemeToggle from '@/components/ThemeToggle';
import AuthButton from '@/components/AuthButton';
import SaveButton from '@/components/SaveButton';
import ModeSwitch from '@/components/home/ModeSwitch';
import OptionChips from '@/components/home/OptionChips';
import TabBar from '@/components/home/TabBar';
import HalfwayMark from '@/components/home/HalfwayMark';
import {
  ALL_CATEGORY_IDS,
  categoriesForQuery,
  corridorKm,
  corridorQueries,
  detourMinutes,
  distanceToPolylineKm,
  lookingFor,
  thin,
} from '@/components/home/search';
import styles from './page.module.css';
import { rememberPosition } from '@/lib/localPlaces';

const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => <div className={styles.mapLoading}>Loading map…</div>,
});

const DEFAULT_CATS = ['cafe'];
const PRIMARY_CATS = ['cafe', 'restaurant', 'sport'];
const NEAR_KM = [1, 3, 5];
const DETOUR_MIN = [5, 10, 15];
const MODE_SUFFIX = { halfway: 'halfway', nearby: 'nearby', onway: 'on the way' };
const NEAR_ZOOM = { 1: 15, 3: 13, 5: 12 };
const shortName = (s) => (s || '').split(',')[0].trim();
const capitalise = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function parsePoint(s) {
  const [lat, lng] = (s || '').split(',').map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </svg>
);

const BackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M15 5.5 8.5 12l6.5 6.5" />
  </svg>
);

/** Focus the visible copy of an input (desktop sidebar and phone sheet both render one). */
function focusVisible(selector) {
  const el = [...document.querySelectorAll(selector)].find((n) => n.offsetParent !== null);
  el?.focus();
}

export default function Home() {
  const router = useRouter();
  const f = useFriends();

  const [a, setA] = useState(null);
  const [b, setB] = useState(null);

  const [mode, setMode] = useState('halfway');
  const [nearKm, setNearKm] = useState(3);
  const [detour, setDetour] = useState(10);
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [tab, setTab] = useState('search');
  const [friendId, setFriendId] = useState(null);
  const [editingFrom, setEditingFrom] = useState(false);
  const [locating, setLocating] = useState(false);
  // The second location and the free-text bar stay folded until asked for.
  const [showB, setShowB] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [hint, setHint] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState({ snap: 'tall', key: 0 });

  const [routes, setRoutes] = useState(null);
  const [routeIndex, setRouteIndex] = useState(0);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState(null);

  const [hubs, setHubs] = useState(null);
  const [hubId, setHubId] = useState(null);
  const [hubsLoading, setHubsLoading] = useState(false);
  const [hubsNote, setHubsNote] = useState(null);
  const [hubsError, setHubsError] = useState(null);

  const [radius, setRadius] = useState(5);
  const [cats, setCats] = useState(DEFAULT_CATS);

  const [placesData, setPlacesData] = useState(null);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState(null);

  const [activePlaceId, setActivePlaceId] = useState(null);
  const [openPlaceId, setOpenPlaceId] = useState(null);
  const [panTarget, setPanTarget] = useState(null);
  const [mapCenter, setMapCenter] = useState(null);
  const [toast, setToast] = useState(null);

  const [restored, setRestored] = useState(false);
  const urlIntent = useRef({});
  const toastTimer = useRef(null);

  const showToast = useCallback((text) => {
    clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  }, []);

  const askSheet = useCallback((snap) => setSheet((s) => ({ snap, key: s.key + 1 })), []);

  /* ---------- Restore from the URL, then locate the user ---------- */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const pa = parsePoint(p.get('a'));
    const pb = parsePoint(p.get('b'));
    if (pa) setA({ ...pa, name: p.get('an') || `${pa.lat}, ${pa.lng}` });
    if (pb) setB({ ...pb, name: p.get('bn') || `${pb.lat}, ${pb.lng}` });

    urlIntent.current = {
      r: p.get('r') != null ? parseInt(p.get('r'), 10) : null,
      hub: p.get('hub'),
    };

    const rad = parseInt(p.get('rad'), 10);
    if (rad >= 1 && rad <= 25) setRadius(rad);

    const cat = (p.get('cat') || '').split(',').filter((id) => CATEGORY_IDS.has(id));
    if (cat.length) setCats(cat);

    const nk = parseInt(p.get('nk'), 10);
    if (NEAR_KM.includes(nk)) setNearKm(nk);
    const dt = parseInt(p.get('dt'), 10);
    if (DETOUR_MIN.includes(dt)) setDetour(dt);
    if (p.get('q')) setQuery(p.get('q').slice(0, 60));

    let m = p.get('m') === 'nearby' ? 'nearby' : p.get('m') === 'onway' ? 'onway' : 'halfway';
    if (p.get('view') === 'explore') {
      m = 'nearby';
      setTab('explore');
      setSubmitted(true);
      setSheet({ snap: 'half', key: 1 });
    } else if (m === 'nearby' ? pa : pa && pb) {
      // A shared link opens straight on its results.
      setSubmitted(true);
      setSheet({ snap: 'half', key: 1 });
    }
    setMode(m);

    setRestored(true);

    if (!pa && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = +pos.coords.latitude.toFixed(4);
          const lng = +pos.coords.longitude.toFixed(4);
          rememberPosition(pos.coords.latitude, pos.coords.longitude);
          if (!pb) setPanTarget({ lat, lng, zoom: 13 });
        },
        () => {},
        { maximumAge: 600000, timeout: 8000 }
      );
    }
  }, []);

  /* ---------- Route (Halfway + On the way) ---------- */
  const routeB = mode === 'nearby' ? null : b;

  useEffect(() => {
    if (!a || !routeB) {
      setRoutes(null);
      setRouteError(null);
      setHubs(null);
      setHubId(null);
      return;
    }
    if (a.lat === routeB.lat && a.lng === routeB.lng) {
      setRouteError('Those are the same place — pick two different locations.');
      setRoutes(null);
      setHubs(null);
      setHubId(null);
      setPlacesData(null);
      return;
    }

    const controller = new AbortController();
    setRouteLoading(true);
    setRouteError(null);
    setHubs(null);
    setHubId(null);
    setPlacesData(null);

    fetch(`/api/route?from=${a.lat},${a.lng}&to=${routeB.lat},${routeB.lng}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Routing failed');
        setRoutes(data.routes);
        const wanted = urlIntent.current.r;
        setRouteIndex(wanted != null && wanted >= 0 && wanted < data.routes.length ? wanted : 0);
        urlIntent.current.r = null;
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setRouteError(err.message);
      })
      .finally(() => setRouteLoading(false));

    return () => controller.abort();
  }, [a, routeB]);

  const selectedRoute = routes?.[routeIndex] || null;
  const midInfo = useMemo(
    () => (mode === 'halfway' && selectedRoute ? pointAtFraction(selectedRoute.coords, 0.5) : null),
    [selectedRoute, mode]
  );
  const midpoint = midInfo?.point || null;

  /* ---------- Hubs (Halfway) ---------- */
  useEffect(() => {
    if (!midpoint) return;
    const controller = new AbortController();
    setHubsLoading(true);
    setHubsNote(null);
    setHubsError(null);

    fetch(`/api/hubs?lat=${midpoint[0]}&lng=${midpoint[1]}&maxKm=15`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Hub search failed');
        setHubs(data.hubs);
        const wanted = urlIntent.current.hub;
        urlIntent.current.hub = null;
        if (wanted === 'raw') {
          setHubId('raw');
        } else if (wanted && data.hubs.some((h) => h.id === wanted)) {
          setHubId(wanted);
        } else if (data.hubs.length) {
          setHubId(data.hubs[0].id);
          if (data.searchedKm > 15) {
            setHubsNote(`Nearest towns are ${Math.round(data.searchedKm)} km out — widened the search.`);
          }
        } else {
          setHubId('raw');
          setHubsNote('No towns near the midpoint — using the exact halfway point.');
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setHubs([]);
          setHubId('raw');
          setHubsError("Couldn't look up nearby towns. Meeting at the exact halfway point instead.");
        }
      })
      .finally(() => setHubsLoading(false));

    return () => controller.abort();
  }, [midpoint?.[0], midpoint?.[1]]);

  const hub = useMemo(() => {
    if (!midpoint) return null;
    if (hubId && hubId !== 'raw') {
      const h = hubs?.find((x) => x.id === hubId);
      if (h) return h;
    }
    return { id: 'raw', name: 'Exact midpoint', lat: midpoint[0], lng: midpoint[1] };
  }, [hubId, hubs, midpoint]);

  const split = useMemo(() => {
    if (!selectedRoute || !midInfo) return null;
    if (!hub || hub.id === 'raw') {
      return { distA: midInfo.walked, distB: midInfo.total - midInfo.walked };
    }
    const coords = selectedRoute.coords;
    const { steps, total } = cumulative(coords);
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < coords.length; i++) {
      const d = haversine([hub.lat, hub.lng], coords[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return { distA: steps[best], distB: total - steps[best], offRouteKm: bestD };
  }, [selectedRoute, midInfo, hub]);

  /* ---------- What to search, per mode ---------- */
  const queryCats = useMemo(() => categoriesForQuery(query), [query]);
  const fetchCats = query.trim() ? (queryCats.length ? queryCats : ALL_CATEGORY_IDS) : cats;
  const nameFilter = query.trim() && !queryCats.length ? query.trim().toLowerCase() : null;

  const thinRoute = useMemo(
    () => (mode === 'onway' && selectedRoute ? thin(selectedRoute.coords) : null),
    [mode, selectedRoute]
  );

  const searchCenter = useMemo(() => {
    if (mode === 'halfway') {
      if (!routes) return null;
      return hub && hubId && !hubsLoading ? { lat: hub.lat, lng: hub.lng, isHub: true } : null;
    }
    if (mode === 'nearby') {
      if (a) return { lat: a.lat, lng: a.lng, isHub: false, isStart: true };
      return mapCenter ? { ...mapCenter, isHub: false } : null;
    }
    return null;
  }, [mode, routes, hub, hubId, hubsLoading, a, mapCenter]);

  const spec = useMemo(() => {
    if (!submitted) return null;
    if (mode === 'onway') {
      if (!thinRoute) return null;
      const w = corridorKm(detour);
      return { points: corridorQueries(thinRoute, w), corridor: w };
    }
    if (!searchCenter) return null;
    return {
      points: [{ lat: searchCenter.lat, lng: searchCenter.lng, radiusKm: mode === 'nearby' ? nearKm : radius }],
    };
  }, [submitted, mode, thinRoute, detour, searchCenter, nearKm, radius]);

  const specKey = spec ? JSON.stringify(spec) : null;

  useEffect(() => {
    setPlacesData(null);
    setPlacesError(null);
  }, [mode]);

  useEffect(() => {
    if (!spec) return;
    if (!fetchCats.length) {
      setPlacesData([]);
      setPlacesError(null);
      return;
    }
    const controller = new AbortController();
    setPlacesLoading(true);
    setPlacesError(null);

    const one = (pt) =>
      fetch(
        `/api/places?lat=${pt.lat}&lng=${pt.lng}&radiusKm=${pt.radiusKm}&categories=${fetchCats.join(',')}`,
        { signal: controller.signal }
      ).then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Places search failed');
        return data.places || [];
      });

    Promise.allSettled(spec.points.map(one))
      .then((results) => {
        if (controller.signal.aborted) return;
        const ok = results.filter((r) => r.status === 'fulfilled');
        if (!ok.length) {
          const err = results[0]?.reason;
          setPlacesData(null);
          setPlacesError(err?.message || 'Places search failed');
          return;
        }
        const seen = new Set();
        let list = [];
        for (const r of ok) {
          for (const p of r.value) {
            if (seen.has(p.id)) continue;
            seen.add(p.id);
            list.push(p);
          }
        }
        if (spec.corridor != null && thinRoute) {
          list = list
            .map((p) => {
              const off = distanceToPolylineKm(p.lat, p.lng, thinRoute);
              return { ...p, distanceKm: off, detourMin: detourMinutes(off) };
            })
            .filter((p) => p.distanceKm <= spec.corridor)
            .sort((x, y) => x.distanceKm - y.distanceKm)
            .slice(0, 80);
        }
        if (nameFilter) {
          list = list.filter((p) =>
            `${p.name || ''} ${p.cuisine || ''}`.toLowerCase().includes(nameFilter)
          );
        }
        setPlacesData(list);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPlacesLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specKey, fetchCats.join(','), nameFilter]);

  /* ---------- Keep the URL in sync ---------- */
  useEffect(() => {
    if (!restored) return;
    const p = new URLSearchParams();
    if (a) {
      p.set('a', `${a.lat.toFixed(4)},${a.lng.toFixed(4)}`);
      p.set('an', a.name);
    }
    if (b) {
      p.set('b', `${b.lat.toFixed(4)},${b.lng.toFixed(4)}`);
      p.set('bn', b.name);
    }
    if (mode !== 'halfway') p.set('m', mode);
    if (routes && routeIndex > 0) p.set('r', String(routeIndex));
    else if (urlIntent.current.r) p.set('r', String(urlIntent.current.r));
    if (hubId) p.set('hub', hubId);
    else if (urlIntent.current.hub) p.set('hub', urlIntent.current.hub);
    p.set('rad', String(radius));
    if (mode === 'nearby') p.set('nk', String(nearKm));
    if (mode === 'onway') p.set('dt', String(detour));
    if (cats.length) p.set('cat', cats.join(','));
    if (query.trim()) p.set('q', query.trim());
    const qs = p.toString();
    window.history.replaceState(null, '', qs ? `/?${qs}` : '/');
  }, [restored, a, b, mode, routes, routeIndex, hubId, radius, nearKm, detour, cats, query]);

  /* ---------- Actions ---------- */
  const toggleCat = useCallback((id) => {
    setQuery('');
    setCats((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]));
  }, []);

  const share = useCallback(async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Halfway', url });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied');
    } catch {
      window.prompt('Copy this link', url);
    }
  }, [showToast]);

  const selectPlace = useCallback(
    (id) => {
      setActivePlaceId(id);
      setOpenPlaceId(id);
      const p = placesData?.find((x) => x.id === id);
      if (p) setPanTarget({ lat: p.lat, lng: p.lng });
    },
    [placesData]
  );

  const openPlace = openPlaceId ? placesData?.find((x) => x.id === openPlaceId) || null : null;

  const friendList = useMemo(
    () =>
      (f.friends || []).map((fr) => {
        const id = f.otherOf(fr);
        const person = f.people?.[id];
        return { id, name: displayName(person), initial: initialOf(person) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [f.friends, f.people]
  );
  const friend = friendList.find((x) => x.id === friendId) || null;

  const invite = useCallback(async () => {
    const msg = await f.shareInvite();
    if (msg) showToast(msg);
  }, [f, showToast]);

  const changeMode = useCallback((m) => {
    setMode(m);
    setHint(null);
  }, []);

  const flagMissing = (text, selector) => {
    setHint(text);
    if (selector) setTimeout(() => focusVisible(selector), 0);
  };

  const submit = async () => {
    setHint(null);
    if (mode === 'halfway' && friend) {
      setBusy(true);
      try {
        const id = await f.startMeetup(friend.id);
        router.push(`/meet/${id}`);
      } catch (err) {
        showToast(err?.message || "Couldn't start the meetup. Try again.");
        setBusy(false);
      }
      return;
    }
    if (!query.trim() && !cats.length) return flagMissing('Pick something to look for.');
    if (mode !== 'nearby' && !a) {
      setEditingFrom(true);
      return flagMissing('Where are you starting from?', 'input[aria-label="Starting from"]');
    }
    if (mode === 'halfway' && !b) {
      setShowB(true);
      return flagMissing('Add their location.', 'input[aria-label="Their location"]');
    }
    if (mode === 'onway' && !b) {
      setShowB(true);
      return flagMissing('Where are you heading?', 'input[aria-label="Going to"]');
    }
    if (mode === 'nearby') {
      const c = a || mapCenter;
      if (c) setPanTarget({ lat: c.lat, lng: c.lng, zoom: NEAR_ZOOM[nearKm] || 13 });
    }
    setTab('search');
    setSubmitted(true);
    askSheet('half');
  };

  const backToSearch = () => {
    setSubmitted(false);
    setTab('search');
    askSheet('tall');
  };

  const explore = () => {
    setMode('nearby');
    setQuery('');
    setHint(null);
    setTab('explore');
    setSubmitted(true);
    const c = a || mapCenter;
    if (c && a) setPanTarget({ lat: c.lat, lng: c.lng, zoom: NEAR_ZOOM[nearKm] || 13 });
    askSheet('half');
  };

  /* ---------- Copy ---------- */
  const what = lookingFor(cats, query);
  const ctaLabel =
    mode === 'halfway' && friend
      ? `Meet ${friend.name} halfway`
      : `Find ${what} ${MODE_SUFFIX[mode]}`;
  const resultsTitle = capitalise(`${what} ${MODE_SUFFIX[mode]}`);

  const widen = {
    halfway: { can: radius < 25, run: () => setRadius((r) => Math.min(r + 5, 25)) },
    nearby: { can: nearKm < 5, run: () => setNearKm((k) => NEAR_KM[NEAR_KM.indexOf(k) + 1] || k) },
    onway: { can: detour < 15, run: () => setDetour((d) => DETOUR_MIN[DETOUR_MIN.indexOf(d) + 1] || d) },
  }[mode];

  /* ---------- Pieces shared by the desktop sidebar and the phone sheet ---------- */
  const header = (
    <div className={styles.sheetHead}>
      {submitted && (
        <button type="button" className={`${styles.back} hw-press`} onClick={backToSearch} aria-label="Back to search">
          <BackIcon />
        </button>
      )}
      <h1 key={submitted ? resultsTitle : 'form'} className={styles.title}>
        {submitted ? resultsTitle : 'Find somewhere to go'}
      </h1>
      {submitted && (
        <div className={styles.headActions}>
          {mode === 'halfway' && a && b && routes && hub && <SaveButton a={a} b={b} hub={hub} />}
          {mode !== 'nearby' && a && b && routes && (
            <button type="button" className={`${styles.share} hw-press`} onClick={share}>
              Share
            </button>
          )}
        </div>
      )}
    </div>
  );

  const useMyLocation = () => {
    if (!navigator.geolocation) return showToast("This device can't share its location.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        rememberPosition(pos.coords.latitude, pos.coords.longitude);
        setA({ lat: +pos.coords.latitude.toFixed(4), lng: +pos.coords.longitude.toFixed(4), name: 'My location' });
        setEditingFrom(false);
        setLocating(false);
        setHint(null);
      },
      () => {
        setLocating(false);
        showToast('Location is off — type where you are instead.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const fromRow =
    a && !editingFrom ? (
      <div className={styles.fromRow}>
        <span className={styles.fromDot} aria-hidden="true" />
        <span className={styles.fromText}>
          Starting from <strong>{shortName(a.name)}</strong>
        </span>
        <button type="button" className={styles.fromChange} onClick={() => setEditingFrom(true)}>
          Change
        </button>
      </div>
    ) : (
      <div className={styles.fromInput}>
        <LocationInput
          label="Starting from"
          marker="a"
          value={a}
          onSelect={(v) => {
            setA(v);
            if (v) {
              setEditingFrom(false);
              setHint(null);
            }
          }}
          bias={b}
        />
        <button type="button" className={`${styles.useMine} hw-press`} onClick={useMyLocation} disabled={locating}>
          <span className={styles.useMineDot} aria-hidden="true" />
          {locating ? 'Finding you…' : 'Use my location'}
        </button>
      </div>
    );

  // "+ Add …" opens the second search bar with a slide; it stays open once set.
  const secondField = (label, addLabel) =>
    showB || b ? (
      <div className={`${styles.cardField} ${styles.slideIn}`}>
        <LocationInput
          label={label}
          marker="b"
          value={b}
          onSelect={(v) => {
            setB(v);
            if (v) setHint(null);
          }}
          bias={a}
        />
      </div>
    ) : (
      <button type="button" className={`${styles.addField} hw-press`} onClick={() => setShowB(true)}>
        + {addLabel}
      </button>
    );

  const modeCard = (
    <div key={mode} className={styles.modeCard}>
      {mode === 'halfway' && (
        <>
          {secondField('Their location', 'Add their location')}
          <p className={styles.footnote}>
            <HalfwayMark size={16} className={styles.footMark} />
            We’ll pick a midpoint with a similar travel time for both of you.
          </p>
        </>
      )}
      {mode === 'nearby' && (
        <>
          <p className={styles.cardTitle}>Places around your starting point, within</p>
          <OptionChips options={NEAR_KM} value={nearKm} onChange={setNearKm} format={(n) => `${n} km`} label="Distance" />
        </>
      )}
      {mode === 'onway' && (
        <>
          <p className={styles.cardTitle}>Stops along your route, with a detour of up to</p>
          <OptionChips options={DETOUR_MIN} value={detour} onChange={setDetour} format={(n) => `${n} min`} label="Detour" />
          {secondField('Going to', "Add where you're going")}
        </>
      )}
    </div>
  );

  const form = (
    <div className={styles.form}>
      <div className={`${styles.block} hw-rise`}>{fromRow}</div>

      <section className={`${styles.block} hw-rise`} style={{ animationDelay: '50ms' }}>
        <h2 className={styles.sectionLabel}>Where should we look?</h2>
        <ModeSwitch value={mode} onChange={changeMode} />
        {/* The per-mode card (distance / + Add location / detour) is parked for later. */}
      </section>

      <section className={`${styles.block} hw-rise`} style={{ animationDelay: '100ms' }}>
        <h2 className={styles.sectionLabel}>What are you looking for?</h2>
        <CategoryChips
          selected={query.trim() ? [] : cats}
          onToggle={toggleCat}
          primary={PRIMARY_CATS}
          moreOpen={moreOpen || !!query}
          onMore={() => setMoreOpen((o) => !o)}
        />
        {(moreOpen || !!query) && (
        <form
          className={`${styles.freeText} ${styles.slideIn}`}
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <SearchIcon />
          <input
            type="search"
            className={styles.freeInput}
            value={query}
            onChange={(e) => setQuery(e.target.value.slice(0, 60))}
            placeholder="Type anything, e.g. bowling, bar, cinema"
            aria-label="Search for anything"
            enterKeyHint="search"
            autoComplete="off"
            autoFocus={moreOpen && !query}
          />
          {query && (
            <button type="button" className={styles.freeClear} aria-label="Clear" onClick={() => setQuery('')}>
              ×
            </button>
          )}
        </form>
        )}
      </section>
    </div>
  );

  const results = (
    <div className={styles.results}>
      {mode !== 'nearby' && routeLoading && <p className={styles.status}>Finding the route…</p>}
      {mode !== 'nearby' && routeError && <p className={styles.statusError}>{routeError}</p>}

      {mode !== 'nearby' && (!a || !b) && (
        <div className={styles.missing}>
          <p>{mode === 'halfway' ? 'Add both locations to find the halfway point.' : 'Add where you’re going to find stops on the way.'}</p>
          <button type="button" className={`${styles.ghostBtn} hw-press`} onClick={backToSearch}>
            Edit search
          </button>
        </div>
      )}

      {mode === 'halfway' && split && hub && a && b && (
        <div className="hw-rise">
          <Ribbon
            aName={shortName(a.name)}
            bName={shortName(b.name)}
            distA={split.distA}
            distB={split.distB}
            offRouteKm={split.offRouteKm || 0}
          />
        </div>
      )}

      {mode !== 'nearby' && routes && routes.length > 1 && (
        <div className={styles.altRow}>
          <span className={styles.sectionLabel}>Route</span>
          {routes.map((r, i) => (
            <button
              key={i}
              type="button"
              className={`${i === routeIndex ? styles.altChipOn : styles.altChip} hw-press`}
              onClick={() => setRouteIndex(i)}
            >
              {Math.round(r.durationMin)}&thinsp;min
            </button>
          ))}
        </div>
      )}

      {mode === 'halfway' && midpoint && (
        <section className={styles.hubSection}>
          <span className={styles.sectionLabel}>Meet in</span>
          {hub && hubId && (
            <h2 className={styles.hubName}>{hub.id === 'raw' ? 'The exact midpoint' : hub.name}</h2>
          )}
          {hubsLoading && <p className={styles.status}>Finding towns…</p>}
          {hubs != null && (
            <div className={styles.hubChips}>
              {hubs.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className={`${h.id === hubId ? styles.hubChipOn : styles.hubChip} hw-press`}
                  onClick={() => setHubId(h.id)}
                >
                  {h.name}
                </button>
              ))}
              <button
                type="button"
                className={`${hubId === 'raw' ? styles.hubChipOn : styles.hubChip} hw-press`}
                onClick={() => setHubId('raw')}
              >
                Exact midpoint
              </button>
            </div>
          )}
          {hubsNote && <p className={styles.note}>{hubsNote}</p>}
          {hubsError && <p className={styles.statusError}>{hubsError}</p>}
        </section>
      )}

      <div className={styles.tune}>
        {mode === 'halfway' && <RadiusControl value={radius} onChange={setRadius} />}
        {mode === 'nearby' && (
          <>
            <p className={styles.tuneLabel}>
              Around {a ? <strong>{shortName(a.name)}</strong> : 'the map centre'}, within
            </p>
            <OptionChips options={NEAR_KM} value={nearKm} onChange={setNearKm} format={(n) => `${n} km`} label="Distance" />
          </>
        )}
        {mode === 'onway' && (
          <>
            <p className={styles.tuneLabel}>Detour of up to</p>
            <OptionChips options={DETOUR_MIN} value={detour} onChange={setDetour} format={(n) => `${n} min`} label="Detour" />
          </>
        )}
      </div>

      {placesData?.length > 0 && (
        <AreaGuide places={placesData} activeCats={fetchCats} onCategoryFilter={(id) => toggleCat(id)} />
      )}

      <div className={styles.list}>
        {mode === 'halfway' && a && b && !searchCenter && routes ? (
          <div className={styles.status}>Finding the meeting point…</div>
        ) : (
          <ResultsList
            places={placesData}
            hub={searchCenter}
            loading={placesLoading || (mode === 'onway' && routeLoading)}
            error={placesError}
            activePlaceId={activePlaceId}
            onHover={setActivePlaceId}
            onSelect={selectPlace}
            onWidenRadius={widen.run}
            canWiden={widen.can}
            emptyText={mode === 'onway' ? 'Nothing this close to your route.' : undefined}
            widenText={mode === 'onway' ? 'Allow a longer detour' : undefined}
          />
        )}
      </div>
    </div>
  );

  const body = submitted ? results : form;

  const footer = submitted ? null : (
    <div className={styles.ctaWrap}>
      {hint && (
        <p className={styles.hint} role="alert">
          {hint}
        </p>
      )}
      <button type="button" className={`${styles.cta} hw-press`} onClick={submit} disabled={busy}>
        {mode === 'halfway' && friend ? <HalfwayMark size={20} /> : <SearchIcon />}
        <span key={ctaLabel} className={styles.ctaLabel}>
          {busy ? 'Starting…' : ctaLabel}
        </span>
      </button>
    </div>
  );

  const distanceNote =
    mode === 'onway'
      ? 'off your route'
      : searchCenter?.isHub
        ? 'from the meeting point'
        : searchCenter?.isStart
          ? 'from your starting point'
          : 'from the map centre';

  return (
    <div className={styles.app}>
      {/* Desktop: sidebar */}
      <aside className={styles.panel}>
        {header}
        <div className={styles.panelBody}>{body}</div>
        {footer && <div className={styles.panelFoot}>{footer}</div>}
      </aside>

      <div className={styles.map}>
        <MapView
          a={a}
          b={mode === 'nearby' ? null : b}
          routes={mode === 'nearby' ? null : routes}
          routeIndex={routeIndex}
          onSelectRoute={setRouteIndex}
          midpoint={midpoint}
          hub={mode === 'halfway' ? hub : null}
          radiusKm={radius}
          places={placesData}
          activePlaceId={activePlaceId}
          onPlaceHover={setActivePlaceId}
          onPlaceSelect={selectPlace}
          openPlace={openPlace}
          onPopupClose={() => setOpenPlaceId(null)}
          panTarget={panTarget}
          onCenterChange={setMapCenter}
          hubCandidates={mode === 'halfway' ? hubs : null}
          onHubSelect={setHubId}
          distanceNote={distanceNote}
        />
        <div className={styles.chrome}>
          <a href="/" className={styles.wordmark} aria-label="Halfway home">
            HALFWAY
          </a>
          <div className={styles.chromeRight}>
            <span className={styles.authSlot}>
              <AuthButton />
            </span>
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* Phone: bottom sheet over the full-screen map, above the tab bar */}
      <BottomSheet header={header} footer={footer} snap={sheet.snap} snapKey={sheet.key}>
        {body}
      </BottomSheet>

      <TabBar active={tab} onSearch={backToSearch} onExplore={explore} />

      {toast && (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
