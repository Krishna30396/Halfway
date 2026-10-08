'use client';

import { useEffect, useRef } from 'react';
import {
  MapContainer,
  Marker,
  Polyline,
  Circle,
  Tooltip,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import VectorBaseLayer from './VectorBaseLayer';
import { useThemeMode } from '@/lib/mapStyle';
import { buildLeafletTrafficSegments, TRAFFIC_COLORS, TRAFFIC_CONFIG } from '@/lib/traffic';
import { CATEGORY_COLORS } from '@/lib/categories';
import { glideMarker } from '@/lib/liveTracking';

const esc = (t) =>
  String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Icons are cached: live location updates re-render often, and a fresh icon
// object makes Leaflet rebuild the marker's DOM every time.
const iconCache = new Map();
function cachedIcon(key, make) {
  if (!iconCache.has(key)) iconCache.set(key, make());
  return iconCache.get(key);
}

const personIcon = (letter, color, isMe) =>
  cachedIcon(`person:${letter}:${color}:${isMe}`, () =>
    L.divIcon({
      className: '',
      html: `<div class="person-pin${isMe ? ' person-pin-me' : ''}" style="background:${color}">${esc(letter)}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    })
  );

const simpleIcon = (cls, size) =>
  cachedIcon(`simple:${cls}`, () =>
    L.divIcon({ className: '', html: `<div class="${cls}"></div>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] })
  );

const placeIcon = (category, active) =>
  cachedIcon(`place:${category}:${active}`, () => {
    const color = CATEGORY_COLORS[category] || '#6B7A70';
    const size = active ? 16 : 11;
    return L.divIcon({
      className: '',
      html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid ${active ? '#1E2A24' : '#FFFFFF'};box-shadow:0 1px 3px rgba(30,42,36,.35)"></div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  });

function Fit({ points, fitKey }) {
  const map = useMap();
  useEffect(() => {
    const pts = points.filter(Boolean);
    if (pts.length >= 2) map.fitBounds(L.latLngBounds(pts), { padding: [56, 56], maxZoom: 16 });
    else if (pts.length === 1) map.setView(pts[0], 15);
    // Only refit when the set of things on the map changes, not on every GPS tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey]);
  return null;
}

// Navigation mode: keep the followed person centred, zoomed in to street level.
function Follow({ target }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    map.setView([target.lat, target.lng], Math.max(map.getZoom(), 17), { animate: true });
  }, [map, target?.lat, target?.lng]);
  return null;
}

function PanTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.panTo([target.lat, target.lng]);
  }, [map, target?.lat, target?.lng]);
  return null;
}

// The friend's updates arrive every few seconds; glide between them instead of
// letting react-leaflet jump the marker (it only sees the first position).
function GlidingMarker({ lat, lng, children, ...props }) {
  const ref = useRef(null);
  const first = useRef([lat, lng]);
  const glide = useRef({});
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    glideMarker(
      glide.current,
      () => {
        const p = m.getLatLng();
        return [p.lat, p.lng];
      },
      (p) => m.setLatLng(p),
      [lat, lng]
    );
  }, [lat, lng]);
  useEffect(() => () => cancelAnimationFrame(glide.current.raf), []);
  return (
    <Marker ref={ref} position={first.current} {...props}>
      {children}
    </Marker>
  );
}

function Clicks({ onClick }) {
  useMapEvents({
    click(e) {
      onClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export default function MeetMap({
  me,
  meLetter,
  friend,
  friendLetter,
  friendName,
  midpoint,
  places,
  selectedPlaceId,
  onPlaceSelect,
  proposal,
  dest,
  route,
  routeColor = '#2F6F5E',
  altRoute,
  altRouteColor = '#6E4F8C',
  follow,
  droppedPin,
  onMapClick,
  fitKey,
  panTarget,
}) {
  const mode = useThemeMode();
  const isNight = mode === 'dark';

  const start = me ? [me.lat, me.lng] : friend ? [friend.lat, friend.lng] : [20, 0];
  const points = [
    me && [me.lat, me.lng],
    friend && [friend.lat, friend.lng],
    dest && [dest.lat, dest.lng],
    proposal && [proposal.lat, proposal.lng],
    !dest && midpoint,
  ];

  return (
    <MapContainer
      center={start}
      zoom={me || friend ? 14 : 2}
      style={{ width: '100%', height: '100%', background: 'var(--map-bg)' }}
    >
      <VectorBaseLayer />
      {follow ? <Follow target={follow} /> : <Fit points={points} fitKey={fitKey} />}
      <PanTo target={panTarget} />
      {onMapClick && <Clicks onClick={onMapClick} />}

      {altRoute && (
        <Polyline
          positions={altRoute}
          pathOptions={{ color: isNight ? '#242A48' : altRouteColor, weight: 4, opacity: isNight ? 0.7 : 0.45, dashArray: '6 8' }}
        />
      )}
      {route && isNight && (
        <>
          <Polyline
            positions={route}
            pathOptions={{
              color: TRAFFIC_COLORS.CASING,
              weight: TRAFFIC_CONFIG.CASING_WIDTH,
              opacity: 1,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
          {buildLeafletTrafficSegments(route).map((seg, sIdx) => (
            <Polyline
              key={`meet-traffic-${sIdx}`}
              positions={seg.positions}
              pathOptions={{
                color: seg.color,
                weight: TRAFFIC_CONFIG.LINE_WIDTH,
                opacity: 1,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          ))}
        </>
      )}
      {route && !isNight && (
        <Polyline positions={route} pathOptions={{ color: routeColor, weight: follow ? 7 : 5, opacity: 0.92 }} />
      )}

      {places?.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={placeIcon(p.category, p.id === selectedPlaceId)}
          zIndexOffset={p.id === selectedPlaceId ? 250 : 0}
          eventHandlers={{ click: () => onPlaceSelect?.(p.id) }}
        >
          <Tooltip direction="top" offset={[0, -8]}>{p.name}</Tooltip>
        </Marker>
      ))}

      {midpoint && !dest && (
        <Marker position={midpoint} icon={simpleIcon('midpoint-pin', 16)} zIndexOffset={300}>
          <Tooltip direction="top" offset={[0, -10]}>Halfway</Tooltip>
        </Marker>
      )}

      {droppedPin && (
        <Marker position={[droppedPin.lat, droppedPin.lng]} icon={simpleIcon('drop-pin', 18)} zIndexOffset={350}>
          <Tooltip direction="top" offset={[0, -10]} permanent>Pinned spot</Tooltip>
        </Marker>
      )}

      {proposal && (
        <Marker position={[proposal.lat, proposal.lng]} icon={simpleIcon('proposal-pin', 24)} zIndexOffset={400}>
          <Tooltip direction="top" offset={[0, -14]} permanent>{proposal.name}</Tooltip>
        </Marker>
      )}

      {dest && (
        <>
          <Circle
            center={[dest.lat, dest.lng]}
            radius={150}
            pathOptions={{ color: '#1E2A24', weight: 1, dashArray: '4 4', fillOpacity: 0.05 }}
          />
          <Marker position={[dest.lat, dest.lng]} icon={simpleIcon('dest-pin', 24)} zIndexOffset={400}>
            <Tooltip direction="top" offset={[0, -14]} permanent>{dest.name}</Tooltip>
          </Marker>
        </>
      )}

      {friend?.accuracy > 50 && friend.accuracy < 5000 && (
        <Circle
          center={[friend.lat, friend.lng]}
          radius={friend.accuracy}
          pathOptions={{ color: '#6E4F8C', weight: 1, fillOpacity: 0.08, opacity: 0.4 }}
        />
      )}
      {friend && (
        <GlidingMarker
          lat={friend.lat}
          lng={friend.lng}
          icon={personIcon(friendLetter || '?', '#6E4F8C', false)}
          zIndexOffset={600}
        >
          <Tooltip direction="top" offset={[0, -16]}>{friendName}</Tooltip>
        </GlidingMarker>
      )}

      {me && (
        <>
          {me.accuracy > 0 && me.accuracy < 300 && (
            <Circle
              center={[me.lat, me.lng]}
              radius={me.accuracy}
              pathOptions={{ color: '#2F6F5E', weight: 1, fillOpacity: 0.08, opacity: 0.4 }}
            />
          )}
          <Marker position={[me.lat, me.lng]} icon={personIcon(meLetter || 'Y', '#2F6F5E', true)} zIndexOffset={700}>
            <Tooltip direction="top" offset={[0, -16]}>You</Tooltip>
          </Marker>
        </>
      )}
    </MapContainer>
  );
}
