/**
 * Halfway Night Theme 2-Colour Traffic Helper
 * 
 * Rules:
 * - Free flow (ratio >= 0.5): BLUE #00C8FF (width 5)
 * - Heavy traffic (ratio < 0.5): RED #FF4D4D (width 5)
 * - Casing (under line): #161A30 (width = line width + 3px = 8, round caps/joins)
 * - NO yellow, NO moderate level.
 * - Refresh every 60s with 300ms fade transition.
 */

export const TRAFFIC_COLORS = {
  FREE_FLOW: '#00C8FF',
  HEAVY: '#FF4D4D',
  CASING: '#161A30',
};

export const TRAFFIC_CONFIG = {
  LINE_WIDTH: 5,
  CASING_WIDTH: 8, // line width + 3px
  REFRESH_INTERVAL_MS: 60000, // 60s
  TRANSITION_DURATION_MS: 300, // 300ms fade
  USE_MOCK_TRAFFIC: true,
};

/**
 * Evaluates traffic ratio and returns #00C8FF or #FF4D4D.
 */
export function getSegmentColor(currentSpeed, freeFlowSpeed) {
  if (currentSpeed == null || freeFlowSpeed == null || freeFlowSpeed <= 0) {
    return TRAFFIC_COLORS.FREE_FLOW;
  }
  const ratio = currentSpeed / freeFlowSpeed;
  return ratio >= 0.5 ? TRAFFIC_COLORS.FREE_FLOW : TRAFFIC_COLORS.HEAVY;
}

/**
 * Splits route coordinates into segmented GeoJSON features with 2-colour traffic.
 * @param {Array<[number, number]>} coords - [[lng, lat], ...]
 * @param {Array<Object>|null} apiTrafficSegments - optional traffic data from API
 * @param {boolean} useMock - fallback to mock generator if API traffic is absent
 */
export function buildTrafficSegments(coords, apiTrafficSegments = null, useMock = TRAFFIC_CONFIG.USE_MOCK_TRAFFIC) {
  if (!coords || coords.length < 2) {
    return { type: 'FeatureCollection', features: [] };
  }

  const features = [];
  const total = coords.length - 1;

  // If API traffic segments exist, map each segment
  if (apiTrafficSegments && apiTrafficSegments.length > 0) {
    apiTrafficSegments.forEach((seg) => {
      const color = getSegmentColor(seg.currentSpeed, seg.freeFlowSpeed);
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: seg.coordinates,
        },
        properties: { color },
      });
    });
    return { type: 'FeatureCollection', features };
  }

  // Segment the coordinates
  const segmentSize = Math.max(1, Math.floor(total / 6)); // ~6 chunks along the route
  let segIndex = 0;

  for (let i = 0; i < total; i += segmentSize) {
    const sliceEnd = Math.min(i + segmentSize + 1, coords.length);
    const segCoords = coords.slice(i, sliceEnd);
    if (segCoords.length < 2) continue;

    let color = TRAFFIC_COLORS.FREE_FLOW;
    if (useMock) {
      // Deterministic / realistic mock: one or two congested choke points (e.g. segments 3 & 4)
      const isJam = segIndex === 3 || segIndex === 4;
      color = isJam ? TRAFFIC_COLORS.HEAVY : TRAFFIC_COLORS.FREE_FLOW;
    }

    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: segCoords,
      },
      properties: { color },
    });
    segIndex++;
  }

  return { type: 'FeatureCollection', features };
}

/**
 * Attaches or updates the traffic route layers on a MapLibre GL map instance.
 * @param {Object} map - MapLibre map instance
 * @param {Array<[number, number]>} coords - route coordinates
 * @param {string} sourceId - source identifier (default: 'route-traffic')
 */
export function setupTrafficLayers(map, coords, sourceId = 'route-traffic') {
  if (!map) return null;

  const data = buildTrafficSegments(coords);

  if (map.getSource(sourceId)) {
    map.getSource(sourceId).setData(data);
  } else {
    map.addSource(sourceId, {
      type: 'geojson',
      data,
    });

    // 1. Casing (under line): #161A30, width = line width + 3px (8), round caps/joins
    map.addLayer({
      id: `${sourceId}-casing`,
      type: 'line',
      source: sourceId,
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': TRAFFIC_COLORS.CASING,
        'line-width': TRAFFIC_CONFIG.CASING_WIDTH,
        'line-opacity': 1.0,
      },
    });

    // 2. Traffic line: Blue #00C8FF or Red #FF4D4D, width 5, 300ms fade transition
    map.addLayer({
      id: `${sourceId}-line`,
      type: 'line',
      source: sourceId,
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': TRAFFIC_CONFIG.LINE_WIDTH,
        'line-color-transition': { duration: TRAFFIC_CONFIG.TRANSITION_DURATION_MS },
      },
    });
  }

  // Refresh every 60s
  const intervalId = setInterval(() => {
    if (!map.getSource(sourceId)) return;
    const refreshedData = buildTrafficSegments(coords, null, true);
    map.getSource(sourceId).setData(refreshedData);
  }, TRAFFIC_CONFIG.REFRESH_INTERVAL_MS);

  return () => clearInterval(intervalId);
}

/**
 * Builds Leaflet-compatible traffic segments [lat, lng].
 * @param {Array<[number, number]>} latLngCoords - [[lat, lng], ...]
 * @param {boolean} useMock - fallback to mock generator
 */
export function buildLeafletTrafficSegments(latLngCoords, useMock = TRAFFIC_CONFIG.USE_MOCK_TRAFFIC) {
  if (!latLngCoords || latLngCoords.length < 2) return [];

  const total = latLngCoords.length - 1;
  const segmentSize = Math.max(1, Math.floor(total / 6));
  const segments = [];
  let segIndex = 0;

  for (let i = 0; i < total; i += segmentSize) {
    const sliceEnd = Math.min(i + segmentSize + 1, latLngCoords.length);
    const segPositions = latLngCoords.slice(i, sliceEnd);
    if (segPositions.length < 2) continue;

    let color = TRAFFIC_COLORS.FREE_FLOW;
    if (useMock) {
      const isJam = segIndex === 3 || segIndex === 4;
      color = isJam ? TRAFFIC_COLORS.HEAVY : TRAFFIC_COLORS.FREE_FLOW;
    }

    segments.push({ positions: segPositions, color });
    segIndex++;
  }

  return segments;
}

