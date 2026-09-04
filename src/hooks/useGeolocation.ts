import { useCallback, useEffect, useRef, useState } from 'react';
import type { LatLng } from '../lib/geo';

export type GeoStatus = 'idle' | 'locating' | 'tracking' | 'denied' | 'unavailable' | 'error';

export interface GeolocationState {
  position: LatLng | null;
  /** Metres of uncertainty reported by the device, when available. */
  accuracy: number | null;
  /** Degrees clockwise from north, when the device reports a heading. */
  heading: number | null;
  /** Metres per second. */
  speed: number | null;
  status: GeoStatus;
  error: string | null;
  updatedAt: number | null;
}

const INITIAL: GeolocationState = {
  position: null,
  accuracy: null,
  heading: null,
  speed: null,
  status: 'idle',
  error: null,
  updatedAt: null,
};

/**
 * Continuous GPS tracking for the navigation map.
 *
 * Uses `watchPosition` rather than repeated `getCurrentPosition` calls so the
 * browser can stream fixes without re-prompting, and cleans the watch up on
 * unmount — leaking a watch keeps the GPS radio alive and drains the phone.
 */
export function useGeolocation(enabled = true): GeolocationState & { refresh: () => void } {
  const [state, setState] = useState<GeolocationState>(INITIAL);
  const watchIdRef = useRef<number | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setState((s) => (s.status === 'idle' ? s : { ...s, status: 'idle' }));
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({
        ...INITIAL,
        status: 'unavailable',
        error: 'This device does not support GPS positioning.',
      });
      return;
    }

    setState((s) => ({ ...s, status: s.position ? 'tracking' : 'locating', error: null }));

    const onSuccess = (pos: GeolocationPosition) => {
      setState({
        position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
        accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        heading: Number.isFinite(pos.coords.heading ?? NaN) ? pos.coords.heading : null,
        speed: Number.isFinite(pos.coords.speed ?? NaN) ? pos.coords.speed : null,
        status: 'tracking',
        error: null,
        updatedAt: Date.now(),
      });
    };

    const onError = (err: GeolocationPositionError) => {
      const denied = err.code === err.PERMISSION_DENIED;
      setState((s) => ({
        ...s,
        status: denied ? 'denied' : 'error',
        error: denied
          ? 'Location permission is blocked. Enable it to navigate to customers.'
          : err.message || 'Could not get a GPS fix.',
      }));
    };

    const id = navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000,
    });
    watchIdRef.current = id;

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enabled, nonce]);

  return { ...state, refresh };
}
