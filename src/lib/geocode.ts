import type { LatLng } from './geo';

/**
 * Turns a written delivery address into coordinates.
 *
 * Needed because the customer app only stores GPS when the shopper grants
 * location permission — deny it, and the partner gets an order with nothing to
 * navigate to. Where an address exists, geocoding recovers a usable destination.
 */

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_API_KEY as string | undefined;

/** Bias results to India so "Green Valley" doesn't resolve to another continent. */
const COUNTRY = 'in';
const TIMEOUT_MS = 8000;

/** Same address is looked up by several components; resolve it once. */
const cache = new Map<string, LatLng | null>();
const inflight = new Map<string, Promise<LatLng | null>>();

function normalize(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function withTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function viaMapTiler(address: string): Promise<LatLng | null> {
  if (!MAPTILER_KEY) return null;
  const url =
    `https://api.maptiler.com/geocoding/${encodeURIComponent(address)}.json` +
    `?key=${MAPTILER_KEY}&country=${COUNTRY}&limit=1`;

  const res = await withTimeout(url);
  if (!res.ok) return null;

  const body = (await res.json()) as {
    features?: { center?: [number, number] }[];
  };
  const center = body.features?.[0]?.center;
  // GeoJSON order is [lng, lat].
  return center ? { lat: center[1], lng: center[0] } : null;
}

async function viaNominatim(address: string): Promise<LatLng | null> {
  const url =
    `https://nominatim.openstreetmap.org/search?format=json&limit=1` +
    `&countrycodes=${COUNTRY}&q=${encodeURIComponent(address)}`;

  const res = await withTimeout(url);
  if (!res.ok) return null;

  const body = (await res.json()) as { lat: string; lon: string }[];
  const hit = body?.[0];
  if (!hit) return null;

  const lat = parseFloat(hit.lat);
  const lng = parseFloat(hit.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
}

/**
 * Resolve an address to coordinates, or null when it cannot be placed.
 *
 * Never throws: a geocoder being down must not break the delivery screen.
 */
export async function geocodeAddress(address: string | null | undefined): Promise<LatLng | null> {
  if (!address?.trim()) return null;

  const key = normalize(address);
  if (cache.has(key)) return cache.get(key) ?? null;

  const existing = inflight.get(key);
  if (existing) return existing;

  const task = (async () => {
    try {
      const result = (await viaMapTiler(address)) ?? (await viaNominatim(address));
      cache.set(key, result);
      return result;
    } catch {
      // Do not cache failures — a transient network blip should be retryable.
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}
