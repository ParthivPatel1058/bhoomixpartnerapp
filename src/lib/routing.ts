import {
  AVG_SPEED_KMH,
  bearingDeg,
  compassPoint,
  etaMinutesFromKm,
  haversineKm,
  type LatLng,
} from './geo';

export interface RouteStep {
  instruction: string;
  distanceKm: number;
  /** Street / area name when the router supplies one. */
  name?: string;
}

export interface Route {
  /** Ordered polyline from origin to destination. */
  coordinates: LatLng[];
  distanceKm: number;
  durationMinutes: number;
  steps: RouteStep[];
  /**
   * `osrm` = real road geometry. `direct` = straight line fallback used when
   * the routing service is unreachable (offline, blocked, rate-limited), so the
   * map still draws something and the ETA stays believable.
   */
  source: 'osrm' | 'direct';
}

/** Public OSRM demo server. No key required; treated as best-effort. */
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

const ROUTE_TIMEOUT_MS = 8000;

interface OsrmStep {
  distance: number;
  name?: string;
  maneuver?: { type?: string; modifier?: string };
}

interface OsrmLeg {
  steps?: OsrmStep[];
}

interface OsrmRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][] };
  legs?: OsrmLeg[];
}

function humanizeManeuver(step: OsrmStep): string {
  const type = step.maneuver?.type ?? 'continue';
  const modifier = step.maneuver?.modifier;
  const road = step.name?.trim();
  const onto = road ? ` onto ${road}` : '';

  switch (type) {
    case 'depart':
      return road ? `Head out on ${road}` : 'Start your route';
    case 'arrive':
      return 'Arrive at the drop-off';
    case 'roundabout':
    case 'rotary':
      return `Take the roundabout${onto}`;
    case 'merge':
      return `Merge${onto}`;
    case 'fork':
      return `Keep ${modifier ?? 'straight'}${onto}`;
    case 'new name':
    case 'continue':
      return road ? `Continue on ${road}` : 'Continue straight';
    default:
      return modifier ? `Turn ${modifier}${onto}` : `Continue${onto}`;
  }
}

/** Straight-line stand-in so the UI degrades gracefully instead of going blank. */
function directRoute(origin: LatLng, destination: LatLng): Route {
  const distanceKm = haversineKm(origin, destination);
  const heading = compassPoint(bearingDeg(origin, destination));

  return {
    coordinates: [origin, destination],
    distanceKm,
    durationMinutes: etaMinutesFromKm(distanceKm),
    steps: [
      {
        instruction: `Head ${heading} toward the drop-off`,
        distanceKm,
      },
      { instruction: 'Arrive at the drop-off', distanceKm: 0 },
    ],
    source: 'direct',
  };
}

/**
 * Fetch a driving route between two points.
 *
 * Never rejects: any network/parse failure falls back to a direct line so a
 * flaky routing service can't break navigation for a partner mid-delivery.
 */
export async function fetchRoute(
  origin: LatLng,
  destination: LatLng,
  signal?: AbortSignal,
): Promise<Route> {
  const url =
    `${OSRM_BASE}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}` +
    `?overview=full&geometries=geojson&steps=true`;

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), ROUTE_TIMEOUT_MS);

  // Abort on either the caller's signal or our own timeout.
  const onCallerAbort = () => timeout.abort();
  signal?.addEventListener('abort', onCallerAbort);

  try {
    const res = await fetch(url, { signal: timeout.signal });
    if (!res.ok) return directRoute(origin, destination);

    const body = (await res.json()) as { routes?: OsrmRoute[] };
    const route = body.routes?.[0];
    if (!route?.geometry?.coordinates?.length) return directRoute(origin, destination);

    const coordinates = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    const distanceKm = route.distance / 1000;
    // OSRM's free-flow duration is optimistic for Indian city traffic; blend it
    // with our conservative average speed so partners aren't shown fantasy ETAs.
    const osrmMinutes = route.duration / 60;
    const trafficMinutes = etaMinutesFromKm(distanceKm, AVG_SPEED_KMH);
    const durationMinutes = Math.max(1, Math.round((osrmMinutes + trafficMinutes) / 2));

    const steps: RouteStep[] = (route.legs?.[0]?.steps ?? [])
      .map((s) => ({
        instruction: humanizeManeuver(s),
        distanceKm: s.distance / 1000,
        name: s.name?.trim() || undefined,
      }))
      .filter((s) => s.instruction);

    return {
      coordinates,
      distanceKm,
      durationMinutes,
      steps: steps.length ? steps : directRoute(origin, destination).steps,
      source: 'osrm',
    };
  } catch {
    return directRoute(origin, destination);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }
}
