'use client';

import { useEffect, useRef, useState } from 'react';

const CENTER = { lat: 17.4935, lng: 78.3915 };
const ME = { lat: 17.5106, lng: 78.3866 };
const FRIEND = { lat: 17.4776, lng: 78.4021 };

// Free raster styles usable with the current Leaflet (flat) maps.
const FLAT = {
  osm: {
    name: 'OpenStreetMap (current)',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
  },
  voyager: {
    name: 'CARTO Voyager',
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '© OpenStreetMap © CARTO',
  },
  positron: {
    name: 'CARTO Positron (light)',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '© OpenStreetMap © CARTO',
  },
  darkmatter: {
    name: 'CARTO Dark Matter',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '© OpenStreetMap © CARTO',
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

// OpenFreeMap vector styles for the 3D navigation map.
const VECTOR = {
  liberty: 'Liberty (current, light)',
  bright: 'Bright',
  positron: 'Positron (minimal light)',
  dark: 'Dark (current, dark mode)',
  fiord: 'Fiord (blue-grey)',
};

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
      L.tileLayer(style.url, { attribution: style.attribution, subdomains: style.subdomains || 'abcd', maxZoom: 19 }).addTo(map);
      const pin = (p, letter, color) =>
        L.marker([p.lat, p.lng], {
          icon: L.divIcon({
            className: '',
            html: `<div style="width:32px;height:32px;border-radius:50%;background:${color};border:3px solid #fff;color:#fff;font:700 13px/26px system-ui;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.4)">${letter}</div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          }),
        }).addTo(map);
      pin(ME, 'K', '#2F6F5E');
      pin(FRIEND, 'G', '#6E4F8C');
      map.fitBounds([[ME.lat, ME.lng], [FRIEND.lat, FRIEND.lng]], { padding: [70, 70] });
    })();
    return () => map?.remove();
  }, [id]);
  return <div ref={ref} style={{ position: 'absolute', inset: 0 }} />;
}

function VectorMap({ id, pitch }) {
  const ref = useRef(null);
  useEffect(() => {
    let map;
    (async () => {
      const { Map, Marker, setWorkerUrl } = await import('maplibre-gl');
      await import('maplibre-gl/dist/maplibre-gl.css');
      setWorkerUrl('/vendor/maplibre-gl-worker.mjs');
      map = new Map({
        container: ref.current,
        style: `https://tiles.openfreemap.org/styles/${id}`,
        center: [ME.lng, ME.lat - 0.012],
        zoom: pitch ? 16.4 : 13.4,
        pitch: pitch ? 58 : 0,
        bearing: pitch ? 164 : 0,
        attributionControl: { compact: true },
      });
      const pin = (p, letter, color) => {
        const el = document.createElement('div');
        el.style.cssText = `width:32px;height:32px;border-radius:50%;background:${color};border:3px solid #fff;color:#fff;font:700 13px/26px system-ui;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.4)`;
        el.textContent = letter;
        new Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map);
      };
      pin({ lat: ME.lat - 0.012, lng: ME.lng + 0.0005 }, 'K', '#2F6F5E');
      if (!pitch) pin(FRIEND, 'G', '#6E4F8C');
    })();
    return () => map?.remove();
  }, [id, pitch]);
  return <div ref={ref} style={{ position: 'absolute', inset: 0 }} />;
}

// ?kind=flat&style=voyager  |  ?kind=3d&style=bright  |  ?kind=top&style=fiord
export default function MapStyles() {
  const [q, setQ] = useState(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setQ({ kind: p.get('kind') || 'flat', style: p.get('style') || 'osm' });
  }, []);
  if (!q) return null;
  const label =
    q.kind === 'flat' ? `Normal map · ${FLAT[q.style]?.name}` : `${q.kind === '3d' ? '3D navigation' : 'Top view'} · ${VECTOR[q.style]}`;
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      {q.kind === 'flat' ? <FlatMap id={q.style} /> : <VectorMap id={q.style} pitch={q.kind === '3d'} />}
      <Label text={label} />
    </div>
  );
}
