import { useEffect, useMemo, useRef, useState } from 'react';
import type { DeliveryOrder } from '../types';
import type { LatLng } from '../lib/geo';
import { etaMinutesFromKm } from '../lib/geo';
import { fetchRoute, type Route } from '../lib/routing';
import { computeProgress, type NavigationProgress } from '../lib/navigation';
import { useDestination, type DestinationSource } from './useDestination';

/** Movement that justifies recomputing the route while on course. */
const REROUTE_THRESHOLD_KM = 0.08;
/** Never re-route more often than this, even when off course. */
const REROUTE_COOLDOWN_MS = 10_000;

interface UseNavigationResult {
  destination: LatLng | null;
  destinationSource: DestinationSource;
  resolvingDestination: boolean;

  route: Route | null;
  routing: boolean;
  /** True while a re-route triggered by leaving the road is in flight. */
  rerouting: boolean;

  progress: NavigationProgress | null;
  /** Live ETA in minutes, recomputed from the distance still ahead. */
  etaMinutes: number | null;
  /** Metres still to travel along the road. */
  remainingM: number | null;
  arrived: boolean;
}

/**
 * The full navigation loop for one delivery.
 *
 * Resolves the destination, fetches a road route, then on every GPS tick works
 * out progress along it — including auto re-routing when the partner leaves the
 * road, which is what makes this actually usable while riding rather than a
 * static line drawn once at the start.
 */
export function useNavigation(
  order: DeliveryOrder | null,
  position: LatLng | null,
): UseNavigationResult {
  const { destination, source, resolving } = useDestination(order);

  const [route, setRoute] = useState<Route | null>(null);
  const [routing, setRouting] = useState(false);
  const [rerouting, setRerouting] = useState(false);

  const lastOriginRef = useRef<LatLng | null>(null);
  const lastRerouteAtRef = useRef(0);
  const destKeyRef = useRef<string | null>(null);

  const destKey = destination
    ? `${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}`
    : null;

  // Progress is recomputed on every fix; it is pure maths, no network.
  const progress = useMemo(
    () => computeProgress(route, position, destination),
    [route, position, destination],
  );

  // Keep the flag in a ref so the routing effect can read it without taking it
  // as a dependency (which would re-run the effect on every progress tick).
  const offRouteRef = useRef(false);
  useEffect(() => {
    offRouteRef.current = Boolean(progress?.offRoute);
  }, [progress?.offRoute]);

  useEffect(() => {
    if (!position || !destination || !destKey) {
      setRoute(null);
      lastOriginRef.current = null;
      destKeyRef.current = null;
      return;
    }

    const destChanged = destKeyRef.current !== destKey;
    const movedFar =
      !lastOriginRef.current ||
      Math.hypot(
        (position.lat - lastOriginRef.current.lat) * 110.54,
        (position.lng - lastOriginRef.current.lng) *
          111.32 *
          Math.cos((position.lat * Math.PI) / 180),
      ) > REROUTE_THRESHOLD_KM;

    const now = Date.now();
    const offRoute =
      offRouteRef.current && now - lastRerouteAtRef.current > REROUTE_COOLDOWN_MS;

    if (!destChanged && !movedFar && !offRoute) return;

    destKeyRef.current = destKey;
    lastOriginRef.current = position;
    if (offRoute) lastRerouteAtRef.current = now;

    const controller = new AbortController();
    setRouting(true);
    if (offRoute) setRerouting(true);

    fetchRoute(position, destination, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setRoute(next);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setRouting(false);
          setRerouting(false);
        }
      });

    return () => controller.abort();
  }, [position, destination, destKey, progress?.offRoute]);

  const remainingM = progress?.remainingM ?? null;
  const etaMinutes =
    remainingM != null
      ? etaMinutesFromKm(remainingM / 1000)
      : (route?.durationMinutes ?? null);

  return {
    destination,
    destinationSource: source,
    resolvingDestination: resolving,
    route,
    routing,
    rerouting,
    progress,
    etaMinutes,
    remainingM,
    arrived: Boolean(progress?.arrived),
  };
}
