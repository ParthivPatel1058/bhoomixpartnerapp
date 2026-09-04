import React, { useEffect, useRef, useState } from 'react';
import { Clock, Lock, MapPin, Package, Timer } from 'lucide-react';
import { DeliveryOrder } from '../types';
import { formatKm } from '../lib/geo';
import { formatRupees } from '../lib/earnings';
import { itemName } from '../lib/orders';
import { formatSlaRemaining, slaFor } from '../lib/sla';

interface IncomingOrderModalProps {
  order: DeliveryOrder;
  onAccept: () => void;
  onReject: () => void;
}

const TOTAL_SECONDS = 45;
const CIRCUMFERENCE = 283; // 2πr, r = 45

export const IncomingOrderModal: React.FC<IncomingOrderModalProps> = ({
  order,
  onAccept,
  onReject,
}) => {
  const [timeLeft, setTimeLeft] = useState(TOTAL_SECONDS);
  // Recomputed from the order's own age, not the response countdown.
  const deliverySla = slaFor(order, new Date());

  // The countdown effect used to depend on `onReject`, which the parent
  // recreated on every render — so the interval was torn down and restarted
  // constantly and the timer never actually ran down. Holding the callback in
  // a ref keeps the interval alive for the whole countdown.
  const onRejectRef = useRef(onReject);
  useEffect(() => {
    onRejectRef.current = onReject;
  }, [onReject]);

  useEffect(() => {
    setTimeLeft(TOTAL_SECONDS);
    const timer = window.setInterval(() => {
      // Pure updater: React may invoke this twice under StrictMode, so firing
      // onReject in here rejected the order twice. The expiry effect below
      // owns that side effect instead.
      setTimeLeft((prev) => (prev <= 0 ? 0 : prev - 1));
    }, 1000);

    return () => window.clearInterval(timer);
    // Restart only when a different order is offered.
  }, [order.id]);

  // Expiry is a side effect, so it belongs in its own effect rather than in the
  // countdown's state updater.
  useEffect(() => {
    if (timeLeft === 0) onRejectRef.current();
  }, [timeLeft]);

  const offset = CIRCUMFERENCE - (timeLeft / TOTAL_SECONDS) * CIRCUMFERENCE;
  const isLowTime = timeLeft <= 10;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-label="New delivery request"
    >
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-tertiary-fixed rounded-full mix-blend-multiply blur-[80px] opacity-40 animate-pulse pointer-events-none" />
      <div
        className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-secondary-fixed rounded-full mix-blend-multiply blur-[80px] opacity-40 animate-pulse pointer-events-none"
        style={{ animationDelay: '2s' }}
      />

      <div className="w-full max-w-sm rounded-[2.5rem] bg-surface-container/92 backdrop-blur-2xl shadow-[0_20px_50px_rgba(0,106,106,0.28)] relative overflow-hidden flex flex-col border border-white/60 animate-scaleUp max-h-[90dvh]">
        <div className="absolute inset-0 bg-gradient-to-br from-white/60 via-transparent to-transparent pointer-events-none rounded-[2.5rem]" />

        <div className="p-6 pb-4 flex flex-col items-center relative z-10 gap-4 overflow-y-auto">
          <span className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            New delivery request
          </span>

          {/* Payout + countdown */}
          <div className="relative w-32 h-32 flex items-center justify-center">
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(0,106,106,0.15)" strokeWidth="6" />
              <circle
                className="transition-all duration-1000 ease-linear"
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke={isLowTime ? '#ba1a1a' : '#006a6a'}
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={offset}
                strokeLinecap="round"
                strokeWidth="6"
              />
            </svg>
            <div className="flex flex-col items-center justify-center bg-surface/90 rounded-full w-24 h-24 shadow-inner">
              <span className="text-[10px] text-on-surface-variant">Est. payout</span>
              <span className="text-2xl font-bold text-primary">
                {formatRupees(order.payout)}
              </span>
            </div>
          </div>

          <div
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full border ${
              isLowTime
                ? 'bg-error-container text-on-error-container border-error/30'
                : 'bg-surface-container-high text-on-surface-variant border-outline-variant/30'
            }`}
          >
            <Timer className="w-4 h-4" />
            <span className="text-xs font-bold">{timeLeft}s to respond</span>
          </div>

          {/* The delivery window being committed to, distinct from the seconds
              left to answer — a partner should see both before accepting. */}
          {deliverySla && (
            <p className="text-[11px] text-on-surface-variant flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              Deliver within{' '}
              <strong className="text-on-surface">
                {formatSlaRemaining(deliverySla.minutesRemaining)}
              </strong>
            </p>
          )}

          <div className="w-full h-px bg-outline-variant/30" />

          {/* Order summary */}
          <div className="w-full flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <Package className="w-5 h-5 text-secondary shrink-0 mt-0.5" />
              <div className="flex flex-col flex-1 min-w-0">
                <span className="text-sm font-semibold text-on-surface truncate">
                  {order.title}
                </span>
                <span className="text-xs text-on-surface-variant">
                  #{order.orderNumber} · {order.itemCount}{' '}
                  {order.itemCount === 1 ? 'item' : 'items'} ·{' '}
                  {formatRupees(order.totalAmount)}
                </span>
              </div>
            </div>

            {order.items.length > 0 && (
              <ul className="bg-surface/70 rounded-xl p-3 space-y-1 max-h-24 overflow-y-auto">
                {order.items.slice(0, 5).map((item, idx) => (
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
            )}

            {/* Address stays masked until acceptance — enforced server-side. */}
            <div className="flex items-start gap-3">
              {order.address ? (
                <>
                  <MapPin className="w-5 h-5 text-tertiary shrink-0 mt-0.5" />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-xs text-on-surface-variant">Drop-off</span>
                    <span className="text-sm font-semibold text-on-surface line-clamp-2">
                      {order.address}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <Lock className="w-5 h-5 text-outline shrink-0 mt-0.5" />
                  <span className="text-xs text-on-surface-variant flex-1">
                    Customer address and phone unlock the moment you accept.
                    {order.distanceKm != null && ` About ${formatKm(order.distanceKm)} away.`}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="p-5 pt-3 flex gap-3 w-full bg-surface-container/60 relative z-10">
          <button
            onClick={onReject}
            className="flex-1 py-3 px-4 rounded-xl bg-transparent border border-outline-variant text-on-surface font-semibold text-sm hover:bg-surface-variant/40 transition-colors shadow-sm"
          >
            Skip
          </button>
          <button
            onClick={onAccept}
            className="flex-[2] py-3 px-4 rounded-xl bg-secondary text-on-secondary font-bold text-sm shadow-[0_4px_16px_rgba(0,106,106,0.3)] hover:shadow-[0_6px_20px_rgba(0,106,106,0.5)] transition-all"
          >
            Accept order
          </button>
        </div>
      </div>
    </div>
  );
};
