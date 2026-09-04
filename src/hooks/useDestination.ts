import { useEffect, useState } from 'react';
import type { DeliveryOrder } from '../types';
import type { LatLng } from '../lib/geo';
import { geocodeAddress } from '../lib/geocode';

export type DestinationSource = 'gps' | 'geocoded' | 'none';

interface UseDestinationResult {
  destination: LatLng | null;
  source: DestinationSource;
  resolving: boolean;
}

/**
 * Where this delivery actually goes.
 *
 * Prefers the customer's captured GPS pin. When that is missing — the customer
 * app only records it if location permission was granted — it falls back to
 * geocoding the written address, so navigation still works instead of showing
 * a dead end.
 */
export function useDestination(order: DeliveryOrder | null): UseDestinationResult {
  const [geocoded, setGeocoded] = useState<LatLng | null>(null);
  const [resolving, setResolving] = useState(false);

  const gps = order?.destination ?? null;
  const address = order?.address ?? null;

  useEffect(() => {
    // A real pin always wins; no need to spend a geocoding lookup.
    if (gps || !address) {
      setGeocoded(null);
      setResolving(false);
      return;
    }

    let cancelled = false;
    setResolving(true);

    geocodeAddress(address)
      .then((result) => {
        if (!cancelled) setGeocoded(result);
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });

    return () => {
      cancelled = true;
    };
  }, [gps, address]);

  const destination = gps ?? geocoded;

  return {
    destination,
    source: gps ? 'gps' : geocoded ? 'geocoded' : 'none',
    resolving,
  };
}
