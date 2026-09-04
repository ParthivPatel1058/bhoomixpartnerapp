import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation as NavIcon,
  Package,
  Phone,
  QrCode,
  Truck,
} from 'lucide-react';
import { DeliveryOrder } from '../types';
import { MapComponent, type MapMarker } from './MapComponent';
import type { GeolocationState } from '../hooks/useGeolocation';
import { useNavigation } from '../hooks/useNavigation';
import { useNow } from '../hooks/useNow';
import { SlaChip } from './SlaChip';
import { slaFor } from '../lib/sla';
import { formatKm, formatMinutes, googleMapsDirectionsUrl } from '../lib/geo';
import { formatManeuverDistance } from '../lib/navigation';
import { itemName, STATUS_LABEL } from '../lib/orders';
import { formatRupees } from '../lib/earnings';

interface ActiveDeliveryViewProps {
  order: DeliveryOrder;
  geo: GeolocationState & { refresh: () => void };
  onVerifyQR: () => void;
  onStartDelivery: () => void;
}

export const ActiveDeliveryView: React.FC<ActiveDeliveryViewProps> = ({
  order,
  geo,
  onVerifyQR,
  onStartDelivery,
}) => {
  const now = useNow(30_000);
  const sla = slaFor(order, now);
  const [collapsed, setCollapsed] = useState(false);
  // Resolves the destination (GPS pin, else geocoded address), routes to it,
  // and keeps progress live as the partner moves.
  const nav = useNavigation(order, geo.position);
  const { destination, route, progress } = nav;

  const markers = useMemo<MapMarker[]>(() => {
    const list: MapMarker[] = [];
    if (geo.position) {
      list.push({ id: 'me', position: geo.position, kind: 'partner', heading: geo.heading });
    }
    if (destination) {
      list.push({
        id: 'dest',
        position: destination,
        kind: 'destination',
        popup: `Drop-off · #${order.orderNumber}`,
      });
    }
    return list;
  }, [geo.position, geo.heading, destination, order.orderNumber]);

  const distanceKm =
    nav.remainingM != null ? nav.remainingM / 1000 : (route?.distanceKm ?? order.distanceKm);
  const etaMinutes = nav.etaMinutes ?? order.etaMinutes;
  const isDelivered = order.status === 'delivered';

  return (
    <div className="relative flex flex-col w-full h-[calc(100dvh-4rem)] overflow-hidden bg-background">
      {/* Map */}
      <div className="absolute inset-0 z-0">
        <MapComponent
          center={geo.position ?? destination ?? undefined}
          zoom={15}
          markers={markers}
          route={route?.coordinates ?? null}
          fitRoute
          followCenter={false}
          className="w-full h-full"
        />
      </div>

      {/* Navigation HUD */}
      <div className="relative z-20 px-5 pt-4 w-full max-w-lg mx-auto pointer-events-none">
        <div className="bg-surface/92 backdrop-blur-2xl rounded-3xl p-4 shadow-[0_4px_24px_rgba(0,124,124,0.15)] border border-white/60 pointer-events-auto">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
                ETA
              </span>
              <span className="text-2xl font-bold text-primary">
                {formatMinutes(etaMinutes)}
              </span>
              <span className="text-xs text-on-surface-variant">
                {distanceKm != null ? `${formatKm(distanceKm)} remaining` : 'Distance unknown'}
              </span>
            </div>
            <div className="w-14 h-14 shrink-0 rounded-full bg-secondary-container flex items-center justify-center shadow-[inset_0_2px_10px_rgba(255,255,255,0.6)]">
              <NavIcon className="w-7 h-7 text-on-secondary-container" />
            </div>
          </div>

          {/* Distance covered along the road. */}
          {progress && (
            <div className="mt-3 h-1.5 w-full rounded-full bg-surface-variant overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-secondary to-tertiary transition-[width] duration-700"
                style={{ width: `${Math.round(progress.fraction * 100)}%` }}
              />
            </div>
          )}

          {nav.arrived ? (
            <div className="bg-secondary text-on-secondary rounded-2xl p-3 mt-3 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <p className="text-sm font-bold">You've arrived — hand the order over.</p>
            </div>
          ) : (
            progress?.currentStep && (
              <div className="bg-surface-container-high rounded-2xl p-3 mt-3">
                <p className="text-sm text-on-surface font-semibold flex items-start gap-2">
                  <NavIcon className="w-4 h-4 text-tertiary shrink-0 mt-0.5" />
                  <span>
                    {progress.currentStep.instruction}
                    <span className="font-normal text-on-surface-variant">
                      {' '}
                      {formatManeuverDistance(progress.distanceToStepM)}
                    </span>
                  </span>
                </p>
              </div>
            )
          )}

          {nav.rerouting && (
            <p className="mt-2 text-[11px] text-on-surface-variant flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              You left the route — recalculating.
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 pointer-events-none" />

      {/* Bottom sheet */}
      <div
        className={`relative z-30 w-full bg-surface-container-low/97 backdrop-blur-2xl rounded-t-[32px] shadow-[0_-8px_32px_rgba(0,32,32,0.15)] border-t border-white/60 mt-auto transition-transform duration-300 ease-out pointer-events-auto ${
          // Was translate-y-[60%], which slid the action buttons off-screen
          // entirely and left no way to complete a delivery.
          collapsed ? 'translate-y-[calc(100%-11rem)]' : 'translate-y-0'
        }`}
      >
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-full flex flex-col items-center pt-3 pb-1 gap-1"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand order details' : 'Collapse order details'}
        >
          <div className="w-12 h-1.5 rounded-full bg-outline-variant/60" />
          <ChevronDown
            className={`w-4 h-4 text-outline transition-transform ${collapsed ? 'rotate-180' : ''}`}
          />
        </button>

        <div className="px-5 pb-8 space-y-4 max-h-[65dvh] overflow-y-auto">
          {/*
            Early warning, not just a post-mortem: flagging the deadline while
            there is still time to act is what keeps a late run from becoming a
            breach. Only shown once the order is genuinely at risk.
          */}
          {sla && sla.state !== 'on_time' && !isDelivered && (
            <div
              className={`rounded-2xl px-4 py-3 flex items-start gap-2.5 ${
                sla.state === 'breached'
                  ? 'bg-error-container text-on-error-container'
                  : 'bg-[#fff2d6] text-[#7a4b00]'
              }`}
            >
              <AlertTriangle className="w-5 h-5 shrink-0 mt-px" />
              <div className="min-w-0">
                <p className="text-sm font-bold">
                  {sla.state === 'breached'
                    ? 'Delivery window missed'
                    : 'Running close to the deadline'}
                </p>
                <p className="text-xs mt-0.5 leading-relaxed">
                  {sla.state === 'breached'
                    ? 'This order is past its 1h 20m window. Deliver it now and call the customer to let them know.'
                    : `About ${Math.max(0, Math.round(sla.minutesRemaining))} minutes left. Call the customer if you are held up.`}
                </p>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="px-2.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[10px] font-bold uppercase tracking-wider">
                  {STATUS_LABEL[order.status]}
                </span>
                <span className="text-xs font-semibold text-outline">#{order.orderNumber}</span>
                <SlaChip order={order} now={now} />
              </div>
              <h2 className="text-xl font-bold text-on-surface truncate">{order.title}</h2>
            </div>

            <div className="flex gap-2 shrink-0">
              {order.phone && (
                <a
                  href={`tel:${order.phone}`}
                  className="w-11 h-11 rounded-full bg-surface border border-outline-variant/30 flex items-center justify-center text-secondary shadow-sm active:scale-95 transition-transform"
                  aria-label="Call customer"
                >
                  <Phone className="w-5 h-5" />
                </a>
              )}
              {destination && (
                <a
                  href={googleMapsDirectionsUrl(destination, geo.position)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-11 h-11 rounded-full bg-surface border border-outline-variant/30 flex items-center justify-center text-secondary shadow-sm active:scale-95 transition-transform"
                  aria-label="Open in Google Maps"
                >
                  <ExternalLink className="w-5 h-5" />
                </a>
              )}
            </div>
          </div>

          {/* Payout */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface/80 rounded-2xl p-3 border border-white/50">
              <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                Your payout
              </span>
              <p className="text-lg font-bold text-secondary">{formatRupees(order.payout)}</p>
            </div>
            <div className="bg-surface/80 rounded-2xl p-3 border border-white/50">
              <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                Order value
              </span>
              <p className="text-lg font-bold text-on-surface">
                {formatRupees(order.totalAmount)}
              </p>
            </div>
          </div>

          {/* Drop-off */}
          <div className="bg-surface/80 rounded-2xl p-4 flex items-start gap-3 border border-white/50 shadow-sm">
            <MapPin className="w-5 h-5 text-tertiary shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-on-surface">Drop-off</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">
                {order.address ?? 'The customer did not save an address on this order.'}
              </p>
              {order.phone && (
                <a
                  href={`tel:${order.phone}`}
                  className="text-xs font-semibold text-secondary mt-1 inline-block hover:underline"
                >
                  {order.phone}
                </a>
              )}
            </div>
          </div>

          {/* Items */}
          {order.items.length > 0 && (
            <div className="bg-surface/80 rounded-2xl p-4 border border-white/50">
              <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-2">
                <Package className="w-4 h-4 text-secondary" /> Items to deliver
              </h3>
              <ul className="space-y-1.5">
                {order.items.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex justify-between gap-3 text-xs text-on-surface-variant"
                  >
                    <span className="truncate">{itemName(item)}</span>
                    <span className="font-bold text-on-surface shrink-0">
                      ×{item.quantity ?? 1}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          {!isDelivered && (
            <div className="flex flex-col gap-2 pt-1">
              {order.status === 'accepted' && (
                <button
                  onClick={onStartDelivery}
                  className="w-full py-4 rounded-full bg-primary text-on-primary font-bold text-sm flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition-transform"
                >
                  <Truck className="w-5 h-5" />
                  Picked up — start delivery
                </button>
              )}

              <button
                onClick={onVerifyQR}
                className="w-full py-4 rounded-full bg-secondary text-on-secondary font-bold text-sm flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(0,106,106,0.3)] active:scale-[0.98] transition-transform"
              >
                <QrCode className="w-5 h-5" />
                Verify delivery & complete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
