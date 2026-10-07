'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { pointAtFraction, cumulative, haversine } from '@/lib/geo';
import { CATEGORY_IDS } from '@/lib/categories';
import LocationInput from '@/components/LocationInput';
import Ribbon from '@/components/Ribbon';
import RadiusControl from '@/components/RadiusControl';
import CategoryChips from '@/components/CategoryChips';
import ResultsList from '@/components/ResultsList';
import BottomSheet from '@/components/BottomSheet';
import ExplorePrompt from '@/components/ExplorePrompt';
import AreaGuide from '@/components/AreaGuide';
import ThemeToggle from '@/components/ThemeToggle';
import AuthButton from '@/components/AuthButton';
import SaveButton from '@/components/SaveButton';
import styles from './page.module.css';
import { rememberPosition } from '@/lib/localPlaces';

const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => <div className={styles.mapLoading}>Loading map…</div>,
});

const DEFAULT_CATS = ['restaurant', 'cafe'];
const shortName = (s) => (s || '').split(',')[0].trim();

function parsePoint(s) {
  const [lat, lng] = (s || '').split(',').map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

function PanelContent({
  a, setA, b, setB, routes, routeIndex, setRouteIndex, routeLoading, routeError,
  midpoint, hubs, hubId, setHubId, hubsLoading, hubsNote, hubsError, hub, split,
  radius, setRadius, cats, toggleCat, setCats, searchCenter, placesData, placesLoading,
  placesError, activePlaceId, setActivePlaceId, selectPlace, share, toast,
}) {
  const hasSearch = a && b;

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.logo}>HALFWAY</h1>
        <div className={styles.headerActions}>
          {hasSearch && routes && hub && (
            <SaveButton a={a} b={b} hub={hub} />
          )}
          {hasSearch && routes && (
            <button type="button" className={styles.share} onClick={share}>
              Share
            </button>
          )}
          <ThemeToggle />
          <AuthButton />
        </div>
      </header>

      <div className={styles.inputs}>
        <LocationInput label="You" marker="a" value={a} onSelect={setA} bias={b} />
        <LocationInput label="Them" marker="b" value={b} onSelect={setB} bias={a} />
      </div>

      {!hasSearch && (
        <>
          <p className={styles.empty}>Two locations in. One fair meeting point out.</p>
          <a href="/friends" className={styles.friendsLink}>
            <span>
              <strong>Meet a friend live</strong>
              Send a request, agree on a place, and track each other there.
            </span>
            <span aria-hidden="true">→</span>
          </a>
          <ExplorePrompt onPickCategories={setCats} />
        </>
      )}

      {routeLoading && <p className={styles.status}>Finding the route…</p>}
      {routeError && <p className={styles.statusError}>{routeError}</p>}

      {split && hub && a && b && (
        <Ribbon
          aName={shortName(a.name)}
          bName={shortName(b.name)}
          distA={split.distA}
          distB={split.distB}
          offRouteKm={split.offRouteKm || 0}
        />
      )}

      {routes && routes.length > 1 && (
        <div className={styles.altRow}>
          <span className={styles.sectionLabel}>Route</span>
          {routes.map((r, i) => (
            <button
              key={i}
              type="button"
              className={i === routeIndex ? styles.altChipOn : styles.altChip}
              onClick={() => setRouteIndex(i)}
            >
              {Math.round(r.durationMin)}&thinsp;min
            </button>
          ))}
        </div>
      )}

      {midpoint && (
        <section className={styles.hubSection}>
          <span className={styles.sectionLabel}>Meet in</span>
          {hub && hubId && (
            <h2 className={styles.hubName}>
              {hub.id === 'raw' ? 'The exact midpoint' : hub.name}
            </h2>
          )}
          {hubsLoading && <p className={styles.status}>Finding towns…</p>}
          {hubs != null && (
            <div className={styles.hubChips}>
              {hubs.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className={h.id === hubId ? styles.hubChipOn : styles.hubChip}
                  onClick={() => setHubId(h.id)}
                >
                  {h.name}
                </button>
              ))}
              <button
                type="button"
                className={hubId === 'raw' ? styles.hubChipOn : styles.hubChip}
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

      <div className={styles.controls}>
        <RadiusControl value={radius} onChange={setRadius} />
        <CategoryChips selected={cats} onToggle={toggleCat} />
      </div>

      {placesData?.length > 0 && (
        <AreaGuide
          places={placesData}
          activeCats={cats}
          onCategoryFilter={(id) => toggleCat(id)}
        />
      )}

      <div className={styles.results}>
        {!searchCenter && routes ? (
          <div className={styles.status}>Finding the meeting point…</div>
        ) : (
          <ResultsList
            places={placesData}
            hub={searchCenter}
            loading={placesLoading}
            error={placesError}
            activePlaceId={activePlaceId}
            onHover={setActivePlaceId}
            onSelect={selectPlace}
            onWidenRadius={() => setRadius((r) => Math.min(r + 5, 25))}
            canWiden={radius < 25}
          />
        )}
      </div>
    </>
  );
}

export default function Home() {
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);

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

    setRestored(true);

    if (!pa && !pb && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          rememberPosition(pos.coords.latitude, pos.coords.longitude);
          setPanTarget({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            zoom: 13,
          });
        },
        () => {},
        { maximumAge: 600000, timeout: 8000 }
      );
    }
  }, []);

  useEffect(() => {
    if (!a || !b) {
      setRoutes(null);
      setRouteError(null);
      setHubs(null);
      setHubId(null);
      return;
    }
    if (a.lat === b.lat && a.lng === b.lng) {
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

    fetch(`/api/route?from=${a.lat},${a.lng}&to=${b.lat},${b.lng}`, { signal: controller.signal })
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
  }, [a, b]);

  const selectedRoute = routes?.[routeIndex] || null;
  const midInfo = useMemo(
    () => (selectedRoute ? pointAtFraction(selectedRoute.coords, 0.5) : null),
    [selectedRoute]
  );
  const midpoint = midInfo?.point || null;

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

  const searchCenter = useMemo(() => {
    if (routes) {
      return hub && hubId && !hubsLoading ? { lat: hub.lat, lng: hub.lng, isHub: true } : null;
    }
    return mapCenter ? { ...mapCenter, isHub: false } : null;
  }, [routes, hub, hubId, hubsLoading, mapCenter]);

  useEffect(() => {
    if (!searchCenter) return;
    if (!cats.length) {
      setPlacesData([]);
      setPlacesError(null);
      return;
    }
    const controller = new AbortController();
    setPlacesLoading(true);
    setPlacesError(null);

    fetch(
      `/api/places?lat=${searchCenter.lat}&lng=${searchCenter.lng}&radiusKm=${radius}&categories=${cats.join(',')}`,
      { signal: controller.signal }
    )
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Places search failed');
        setPlacesData(data.places);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setPlacesData(null);
          setPlacesError(err.message);
        }
      })
      .finally(() => setPlacesLoading(false));

    return () => controller.abort();
  }, [searchCenter?.lat, searchCenter?.lng, radius, cats]);

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
    if (routes && routeIndex > 0) p.set('r', String(routeIndex));
    else if (urlIntent.current.r) p.set('r', String(urlIntent.current.r));
    if (hubId) p.set('hub', hubId);
    else if (urlIntent.current.hub) p.set('hub', urlIntent.current.hub);
    p.set('rad', String(radius));
    if (cats.length) p.set('cat', cats.join(','));
    const qs = p.toString();
    window.history.replaceState(null, '', qs ? `/?${qs}` : '/');
  }, [restored, a, b, routes, routeIndex, hubId, radius, cats]);

  const toggleCat = useCallback(
    (id) => setCats((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id])),
    []
  );

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
      setToast('Link copied');
    } catch {
      window.prompt('Copy this link', url);
      return;
    }
    setTimeout(() => setToast(null), 2500);
  }, []);

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

  const panelProps = {
    a, setA, b, setB, routes, routeIndex, setRouteIndex, routeLoading, routeError,
    midpoint, hubs, hubId, setHubId, hubsLoading, hubsNote, hubsError, hub, split,
    radius, setRadius, cats, toggleCat, setCats, searchCenter, placesData, placesLoading,
    placesError, activePlaceId, setActivePlaceId, selectPlace, share, toast,
  };

  return (
    <div className={styles.app}>
      {/* Desktop: sidebar */}
      <aside className={styles.panel}>
        <PanelContent {...panelProps} />
      </aside>

      <div className={styles.map}>
        <MapView
          a={a}
          b={b}
          routes={routes}
          routeIndex={routeIndex}
          onSelectRoute={setRouteIndex}
          midpoint={midpoint}
          hub={hub}
          radiusKm={radius}
          places={placesData}
          activePlaceId={activePlaceId}
          onPlaceHover={setActivePlaceId}
          onPlaceSelect={selectPlace}
          openPlace={openPlace}
          onPopupClose={() => setOpenPlaceId(null)}
          panTarget={panTarget}
          onCenterChange={setMapCenter}
          hubCandidates={hubs}
          onHubSelect={setHubId}
          distanceNote={searchCenter?.isHub ? 'from the meeting point' : 'from the map centre'}
        />
      </div>

      {/* Mobile: bottom sheet over the full-screen map */}
      <BottomSheet hasResults={!!placesData?.length}>
        <PanelContent {...panelProps} />
      </BottomSheet>

      {toast && (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
