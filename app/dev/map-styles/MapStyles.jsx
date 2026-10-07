'use client';

import { useEffect, useRef, useState } from 'react';

const CENTER = { lat: 17.4935, lng: 78.3915 };
const ME = { lat: 17.5106, lng: 78.3866 };
const FRIEND = { lat: 17.4776, lng: 78.4021 };

// Keyless raster styles for the current Leaflet (flat) map.
const FLAT = {
  osm: {
    name: 'OpenStreetMap (current)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
  },
  topo: {
    name: 'OpenTopoMap (terrain)',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap © OpenTopoMap',
    subdomains: 'abc',
  },
  satellite: {
    name: 'Esri World Imagery (satellite)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles © Esri',
  },
};

// OpenFreeMap vector styles (no key) — usable flat or in 3D.
const VECTOR = {
  liberty: 'Liberty',
  bright: 'Bright',
  positron: 'Positron',
  dark: 'Dark',
  fiord: 'Fiord',
};

// Building colours for styles that don't ship their own 3D layer.
const BUILDING_COLOR = { bright: '#d9d0c1', positron: '#e3e3e3', dark: '#30343a', fiord: '#3d4c62' };

function pinEl(letter, color) {
  const el = document.createElement('div');
  el.style.cssText = `width:32px;height:32px;border-radius:50%;background:${color};border:3px solid #fff;color:#fff;font:700 13px/26px system-ui;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.4)`;
  el.textContent = letter;
  return el;
}

function add3dBuildings(map, id) {
  if (map.getStyle().layers.some((l) => l.type === 'fill-extrusion')) return;
  map.addLayer({
    id: 'halfway-3d-buildings',
    source: 'openmaptiles',
    'source-layer': 'building',
    type: 'fill-extrusion',
    minzoom: 14,
    paint: {
      'fill-extrusion-color': BUILDING_COLOR[id] || '#d6d6d6',
      'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 10],
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      'fill-extrusion-opacity': 0.85,
    },
  });
}

function addTerrain(map) {
  map.addSource('dem', {
    type: 'raster-dem',
    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
    encoding: 'terrarium',
    tileSize: 256,
    maxzoom: 14,
  });
  const firstLabel = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
  map.addLayer({ id: 'hills', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': 0.6 } }, firstLabel);
  map.setTerrain({ source: 'dem', exaggeration: 2.2 });
  map.setSky?.({ 'sky-color': '#9cc5ec', 'horizon-color': '#e9f1f7', 'sky-horizon-blend': 0.6 });
}

function Label({ text }) {
  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        left: 12,
        right: 12,
        zIndex: 1000,
        padding: '10px 14px',
        borderRadius: 12,
        background: '#1E2A24',
        color: '#fff',
        font: '600 15px system-ui, sans-serif',
        boxShadow: '0 6px 20px rgba(0,0,0,.3)',
      }}
    >
      {text}
    </div>
  );
}

function FlatMap({ id }) {
  const ref = useRef(null);
  useEffect(() => {
    let map;
    (async () => {
      const L = (await import('leaflet')).default;
      await import('leaflet/dist/leaflet.css');
      const style = FLAT[id];
      map = L.map(ref.current, { zoomControl: false }).setView([CENTER.lat, CENTER.lng], 14);
      L.tileLayer(style.url, { attribution: style.attribution, subdomains: style.subdomains || 'abc', maxZoom: 19 }).addTo(map);
      const pin = (p, letter, color) =>
        L.marker([p.lat, p.lng], {
          icon: L.divIcon({ className: '', html: pinEl(letter, color).outerHTML, iconSize: [32, 32], iconAnchor: [16, 16] }),
        }).addTo(map);
      pin(ME, 'K', '#2F6F5E');
      pin(FRIEND, 'G', '#6E4F8C');
      map.fitBounds([[ME.lat, ME.lng], [FRIEND.lat, FRIEND.lng]], { padding: [70, 70] });
    })();
    return () => map?.remove();
  }, [id]);
  return <div ref={ref} style={{ position: 'absolute', inset: 0 }} />;
}

function VectorMap({ id, pitch, buildings, terrain }) {
  const ref = useRef(null);
  useEffect(() => {
    let map;
    (async () => {
      const { Map, Marker, setWorkerUrl } = await import('maplibre-gl');
      await import('maplibre-gl/dist/maplibre-gl.css');
      setWorkerUrl('/vendor/maplibre-gl-worker.mjs');
      const here = { lat: ME.lat - 0.012, lng: ME.lng + 0.0005 };
      map = new Map({
        container: ref.current,
        style: `https://tiles.openfreemap.org/styles/${id}`,
        center: terrain ? [78.405, 17.505] : [here.lng, here.lat],
        zoom: terrain ? 13.2 : pitch ? 16.4 : 13.4,
        pitch: pitch ? (terrain ? 70 : 58) : 0,
        bearing: pitch ? (terrain ? 200 : 164) : 0,
        maxPitch: 80,
        attributionControl: { compact: true },
      });
      map.on('load', () => {
        if (pitch && buildings) add3dBuildings(map, id);
        if (terrain) addTerrain(map);
        if (!pitch) map.fitBounds([[ME.lng, FRIEND.lat], [FRIEND.lng, ME.lat]], { padding: 80, duration: 0 });
      });
      new Marker({ element: pinEl('K', '#2F6F5E') }).setLngLat(pitch ? [here.lng, here.lat] : [ME.lng, ME.lat]).addTo(map);
      if (!pitch) new Marker({ element: pinEl('G', '#6E4F8C') }).setLngLat([FRIEND.lng, FRIEND.lat]).addTo(map);
    })();
    return () => map?.remove();
  }, [id, pitch, buildings, terrain]);
  return <div ref={ref} style={{ position: 'absolute', inset: 0 }} />;
}

// ?kind=flat&style=topo | ?kind=top&style=fiord | ?kind=3d&style=bright | &terrain=1 | &buildings=0
export default function MapStyles() {
  const [q, setQ] = useState(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setQ({
      kind: p.get('kind') || 'flat',
      style: p.get('style') || 'osm',
      buildings: p.get('buildings') !== '0',
      terrain: p.get('terrain') === '1',
    });
  }, []);
  if (!q) return null;
  let label;
  if (q.kind === 'flat') label = `Normal map · ${FLAT[q.style]?.name}`;
  else if (q.kind === 'top') label = `Normal map · ${VECTOR[q.style]} (OpenFreeMap)`;
  else label = `3D · ${VECTOR[q.style]} · ${q.terrain ? 'buildings + terrain hills' : q.buildings ? '3D buildings' : 'no buildings'}`;
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      {q.kind === 'flat' ? (
        <FlatMap id={q.style} />
      ) : (
        <VectorMap id={q.style} pitch={q.kind === '3d'} buildings={q.buildings} terrain={q.terrain} />
      )}
      <Label text={label} />
    </div>
  );
}
