'use client';

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import { setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet';
import { MAP_STYLE, MAP_ATTRIBUTION, useThemeMode } from '@/lib/mapStyle';

setWorkerUrl('/vendor/maplibre-gl-worker.mjs');

/** Base map for the Leaflet (2D) maps: colourful OpenStreetMap or OpenFreeMap Dark, following the theme. */
export default function VectorBaseLayer() {
  const map = useMap();
  const mode = useThemeMode();
  const layerRef = useRef(null);

  useEffect(() => {
    const layer = maplibreGL({ style: MAP_STYLE[mode], attribution: MAP_ATTRIBUTION[mode] }).addTo(map);
    layerRef.current = layer;
    return () => {
      map.removeLayer(layer);
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    layerRef.current?.getMaplibreMap()?.setStyle(MAP_STYLE[mode]);
  }, [mode]);

  return null;
}
