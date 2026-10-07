'use client';

import { useEffect, useRef, useState } from 'react';
import { Map as MapLibreMap, Marker, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import s from './NavigationMap.module.css';

setWorkerUrl('/vendor/maplibre-gl-worker.mjs');

const PITCH = 58;
const ZOOM = 17.2;

function isDark() {
  const mode = document.documentElement.getAttribute('data-mode');
  if (mode === 'dark' || mode === 'light') return mode === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

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
 * Driver's-eye navigation view: tilted, rotated to the direction of travel, and
 * centred on whoever is being followed.
 */
export default function NavigationMap({
  focus,
  focusIs = 'me',
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
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const start = focus || dest;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: `https://tiles.openfreemap.org/styles/${isDark() ? 'dark' : 'liberty'}`,
      center: start ? toLngLat(start) : [78.39, 17.45],
      zoom: ZOOM,
      pitch: PITCH,
      bearing,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    const addLayers = () => {
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
      setReady(true);
    };
    map.on('load', addLayers);

    // Any finger on the map pauses following until "Re-centre" is tapped.
    const pause = (e) => e.originalEvent && setPaused(true);
    map.on('dragstart', pause);
    map.on('rotatestart', pause);
    map.on('pitchstart', pause);

    return () => {
      Object.values(markers.current).forEach((m) => m.remove());
      markers.current = {};
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.getSource('route')?.setData(line(route));
    map.getSource('alt')?.setData(line(altRoute));
    map.setPaintProperty('route-line', 'line-color', routeColor);
    map.setPaintProperty('alt-line', 'line-color', altRouteColor);
  }, [ready, route, altRoute, routeColor, altRouteColor]);

  // Switching whose view we follow swaps which marker is the arrow. Declared
  // before the marker effect so the old markers are gone before re-placing.
  useEffect(() => {
    for (const key of ['me', 'friend']) {
      markers.current[key]?.remove();
      delete markers.current[key];
    }
    setPaused(false);
  }, [focusIs]);

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
      m.setLngLat(toLngLat(pos));
      if (rotation != null) m.setRotation(rotation);
    };
    const meFollowed = focusIs === 'me';
    place('me', me, () => (meFollowed ? chevronEl('#2F6F5E') : pinEl(meLetter, '#2F6F5E')), meFollowed ? bearing : null);
    place('friend', friend, () => (!meFollowed ? chevronEl('#6E4F8C') : pinEl(friendLetter, '#6E4F8C')), !meFollowed ? bearing : null);
    place('dest', dest, destEl, null);
  }, [me, friend, dest, bearing, focusIs, meLetter, friendLetter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus || paused) return;
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
  }, [focus?.lat, focus?.lng, bearing, paused]);

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
