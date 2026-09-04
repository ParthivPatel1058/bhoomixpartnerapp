import React, { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { FALLBACK_CENTER, type LatLng } from '../lib/geo';

export type MarkerKind = 'partner' | 'destination' | 'pickup' | 'hotspot';

export interface MapMarker {
  id: string;
  position: LatLng;
  kind: MarkerKind;
  label?: string;
  popup?: string;
  /** Degrees clockwise from north; rotates the partner puck. */
  heading?: number | null;
  onClick?: () => void;
}

interface MapComponentProps {
  center?: LatLng;
  zoom?: number;
  markers?: MapMarker[];
  /** Road geometry drawn as the active route. */
  route?: LatLng[] | null;
  /** Fit the viewport to the route the first time it appears. */
  fitRoute?: boolean;
  /** When true the map recenters on `center` as it changes (follow mode). */
  followCenter?: boolean;
  className?: string;
  interactive?: boolean;
}

/*
 * Keyless tile providers only.
 *
 * MapTiler was dropped deliberately: an INVALID or expired key does not 403, it
 * returns HTTP 200 with an "Invalid key" placeholder image, so Leaflet treats
 * the tile as loaded and no `tileerror` fires — the map silently fills with
 * "Invalid key" text and nothing can recover it. CARTO's Voyager basemap is
 * free, needs no key, and looks clean; OpenStreetMap is the ultimate fallback.
 * Neither can ever show a key error, so the map always works.
 */
const CARTO_TILES = {
  url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  options: {
    subdomains: 'abcd',
    minZoom: 1,
    maxZoom: 20,
    crossOrigin: true,
    // Serves @2x tiles to high-DPI phones so the map is crisp, not blurry.
    detectRetina: true,
  } as L.TileLayerOptions,
  attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
};

const OSM_TILES = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  options: { minZoom: 1, maxZoom: 19, crossOrigin: true } as L.TileLayerOptions,
  attribution: '&copy; OpenStreetMap contributors',
};

/**
 * Attaches the CARTO basemap, swapping to OSM if its tiles ever fail.
 *
 * Both providers are keyless, so the only failure mode is a genuine network or
 * outage error — which does fire `tileerror`, unlike the invalid-key case that
 * broke the old MapTiler setup.
 */
function addResilientTileLayer(map: L.Map): void {
  const primary = L.tileLayer(CARTO_TILES.url, {
    ...CARTO_TILES.options,
    attribution: CARTO_TILES.attribution,
  }).addTo(map);

  let errors = 0;
  let swapped = false;
  primary.on('tileerror', () => {
    errors += 1;
    if (swapped || errors < 4) return;
    swapped = true;
    map.removeLayer(primary);
    L.tileLayer(OSM_TILES.url, {
      ...OSM_TILES.options,
      attribution: OSM_TILES.attribution,
    }).addTo(map);
  });
}

/**
 * Inline SVG/HTML markers.
 *
 * Leaflet's default marker resolves its icon relative to the stylesheet URL,
 * which breaks under a bundler and renders as a broken image. Div icons avoid
 * the problem entirely and let the pins match the app's palette.
 */
function iconFor(marker: MapMarker): L.DivIcon {
  if (marker.kind === 'partner') {
    const rotation = marker.heading ?? 0;
    return L.divIcon({
      className: 'bhoomix-marker',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      html: `
        <div style="position:relative;width:26px;height:26px;">
          <span style="position:absolute;inset:0;border-radius:9999px;background:rgba(0,106,106,.35);animation:gpsPing 2s ease-out infinite;"></span>
          <span style="position:absolute;inset:4px;border-radius:9999px;background:#006a6a;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3);
            transform:rotate(${rotation}deg);"></span>
        </div>`,
    });
  }

  const palette: Record<Exclude<MarkerKind, 'partner'>, { bg: string; glyph: string }> = {
    destination: { bg: '#ba1a1a', glyph: '📍' },
    pickup: { bg: '#5e604d', glyph: '📦' },
    hotspot: { bg: '#006a6a', glyph: '⚡' },
  };
  const { bg, glyph } = palette[marker.kind];

  return L.divIcon({
    className: 'bhoomix-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 30],
    popupAnchor: [0, -28],
    html: `
      <div style="width:32px;height:32px;border-radius:9999px 9999px 9999px 2px;transform:rotate(-45deg);
        background:${bg};border:2px solid #fff;box-shadow:0 3px 10px rgba(0,0,0,.28);
        display:flex;align-items:center;justify-content:center;">
        <span style="transform:rotate(45deg);font-size:14px;line-height:1;">${glyph}</span>
      </div>`,
  });
}

export const MapComponent: React.FC<MapComponentProps> = ({
  center,
  zoom = 14,
  markers = [],
  route = null,
  fitRoute = false,
  followCenter = true,
  className = 'w-full h-full',
  interactive = true,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const markerCacheRef = useRef<Map<string, L.Marker>>(new Map());
  const hasFitRef = useRef(false);

  const resolvedCenter = center ?? FALLBACK_CENTER;

  // Primitives, so the effects below don't re-run on every parent render just
  // because a fresh `{lat, lng}` object was allocated.
  const centerLat = resolvedCenter.lat;
  const centerLng = resolvedCenter.lng;

  // --- Map lifecycle -------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    const map = L.map(container, {
      zoomControl: false,
      attributionControl: true,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      touchZoom: interactive,
      keyboard: interactive,
    }).setView([centerLat, centerLng], zoom);

    addResilientTileLayer(map);
    if (interactive) L.control.zoom({ position: 'topright' }).addTo(map);
    map.attributionControl.setPrefix(false);

    routeLayerRef.current = L.layerGroup().addTo(map);
    markerLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Leaflet mis-measures a container that animates or starts hidden; nudge it
    // once the first paint settles.
    const settle = window.setTimeout(() => map.invalidateSize(), 120);
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);

    return () => {
      window.clearTimeout(settle);
      window.removeEventListener('resize', onResize);
      // Without this, remounting the view throws
      // "Map container is already initialized".
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      routeLayerRef.current = null;
      markerCacheRef.current.clear();
      hasFitRef.current = false;
    };
    // Intentionally mount-only: center/zoom changes are handled below so that
    // panning the map by hand isn't undone on the next render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Follow the center ---------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !followCenter) return;
    map.setView([centerLat, centerLng], map.getZoom(), { animate: true });
  }, [centerLat, centerLng, followCenter]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) map.setZoom(zoom);
  }, [zoom]);

  // --- Markers -------------------------------------------------------------
  // Reuse marker instances across renders: recreating them made pins flicker
  // and wiped every layer on the map, popups included.
  const markerSignature = useMemo(
    () =>
      markers
        .map((m) => `${m.id}:${m.position.lat.toFixed(5)},${m.position.lng.toFixed(5)}:${m.kind}:${Math.round(m.heading ?? 0)}:${m.popup ?? ''}`)
        .join('|'),
    [markers],
  );

  useEffect(() => {
    const layer = markerLayerRef.current;
    if (!layer) return;

    const cache = markerCacheRef.current;
    const seen = new Set<string>();

    for (const marker of markers) {
      seen.add(marker.id);
      const existing = cache.get(marker.id);

      if (existing) {
        existing.setLatLng([marker.position.lat, marker.position.lng]);
        existing.setIcon(iconFor(marker));
        if (marker.popup) existing.bindPopup(marker.popup);
        else existing.unbindPopup();
        continue;
      }

      const created = L.marker([marker.position.lat, marker.position.lng], {
        icon: iconFor(marker),
        title: marker.label,
        keyboard: false,
      });
      if (marker.popup) created.bindPopup(marker.popup);
      if (marker.onClick) created.on('click', marker.onClick);
      created.addTo(layer);
      cache.set(marker.id, created);
    }

    for (const [id, instance] of cache) {
      if (!seen.has(id)) {
        layer.removeLayer(instance);
        cache.delete(id);
      }
    }
    // `markers` is rebuilt every render by callers; the signature is the real
    // dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerSignature]);

  // --- Route polyline ------------------------------------------------------
  const routeSignature = useMemo(
    () =>
      route?.length
        ? `${route.length}:${route[0].lat.toFixed(4)},${route[0].lng.toFixed(4)}->${route[route.length - 1].lat.toFixed(4)},${route[route.length - 1].lng.toFixed(4)}`
        : '',
    [route],
  );

  useEffect(() => {
    const map = mapRef.current;
    const layer = routeLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();
    if (!route || route.length < 2) {
      hasFitRef.current = false;
      return;
    }

    const path = route.map((p) => [p.lat, p.lng] as [number, number]);

    // Casing underneath + bright line on top keeps the route legible on both
    // pale streets and dark parks.
    L.polyline(path, { color: '#ffffff', weight: 9, opacity: 0.9, lineCap: 'round' }).addTo(layer);
    L.polyline(path, { color: '#006a6a', weight: 5, opacity: 1, lineCap: 'round' }).addTo(layer);

    if (fitRoute && !hasFitRef.current) {
      map.fitBounds(L.latLngBounds(path), { padding: [48, 48], maxZoom: 16 });
      hasFitRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSignature, fitRoute]);

  return <div ref={containerRef} className={className} style={{ minHeight: 200 }} />;
};
