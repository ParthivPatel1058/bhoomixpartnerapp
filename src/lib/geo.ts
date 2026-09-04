export interface LatLng {
  lat: number;
  lng: number;
}

/** Central Mumbai — the map's home view when we have no GPS fix yet. */
export const FALLBACK_CENTER: LatLng = { lat: 19.076, lng: 72.8777 };

const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** Great-circle distance in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Initial bearing from `a` to `b`, in degrees clockwise from north. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export function compassPoint(bearing: number): string {
  return COMPASS[Math.round((bearing % 360) / 45) % 8];
}

/**
 * Average city-scooter speed used to turn a distance into an ETA when the
 * routing service is unavailable. Deliberately conservative for Indian metro
 * traffic.
 */
export const AVG_SPEED_KMH = 18;

export function etaMinutesFromKm(km: number, speedKmh = AVG_SPEED_KMH): number {
  if (!Number.isFinite(km) || km <= 0) return 0;
  return Math.max(1, Math.round((km / speedKmh) * 60));
}

export function formatKm(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return '—';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return '—';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** A coordinate pair is only usable if both halves are real numbers in range. */
export function isValidLatLng(
  lat: number | null | undefined,
  lng: number | null | undefined,
): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    // (0,0) is in the Atlantic — always a placeholder, never a real delivery.
    !(lat === 0 && lng === 0)
  );
}

export function toLatLng(
  lat: number | null | undefined,
  lng: number | null | undefined,
): LatLng | null {
  return isValidLatLng(lat, lng) ? { lat: lat as number, lng: lng as number } : null;
}

/** Deep-link into the device's Google Maps app for real turn-by-turn voice nav. */
export function googleMapsDirectionsUrl(dest: LatLng, origin?: LatLng | null): string {
  const params = new URLSearchParams({
    api: '1',
    destination: `${dest.lat},${dest.lng}`,
    travelmode: 'driving',
  });
  if (origin) params.set('origin', `${origin.lat},${origin.lng}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
