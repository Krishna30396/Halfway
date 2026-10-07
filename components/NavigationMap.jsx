'use client';

import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { STYLE_URL, add3dBuildings, useThemeMode } from '@/lib/mapStyle';
import { glideMarker } from '@/lib/liveTracking';
import s from './NavigationMap.module.css';

setWorkerUrl('/vendor/maplibre-gl-worker.mjs');

const PITCH = 58;
const ZOOM = 17.2;

const toLngLat = (p) => [p.lng, p.lat];
const line = (coords) => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: (coords || []).map(([lat, lng]) => [lng, lat]) },
});

function chevronEl(color) {
  const el = document.createElement('div');
  el.className = s.chevron;
  el.innerHTML = `<svg viewBox="0 0 40 40" width="44" height="44"><circle cx="20" cy="20" r="18" fill="${color}" stroke="#fff" stroke-width="3"/><path d="M20 9 L29 29 L20 24 L11 29 Z" fill="#fff"/></svg>`;
  return el;
}

function pinEl(letter, color) {
  const el = document.createElement('div');
  el.className = s.pin;
  el.style.background = color;
  el.textContent = letter;
  return el;
}

function destEl() {
  const el = document.createElement('div');
  el.className = s.dest;
  return el;
}

/**
 * Driver's-eye navigation view: tilted and rotated to the direction of travel,
 * centred on me. With `overview`, a flat north-up map that just fits me and my friend.
 */
export default function NavigationMap({
  focus,
  overview = false,
  bearing = 0,
  route,
  routeColor = '#2F6F5E',
  altRoute,
  altRouteColor = '#6E4F8C',
  me,
  meLetter = 'Y',
  friend,
  friendLetter = '?',
  dest,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markers = useRef({});
  const glide = useRef({});
  // Bumped every time a style finishes loading (first load and theme switches),
  // since a new style drops our route layers and they must be re-added.
  const [styleVersion, setStyleVersion] = useState(0);
  const [paused, setPaused] = useState(false);
  const mode = useThemeMode();
  const modeRef = useRef(mode);
  modeRef.current = mode;

  useEffect(() => {
    const start = focus || dest;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: STYLE_URL[mode],
      center: start ? toLngLat(start) : [78.39, 17.45],
      zoom: ZOOM,
      pitch: PITCH,
      bearing,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    const addLayers = () => {
      add3dBuildings(map, modeRef.current);
      for (const id of ['alt', 'route']) {
        if (map.getSource(id)) continue;
        map.addSource(id, { type: 'geojson', data: line([]) });
        map.addLayer({
          id: `${id}-casing`,
          type: 'line',
          source: id,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#ffffff', 'line-width': id === 'route' ? 12 : 7, 'line-opacity': id === 'route' ? 0.9 : 0.5 },
        });
        map.addLayer({
          id: `${id}-line`,
          type: 'line',
          source: id,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': id === 'route' ? routeColor : altRouteColor,
            'line-width': id === 'route' ? 8 : 4,
            'line-opacity': id === 'route' ? 1 : 0.6,
            ...(id === 'alt' ? { 'line-dasharray': [1.5, 1.5] } : {}),
          },
        });
      }
      setStyleVersion((v) => v + 1);
    };
    map.on('style.load', addLayers);

    // Any finger on the map pauses following until "Re-centre" is tapped.
    const pause = (e) => e.originalEvent && setPaused(true);
    map.on('dragstart', pause);
    map.on('rotatestart', pause);
    map.on('pitchstart', pause);

    return () => {
      Object.values(glide.current).forEach((g) => cancelAnimationFrame(g.raf));
      Object.values(markers.current).forEach((m) => m.remove());
      markers.current = {};
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const appliedMode = useRef(mode);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || mode === appliedMode.current) return;
    appliedMode.current = mode;
    map.setStyle(STYLE_URL[mode]);
  }, [mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!styleVersion || !map) return;
    map.getSource('route')?.setData(line(overview ? [] : route));
    map.getSource('alt')?.setData(line(overview ? [] : altRoute));
    map.setPaintProperty('route-line', 'line-color', routeColor);
    map.setPaintProperty('alt-line', 'line-color', altRouteColor);
  }, [styleVersion, route, altRoute, routeColor, altRouteColor, overview]);

  // Switching views swaps my marker between arrow and pin. Declared
  // before the marker effect so the old markers are gone before re-placing.
  useEffect(() => {
    for (const key of ['me', 'friend']) {
      markers.current[key]?.remove();
      delete markers.current[key];
    }
    setPaused(false);
  }, [overview]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const place = (key, pos, make, rotation) => {
      let m = markers.current[key];
      if (!pos) {
        m?.remove();
        delete markers.current[key];
        return;
      }
      if (!m) {
        m = new Marker({
          element: make(),
          rotationAlignment: rotation != null ? 'map' : 'viewport',
          pitchAlignment: rotation != null ? 'map' : 'viewport',
        })
          .setLngLat(toLngLat(pos))
          .addTo(map);
        markers.current[key] = m;
      }
      if (key === 'friend') {
        // Their updates arrive every few seconds; glide between them.
        glideMarker(
          (glide.current[key] ||= {}),
          () => {
            const { lng, lat } = m.getLngLat();
            return [lat, lng];
          },
          ([lat, lng]) => m.setLngLat([lng, lat]),
          [pos.lat, pos.lng]
        );
      } else {
        m.setLngLat(toLngLat(pos));
      }
      if (rotation != null) m.setRotation(rotation);
    };
    place('me', me, () => (overview ? pinEl(meLetter, '#2F6F5E') : chevronEl('#2F6F5E')), overview ? null : bearing);
    place('friend', friend, () => pinEl(friendLetter, '#6E4F8C'), null);
    place('dest', overview ? null : dest, destEl, null);
  }, [me, friend, dest, bearing, overview, meLetter, friendLetter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !overview || paused) return;
    const pts = [me, friend].filter(Boolean);
    if (!pts.length) return;
    if (pts.length === 1) {
      map.easeTo({ center: toLngLat(pts[0]), zoom: 15, bearing: 0, pitch: 0, padding: 0, duration: 700 });
      return;
    }
    const lngs = pts.map((p) => p.lng);
    const lats = pts.map((p) => p.lat);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: { top: 130, bottom: 110, left: 60, right: 60 }, bearing: 0, pitch: 0, maxZoom: 16, duration: 700 }
    );
  }, [overview, me?.lat, me?.lng, friend?.lat, friend?.lng, paused]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || overview || !focus || paused) return;
    const h = map.getContainer().clientHeight;
    map.easeTo({
      center: toLngLat(focus),
      bearing,
      pitch: PITCH,
      zoom: Math.max(map.getZoom(), 16),
      // Keep the followed person in the lower part of the screen, road ahead visible.
      padding: { top: Math.round(h * 0.35), bottom: 0, left: 0, right: 0 },
      duration: 900,
      essential: true,
    });
  }, [focus?.lat, focus?.lng, bearing, paused, overview]);

  return (
    <div className={s.wrap}>
      <div ref={containerRef} className={s.map} />
      {paused && (
        <button type="button" className={s.recentre} onClick={() => setPaused(false)}>
          Re-centre
        </button>
      )}
    </div>
  );
}
