import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Compass,
  Crosshair,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation as NavIcon,
  Package,
  Phone,
  Route as RouteIcon,
} from 'lucide-react';
import { MapComponent, type MapMarker } from './MapComponent';
import type { DeliveryOrder } from '../types';
import type { GeolocationState } from '../hooks/useGeolocation';
import { useNavigation } from '../hooks/useNavigation';
import { formatManeuverDistance } from '../lib/navigation';
import { formatKm, formatMinutes, googleMapsDirectionsUrl } from '../lib/geo';
import { STATUS_LABEL } from '../lib/orders';

interface NavigationMapViewProps {
  /** The delivery being navigated, if the partner has one in flight. */
  order: DeliveryOrder | null;
  geo: GeolocationState & { refresh: () => void };
  onOpenOrder?: (order: DeliveryOrder) => void;
}

export const NavigationMapView: React.FC<NavigationMapViewProps> = ({
  order,
  geo,
  onOpenOrder,
}) => {
  const [following, setFollowing] = useState(true);
  const [showAllSteps, setShowAllSteps] = useState(false);

  // Resolves the destination (GPS pin, else geocoded address), routes to it,
  // and tracks progress live — including re-routing if the partner goes off road.
  const nav = useNavigation(order, geo.position);
  const {
    destination,
    destinationSource,
    resolvingDestination: resolving,
    route,
    routing,
    progress,
  } = nav;

  const markers = useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = [];

    if (geo.position) {
      list.push({
        id: 'me',
        position: geo.position,
        kind: 'partner',
        label: 'You',
        heading: geo.heading,
      });
    }

    if (destination && order) {
      list.push({
        id: `dest-${order.id}`,
        position: destination,
        kind: 'destination',
        label: 'Drop-off',
        popup: `Drop-off · Order #${order.orderNumber}`,
      });
    }

    return list;
  }, [geo.position, geo.heading, destination, order]);

  const mapCenter = geo.position ?? destination ?? undefined;

  const etaMinutes = nav.etaMinutes ?? order?.etaMinutes ?? null;
  const distanceKm =
    nav.remainingM != null ? nav.remainingM / 1000 : (route?.distanceKm ?? null);
  const nextStep = progress?.currentStep ?? route?.steps?.[0] ?? null;

  return (
    <div className="relative w-full h-[calc(100dvh-9rem)] overflow-hidden bg-background">
      {/* Map layer */}
      <div className="absolute inset-0 z-0">
        <MapComponent
          center={mapCenter}
          zoom={15}
          markers={markers}
          route={route?.coordinates ?? null}
          fitRoute={!following}
          followCenter={following}
          className="w-full h-full"
        />
      </div>

      {/* Top HUD */}
      <div className="relative z-20 px-5 pt-4 max-w-lg mx-auto w-full pointer-events-none">
        <div className="bg-surface/92 backdrop-blur-2xl rounded-2xl p-4 shadow-lg border border-white/60 pointer-events-auto">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 shrink-0 rounded-full bg-secondary-container flex items-center justify-center text-on-secondary-container">
                {routing ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Compass className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-on-surface truncate">
                  {order ? `Order #${order.orderNumber}` : 'Live Navigation'}
                </h3>
                <p className="text-xs text-on-surface-variant truncate">
                  {order
                    ? `${STATUS_LABEL[order.status]} · ${order.itemCount} item${order.itemCount === 1 ? '' : 's'}`
                    : 'No active delivery'}
                </p>
              </div>
            </div>

            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 ${
                geo.status === 'tracking'
                  ? 'bg-tertiary-container text-on-tertiary-container'
                  : 'bg-error-container text-on-error-container'
              }`}
            >
              {geo.status === 'tracking'
                ? 'GPS live'
                : geo.status === 'locating'
                  ? 'Locating…'
                  : 'GPS off'}
            </span>
          </div>

          {/* Distance / ETA readout */}
          {order && destination && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="bg-surface-container-high rounded-xl px-3 py-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                  Distance
                </span>
                <p className="text-lg font-bold text-on-surface leading-tight">
                  {formatKm(distanceKm)}
                </p>
              </div>
              <div className="bg-surface-container-high rounded-xl px-3 py-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                  ETA
                </span>
                <p className="text-lg font-bold text-secondary leading-tight">
                  {formatMinutes(etaMinutes)}
                </p>
              </div>
            </div>
          )}

          {/* Route progress */}
          {progress && (
            <div className="mt-3 h-1.5 w-full rounded-full bg-surface-variant overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-secondary to-tertiary transition-[width] duration-700"
                style={{ width: `${Math.round(progress.fraction * 100)}%` }}
              />
            </div>
          )}

          {/* Next manoeuvre */}
          {nav.arrived ? (
            <div className="mt-3 bg-secondary text-on-secondary rounded-xl px-3 py-2.5 flex items-center gap-2">
              <MapPin className="w-4 h-4 shrink-0" />
              <p className="text-xs font-bold">You've arrived at the drop-off.</p>
            </div>
          ) : (
            nextStep && (
              <button
                onClick={() => setShowAllSteps((v) => !v)}
                className="mt-3 w-full bg-secondary/10 rounded-xl px-3 py-2.5 flex items-start gap-2 text-left"
                aria-expanded={showAllSteps}
              >
                <NavIcon className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-on-surface leading-snug flex-1">
                  {nextStep.instruction}
                  <span className="font-normal text-on-surface-variant">
                    {' '}
                    {progress
                      ? formatManeuverDistance(progress.distanceToStepM)
                      : `· ${formatKm(nextStep.distanceKm)}`}
                  </span>
                </p>
                <ChevronDown
                  className={`w-4 h-4 text-outline shrink-0 mt-0.5 transition-transform ${
                    showAllSteps ? 'rotate-180' : ''
                  }`}
                />
              </button>
            )
          )}

          {/* Full turn list */}
          {showAllSteps && progress && progress.upcomingSteps.length > 1 && (
            <ol className="mt-2 max-h-44 overflow-y-auto rounded-xl bg-surface-container-high divide-y divide-outline-variant/25">
              {progress.upcomingSteps.slice(1).map((step, i) => (
                <li key={i} className="px-3 py-2 flex items-start gap-2">
                  <span className="w-5 h-5 shrink-0 rounded-full bg-surface text-[10px] font-bold text-on-surface-variant flex items-center justify-center mt-px">
                    {i + 2}
                  </span>
                  <span className="text-xs text-on-surface leading-snug flex-1">
                    {step.instruction}
                    {step.distanceKm > 0 && (
                      <span className="text-on-surface-variant"> · {formatKm(step.distanceKm)}</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}

          {nav.rerouting && (
            <p className="mt-2 text-[11px] text-on-surface-variant flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              You left the route — recalculating.
            </p>
          )}

          {destinationSource === 'geocoded' && (
            <p className="mt-2 text-[11px] text-on-surface-variant flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-error shrink-0 mt-px" />
              Approximate pin from the written address — the customer did not share GPS.
              Confirm the exact spot by phone.
            </p>
          )}

          {route?.source === 'direct' && (
            <p className="mt-2 text-[11px] text-on-surface-variant flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-error shrink-0" />
              Routing service unreachable — showing a direct line estimate.
            </p>
          )}
        </div>
      </div>

      {/* Recenter control */}
      <div className="relative z-20 px-5 pt-3 max-w-lg mx-auto w-full flex justify-end pointer-events-none">
        <button
          onClick={() => {
            setFollowing((f) => !f);
            geo.refresh();
          }}
          className={`pointer-events-auto flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold shadow-md border transition-all ${
            following
              ? 'bg-secondary text-on-secondary border-transparent'
              : 'bg-surface/95 text-on-surface border-white/60'
          }`}
          aria-pressed={following}
        >
          <Crosshair className="w-4 h-4" />
          {following ? 'Following' : 'Recenter'}
        </button>
      </div>

      {/* Bottom card */}
      <div className="absolute bottom-28 left-5 right-5 z-20 max-w-lg mx-auto pointer-events-none">
        <div className="bg-surface-container/96 backdrop-blur-2xl rounded-2xl p-5 shadow-xl border border-white/60 flex flex-col gap-3 pointer-events-auto">
          {geo.status === 'denied' || geo.status === 'unavailable' || geo.status === 'error' ? (
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-error shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-on-surface">Location unavailable</h4>
                <p className="text-xs text-on-surface-variant mt-0.5">{geo.error}</p>
                <button
                  onClick={geo.refresh}
                  className="mt-2 text-xs font-bold text-secondary hover:underline"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : !order ? (
            <div className="flex items-start gap-3">
              <Package className="w-5 h-5 text-on-surface-variant shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-on-surface">No delivery in progress</h4>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Accept an order from the Orders tab and turn-by-turn guidance to the
                  customer will appear here.
                </p>
              </div>
            </div>
          ) : resolving ? (
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-secondary shrink-0 animate-spin" />
              <div>
                <h4 className="text-sm font-bold text-on-surface">Locating the address…</h4>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  No GPS pin on this order, so we're placing the written address on the map.
                </p>
              </div>
            </div>
          ) : !destination ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-error shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-on-surface">
                    This order has no location
                  </h4>
                  <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">
                    The customer placed it without sharing GPS or a delivery address. Call
                    them to get directions before setting off.
                  </p>
                </div>
              </div>
              {order.phone ? (
                <a
                  href={`tel:${order.phone}`}
                  className="w-full min-h-[48px] rounded-xl bg-secondary text-on-secondary font-bold text-xs flex items-center justify-center gap-2 shadow-md"
                >
                  <Phone className="w-4 h-4" /> Call customer
                </a>
              ) : (
                <p className="text-[11px] text-on-surface-variant bg-surface/70 rounded-xl px-3 py-2">
                  No phone number was saved either. Contact BhoomiX support to reach this
                  customer.
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="flex justify-between items-start gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-secondary shrink-0" />
                    <h4 className="text-sm font-bold text-on-surface truncate">
                      {order.title}
                    </h4>
                  </div>
                  {order.address && (
                    <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">
                      {order.address}
                    </p>
                  )}
                </div>
                <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[11px] font-bold shrink-0">
                  {formatKm(distanceKm)}
                </span>
              </div>

              <div className="flex gap-2">
                {order.phone && (
                  <a
                    href={`tel:${order.phone}`}
                    className="w-12 shrink-0 py-3 rounded-xl bg-surface border border-outline-variant/40 text-secondary flex items-center justify-center shadow-sm active:scale-95 transition-transform"
                    aria-label="Call customer"
                  >
                    <Phone className="w-4 h-4" />
                  </a>
                )}
                <a
                  href={googleMapsDirectionsUrl(destination, geo.position)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-3 rounded-xl bg-secondary text-on-secondary font-bold text-xs flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all"
                >
                  <ExternalLink className="w-4 h-4" /> Turn-by-turn in Maps
                </a>
              </div>

              {onOpenOrder && (
                <button
                  onClick={() => onOpenOrder(order)}
                  className="w-full py-2.5 rounded-xl bg-surface-container-high text-on-surface font-bold text-xs flex items-center justify-center gap-2 border border-outline-variant/30"
                >
                  <RouteIcon className="w-4 h-4 text-secondary" /> Open delivery details
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
