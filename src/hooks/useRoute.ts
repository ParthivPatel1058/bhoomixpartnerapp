import { useEffect, useRef, useState } from 'react';
import { haversineKm, type LatLng } from '../lib/geo';
import { fetchRoute, type Route } from '../lib/routing';

/**
 * Re-route only after the partner has actually moved this far. Without it,
 * every GPS jitter (a few metres, several times a minute) would fire a routing
 * request and repaint the polyline.
 */
const REROUTE_THRESHOLD_KM = 0.08;

interface UseRouteResult {
  route: Route | null;
  loading: boolean;
  /** Straight-line distance to the destination, updated on every GPS tick. */
  remainingKm: number | null;
}

export function useRoute(origin: LatLng | null, destination: LatLng | null): UseRouteResult {
  const [route, setRoute] = useState<Route | null>(null);
  const [loading, setLoading] = useState(false);
  const lastOriginRef = useRef<LatLng | null>(null);
  const destKeyRef = useRef<string | null>(null);

  const destKey = destination ? `${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}` : null;

  useEffect(() => {
    if (!origin || !destination || !destKey) {
      setRoute(null);
      lastOriginRef.current = null;
      destKeyRef.current = null;
      return;
    }

    const destChanged = destKeyRef.current !== destKey;
    const movedFar =
      !lastOriginRef.current || haversineKm(lastOriginRef.current, origin) > REROUTE_THRESHOLD_KM;

    if (!destChanged && !movedFar) return;

    destKeyRef.current = destKey;
    lastOriginRef.current = origin;

    const controller = new AbortController();
    setLoading(true);

    fetchRoute(origin, destination, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setRoute(next);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [origin, destination, destKey]);

  return {
    route,
    loading,
    remainingKm: origin && destination ? haversineKm(origin, destination) : null,
  };
}
