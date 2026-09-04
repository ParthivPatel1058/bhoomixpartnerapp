import { haversineKm, type LatLng } from './geo';
import type { Route, RouteStep } from './routing';

/**
 * Geometry for live turn-by-turn: where the partner is along the route, which
 * manoeuvre is next, and whether they have wandered off it.
 */

/** Treat the delivery as reached inside this radius (metres). */
export const ARRIVAL_RADIUS_M = 60;

/** Past this distance from the line, the route is stale and must be redrawn. */
export const OFF_ROUTE_M = 70;

/**
 * Advance to the next instruction this far before the manoeuvre point.
 *
 * Without it, floating-point noise in the distance sum leaves the banner on
 * "continue straight" at the exact moment the partner reaches the turn. Real
 * navigation apps also announce a turn slightly early, so this doubles as
 * better behaviour on the road.
 */
export const STEP_ADVANCE_TOLERANCE_M = 20;

interface Projection {
  /** Closest point on the polyline. */
  point: LatLng;
  /** Metres from the partner to that point. */
  distanceM: number;
  /** Index of the segment the projection landed on. */
  segmentIndex: number;
  /** 0–1 position within that segment. */
  t: number;
}

/**
 * Projects a position onto a polyline.
 *
 * Works in a local planar approximation: over the tens of metres that matter
 * here, scaling longitude by cos(lat) is accurate enough and far cheaper than
 * spherical maths on every GPS tick.
 */
export function projectOntoRoute(position: LatLng, path: LatLng[]): Projection | null {
  if (path.length < 2) return null;

  const latRad = (position.lat * Math.PI) / 180;
  const kx = Math.cos(latRad) * 111_320; // metres per degree of longitude
  const ky = 110_540; // metres per degree of latitude

  const toXY = (p: LatLng) => ({ x: p.lng * kx, y: p.lat * ky });
  const me = toXY(position);

  let best: Projection | null = null;

  for (let i = 0; i < path.length - 1; i += 1) {
    const a = toXY(path[i]);
    const b = toXY(path[i + 1]);

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;

    // Degenerate segment (duplicate points) — clamp to the start.
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((me.x - a.x) * dx + (me.y - a.y) * dy) / lenSq));

    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const distanceM = Math.hypot(me.x - px, me.y - py);

    if (!best || distanceM < best.distanceM) {
      best = {
        point: {
          lat: path[i].lat + t * (path[i + 1].lat - path[i].lat),
          lng: path[i].lng + t * (path[i + 1].lng - path[i].lng),
        },
        distanceM,
        segmentIndex: i,
        t,
      };
    }
  }

  return best;
}

/** Metres of route still ahead of the projected position. */
export function remainingAlongRouteM(path: LatLng[], projection: Projection): number {
  let metres = 0;

  // Tail of the segment we are currently on.
  const a = path[projection.segmentIndex];
  const b = path[projection.segmentIndex + 1];
  metres += haversineKm(projection.point, b) * 1000;

  // Plus every whole segment after it.
  for (let i = projection.segmentIndex + 1; i < path.length - 1; i += 1) {
    metres += haversineKm(path[i], path[i + 1]) * 1000;
  }

  void a;
  return metres;
}

export interface NavigationProgress {
  /** Metres left to the drop-off, measured along the road. */
  remainingM: number;
  /** 0–1 share of the route already covered. */
  fraction: number;
  /** Metres from the partner to the route line. */
  offRouteM: number;
  offRoute: boolean;
  arrived: boolean;
  /** The manoeuvre the partner is approaching. */
  currentStep: RouteStep | null;
  /** Metres until that manoeuvre. */
  distanceToStepM: number | null;
  /** Steps still ahead, current one first. */
  upcomingSteps: RouteStep[];
}

/**
 * Derives live progress from a route and the latest fix.
 *
 * Steps are matched by cumulative distance rather than by index, because OSRM
 * step boundaries do not line up with polyline vertices.
 */
export function computeProgress(
  route: Route | null,
  position: LatLng | null,
  destination: LatLng | null,
): NavigationProgress | null {
  if (!route || !position || route.coordinates.length < 2) return null;

  const path = route.coordinates;
  const projection = projectOntoRoute(position, path);
  if (!projection) return null;

  const totalM = route.distanceKm * 1000;
  const remainingM = remainingAlongRouteM(path, projection);
  const travelledM = Math.max(0, totalM - remainingM);

  // Straight-line to the destination is the honest arrival test: a partner can
  // reach the door without tracing the last metres of the polyline.
  const directM = destination ? haversineKm(position, destination) * 1000 : remainingM;

  // Walk the step list until we pass the distance already covered. The
  // tolerance flips the banner to the next instruction just before the turn
  // rather than just after it.
  let cursor = 0;
  let currentIndex = route.steps.length - 1;
  for (let i = 0; i < route.steps.length; i += 1) {
    cursor += route.steps[i].distanceKm * 1000;
    if (cursor - STEP_ADVANCE_TOLERANCE_M > travelledM) {
      currentIndex = i;
      break;
    }
  }

  const currentStep = route.steps[currentIndex] ?? null;
  const distanceToStepM = currentStep ? Math.max(0, cursor - travelledM) : null;

  return {
    remainingM,
    fraction: totalM > 0 ? Math.min(1, travelledM / totalM) : 0,
    offRouteM: projection.distanceM,
    offRoute: projection.distanceM > OFF_ROUTE_M,
    arrived: directM <= ARRIVAL_RADIUS_M,
    currentStep,
    distanceToStepM,
    upcomingSteps: route.steps.slice(currentIndex),
  };
}

/** "in 250 m" / "in 1.2 km" — phrasing for the manoeuvre banner. */
export function formatManeuverDistance(metres: number | null): string {
  if (metres == null || !Number.isFinite(metres)) return '';
  if (metres < 30) return 'now';
  if (metres < 1000) return `in ${Math.round(metres / 10) * 10} m`;
  return `in ${(metres / 1000).toFixed(1)} km`;
}
