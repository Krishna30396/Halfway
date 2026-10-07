'use client';

import { useEffect, useMemo } from 'react';
import {
  MapContainer,
  Polyline,
  Marker,
  Circle,
  Tooltip,
  Popup,
  useMap,
} from 'react-leaflet';
import { CATEGORIES, CATEGORY_COLORS } from '@/lib/categories';
import { placeholderFor } from '@/lib/placeholders';
import PlaceImage from './PlaceImage';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import VectorBaseLayer from './VectorBaseLayer';

const endIcon = (label) =>
  L.divIcon({
    className: '',
    html: `<div style="width:14px;height:14px;border-radius:50%;background:#FFFFFF;border:2.5px solid #1E2A24;box-shadow:0 1px 3px rgba(30,42,36,.35)" aria-label="${label}"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

// THE midpoint — the only magenta in the app.
const midpointIcon = L.divIcon({
  className: '',
  html: `<div style="width:16px;height:16px;background:#C51162;transform:rotate(45deg);border:2px solid #FFFFFF;box-shadow:0 1px 4px rgba(197,17,98,.5)"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

// The chosen hub: an ink ring, permanently labelled with the town's name.
const hubIcon = L.divIcon({
  className: '',
  html: `<div style="width:13px;height:13px;border-radius:50%;background:#E9ECE4;border:3px solid #1E2A24;box-shadow:0 1px 3px rgba(30,42,36,.4)"></div>`,
  iconSize: [13, 13],
  iconAnchor: [6.5, 6.5],
});

const placeIcon = (active, category) => {
  const color = CATEGORY_COLORS[category] || '#6B7A70';
  const size = active ? 15 : 11;
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid ${active ? '#1E2A24' : '#FFFFFF'};box-shadow:0 1px 3px rgba(30,42,36,.35)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || '';

// Candidate hubs pulse gently so the eye finds the nearby centres at a glance.
const pulseIcon = L.divIcon({
  className: '',
  html: `<div class="pulse-pin"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

function FitBounds({ a, b, hub }) {
  const map = useMap();
  useEffect(() => {
    const pts = [a, b, hub].filter(Boolean).map((p) => [p.lat, p.lng]);
    if (pts.length >= 2) {
      map.fitBounds(L.latLngBounds(pts), { padding: [48, 48] });
    } else if (pts.length === 1) {
      map.setView(pts[0], 12);
    }
  }, [map, a?.lat, a?.lng, b?.lat, b?.lng, hub?.lat, hub?.lng]);
  return null;
}

function PanTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    if (target.zoom) map.setView([target.lat, target.lng], target.zoom);
    else map.panTo([target.lat, target.lng]);
  }, [map, target?.lat, target?.lng, target?.zoom]);
  return null;
}

// Report where the map is looking (once on mount, then after every pan/zoom)
// so places can be browsed with no locations set.
function CenterTracker({ onChange }) {
  const map = useMap();
  useEffect(() => {
    const report = () => {
      const c = map.getCenter();
      onChange?.({ lat: +c.lat.toFixed(4), lng: +c.lng.toFixed(4) });
    };
    report();
    map.on('moveend', report);
    return () => map.off('moveend', report);
  }, [map, onChange]);
  return null;
}

export default function MapView({
  a,
  b,
  routes,
  routeIndex,
  onSelectRoute,
  midpoint,
  hub,
  radiusKm,
  places,
  activePlaceId,
  onPlaceHover,
  onPlaceSelect,
  openPlace,
  onPopupClose,
  panTarget,
  onCenterChange,
  hubCandidates,
  onHubSelect,
  distanceNote,
}) {
  const center = useMemo(() => {
    if (midpoint) return [midpoint[0], midpoint[1]];
    if (a) return [a.lat, a.lng];
    return [51.5, -0.12];
  }, [a, midpoint]);

  return (
    <MapContainer
      center={center}
      zoom={6}
      style={{ width: '100%', height: '100%', background: 'var(--map-bg)' }}
      zoomControl={true}
      attributionControl={true}
    >
      <VectorBaseLayer />
      <FitBounds a={a} b={b} hub={hub} />
      <PanTo target={panTarget} />
      <CenterTracker onChange={onCenterChange} />

      {routes?.map((r, i) =>
        i === routeIndex ? null : (
          <Polyline
            key={`alt-${i}`}
            positions={r.coords}
            pathOptions={{ color: '#9FB0A6', weight: 4, opacity: 0.8 }}
            eventHandlers={{ click: () => onSelectRoute?.(i) }}
          />
        )
      )}
      {routes?.[routeIndex] && (
        <Polyline
          positions={routes[routeIndex].coords}
          pathOptions={{ color: '#2F6F5E', weight: 5, opacity: 0.95 }}
        />
      )}

      {a && <Marker position={[a.lat, a.lng]} icon={endIcon('Start A')} />}
      {b && <Marker position={[b.lat, b.lng]} icon={endIcon('Start B')} />}

      {hub && radiusKm > 0 && (
        <Circle
          center={[hub.lat, hub.lng]}
          radius={radiusKm * 1000}
          pathOptions={{
            color: '#6B7A70',
            weight: 1.5,
            dashArray: '6 6',
            fillColor: '#2F6F5E',
            fillOpacity: 0.06,
          }}
        />
      )}

      {hubCandidates
        ?.filter((h) => h.id !== hub?.id)
        .map((h) => (
          <Marker
            key={h.id}
            position={[h.lat, h.lng]}
            icon={pulseIcon}
            zIndexOffset={420}
            eventHandlers={{ click: () => onHubSelect?.(h.id) }}
          >
            <Tooltip direction="top" offset={[0, -8]}>{h.name}</Tooltip>
          </Marker>
        ))}

      {hub && hub.id !== 'raw' && (
        <Marker position={[hub.lat, hub.lng]} icon={hubIcon} zIndexOffset={450}>
          <Tooltip direction="top" offset={[0, -9]} permanent>{hub.name}</Tooltip>
        </Marker>
      )}

      {midpoint && (
        <Marker position={[midpoint[0], midpoint[1]]} icon={midpointIcon} zIndexOffset={500}>
          <Tooltip direction="top" offset={[0, -10]}>Halfway</Tooltip>
        </Marker>
      )}

      {places?.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={placeIcon(p.id === activePlaceId, p.category)}
          zIndexOffset={p.id === activePlaceId ? 400 : 0}
          eventHandlers={{
            mouseover: () => onPlaceHover?.(p.id),
            mouseout: () => onPlaceHover?.(null),
            click: () => onPlaceSelect?.(p.id),
          }}
        >
          <Tooltip direction="top" offset={[0, -8]}>{p.name}</Tooltip>
        </Marker>
      ))}

      {openPlace && (
        <Popup
          position={[openPlace.lat, openPlace.lng]}
          offset={[0, -6]}
          eventHandlers={{ remove: () => onPopupClose?.() }}
        >
          <div className="place-popup">
            <PlaceImage
              place={openPlace}
              size={180}
              style={{ width: '100%', height: 120, borderRadius: '6px 6px 0 0', marginBottom: 8 }}
            />
            <strong>{openPlace.name}</strong>
            <div className="place-popup-meta">
              <span
                className="place-popup-dot"
                style={{ background: CATEGORY_COLORS[openPlace.category] || '#6B7A70' }}
              />
              {categoryLabel(openPlace.category)}
              {openPlace.cuisine
                ? ` · ${openPlace.cuisine.split(';')[0].replace(/_/g, ' ')}`
                : ''}
            </div>
            {openPlace.street && <div className="place-popup-row">{openPlace.street}</div>}
            {openPlace.openingHours && (
              <div className="place-popup-hours">{openPlace.openingHours}</div>
            )}
            {openPlace.distanceKm != null && (
              <div className="place-popup-row">
                {openPlace.distanceKm.toFixed(1)}&thinsp;km {distanceNote || 'away'}
              </div>
            )}
            <div className="place-popup-links">
              {openPlace.website && (
                <a href={openPlace.website} target="_blank" rel="noopener noreferrer">
                  Website
                </a>
              )}
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${openPlace.lat},${openPlace.lng}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Directions
              </a>
            </div>
          </div>
        </Popup>
      )}
    </MapContainer>
  );
}
