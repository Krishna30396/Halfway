'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet';
import { STYLE_URL, MAP_ATTRIBUTION, useThemeMode } from '@/lib/mapStyle';

setWorkerUrl('/vendor/maplibre-gl-worker.mjs');

/** Base map for the Leaflet (2D) maps: OpenFreeMap Liberty or Dark, following the theme. */
export default function VectorBaseLayer() {
  const map = useMap();
  const mode = useThemeMode();
  const layerRef = useRef(null);

  useEffect(() => {
    const layer = maplibreGL({ style: STYLE_URL[mode], attribution: MAP_ATTRIBUTION }).addTo(map);
    layerRef.current = layer;
    return () => {
      map.removeLayer(layer);
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    layerRef.current?.getMaplibreMap()?.setStyle(STYLE_URL[mode]);
  }, [mode]);

  return null;
}
