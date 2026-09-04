import React, { useCallback, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CameraOff,
  Check,
  CheckCircle2,
  Flashlight,
  Keyboard,
  Loader2,
  X,
} from 'lucide-react';
import { DeliveryOrder } from '../types';
import { useQrScanner } from '../hooks/useQrScanner';
import { formatRupees } from '../lib/earnings';

interface QrVerifyModalProps {
  order: DeliveryOrder;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * A scanned code counts as valid if it carries this order's number or id.
 * Accepts a bare string, a URL with ?order=, or a JSON payload — whichever the
 * customer app ends up printing on the handover screen.
 */
function matchesOrder(scanned: string, order: DeliveryOrder): boolean {
  const raw = scanned.trim();
  if (!raw) return false;

  const needles = [order.orderNumber.toLowerCase(), order.id.toLowerCase()];
  const haystacks = [raw.toLowerCase()];

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const key of ['order_number', 'orderNumber', 'id', 'order_id']) {
      const v = parsed?.[key];
      if (typeof v === 'string') haystacks.push(v.toLowerCase());
    }
  } catch {
    /* not JSON — fine */
  }

  try {
    const url = new URL(raw);
    for (const key of ['order', 'order_number', 'id']) {
      const v = url.searchParams.get(key);
      if (v) haystacks.push(v.toLowerCase());
    }
  } catch {
    /* not a URL — fine */
  }

  return needles.some((n) => haystacks.some((h) => h === n || h.includes(n)));
}

export const QrVerifyModal: React.FC<QrVerifyModalProps> = ({ order, onClose, onSuccess }) => {
  const [manualMode, setManualMode] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [matched, setMatched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [mismatch, setMismatch] = useState<string | null>(null);

  const complete = useCallback(async () => {
    setMatched(true);
    setSubmitting(true);
    await onSuccess();
  }, [onSuccess]);

  const handleDetect = useCallback(
    (value: string) => {
      if (matched || submitting) return;
      if (matchesOrder(value, order)) {
        void complete();
      } else {
        setMismatch(`Scanned a code for a different order (${value.slice(0, 24)}…)`);
      }
    },
    [matched, submitting, order, complete],
  );

  const scanner = useQrScanner({
    enabled: !manualMode && !matched,
    onDetect: handleDetect,
  });

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (matchesOrder(manualValue, order)) {
      setMismatch(null);
      void complete();
    } else {
      setMismatch('That order number does not match this delivery.');
    }
  };

  const cameraBlocked =
    scanner.status === 'denied' ||
    scanner.status === 'unsupported' ||
    scanner.status === 'error';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-md animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-label="Verify delivery"
    >
      <div className="w-full sm:max-w-sm max-h-[94dvh] overflow-y-auto rounded-t-[28px] sm:rounded-[28px] bg-surface-container shadow-xl border border-white/60 relative flex flex-col pb-safe sm:pb-0">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-surface-container/95 backdrop-blur-xl px-5 pt-5 pb-3 flex items-start justify-between gap-3 border-b border-outline-variant/30">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-on-surface">Verify delivery</h3>
            <p className="text-xs text-on-surface-variant mt-0.5 truncate">
              #{order.orderNumber} · {formatRupees(order.totalAmount)}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="w-10 h-10 shrink-0 rounded-full bg-surface-variant/60 flex items-center justify-center text-on-surface hover:bg-surface-variant disabled:opacity-40"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 flex flex-col gap-4">
          {matched ? (
            <div className="flex flex-col items-center gap-3 py-10">
              {submitting ? (
                <Loader2 className="w-12 h-12 text-secondary animate-spin" />
              ) : (
                <CheckCircle2 className="w-14 h-14 text-secondary" />
              )}
              <span className="text-base font-bold text-secondary">
                {submitting ? 'Marking as delivered…' : 'Delivery confirmed'}
              </span>
              <p className="text-xs text-on-surface-variant text-center">
                {formatRupees(order.payout)} added to your earnings.
              </p>
            </div>
          ) : manualMode || cameraBlocked ? (
            <>
              {cameraBlocked && !manualMode && (
                <div className="rounded-xl bg-error-container/70 px-3 py-2.5 flex items-start gap-2">
                  <CameraOff className="w-4 h-4 shrink-0 mt-px text-on-error-container" />
                  <p className="text-[11px] leading-relaxed text-on-error-container">
                    {scanner.error}
                  </p>
                </div>
              )}

              <form onSubmit={submitManual} className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-on-surface-variant">
                    Order number from the customer
                  </span>
                  <input
                    type="text"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    value={manualValue}
                    onChange={(e) => {
                      setManualValue(e.target.value);
                      setMismatch(null);
                    }}
                    placeholder={order.orderNumber}
                    className="w-full min-h-[52px] bg-surface px-4 rounded-xl border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface"
                  />
                </label>

                {mismatch && (
                  <p className="text-xs text-on-error-container bg-error-container rounded-xl px-3 py-2.5 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                    {mismatch}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={!manualValue.trim()}
                  className="w-full min-h-[52px] rounded-xl bg-secondary text-on-secondary font-bold text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" /> Confirm handover
                </button>
              </form>

              {!cameraBlocked && (
                <button
                  onClick={() => {
                    setManualMode(false);
                    setMismatch(null);
                  }}
                  className="min-h-[44px] text-xs font-bold text-secondary flex items-center justify-center gap-1.5"
                >
                  <Camera className="w-4 h-4" /> Scan the QR instead
                </button>
              )}
            </>
          ) : (
            <>
              {/* Live camera */}
              <div className="relative aspect-square w-full rounded-2xl overflow-hidden bg-black shadow-inner">
                <video
                  ref={scanner.videoRef}
                  className="absolute inset-0 w-full h-full object-cover"
                  playsInline
                  muted
                />

                {/* Reticle */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className="relative w-3/5 h-3/5">
                    {(
                      [
                        'top-0 left-0 border-t-4 border-l-4 rounded-tl-xl',
                        'top-0 right-0 border-t-4 border-r-4 rounded-tr-xl',
                        'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-xl',
                        'bottom-0 right-0 border-b-4 border-r-4 rounded-br-xl',
                      ] as const
                    ).map((cls) => (
                      <span key={cls} className={`absolute w-8 h-8 border-secondary ${cls}`} />
                    ))}
                  </div>
                </div>

                {scanner.status === 'starting' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60">
                    <Loader2 className="w-7 h-7 text-white animate-spin" />
                    <span className="text-xs text-white/90">Starting camera…</span>
                  </div>
                )}

                {scanner.torchAvailable && (
                  <button
                    onClick={scanner.toggleTorch}
                    className={`absolute bottom-3 right-3 w-12 h-12 rounded-full flex items-center justify-center shadow-lg ${
                      scanner.torchOn ? 'bg-secondary text-on-secondary' : 'bg-black/60 text-white'
                    }`}
                    aria-label="Toggle torch"
                    aria-pressed={scanner.torchOn}
                  >
                    <Flashlight className="w-5 h-5" />
                  </button>
                )}
              </div>

              <p className="text-xs text-on-surface-variant text-center leading-relaxed">
                Point the camera at the customer's delivery QR code.
              </p>

              {mismatch && (
                <p className="text-xs text-on-error-container bg-error-container rounded-xl px-3 py-2.5 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                  {mismatch}
                </p>
              )}

              <button
                onClick={() => {
                  setManualMode(true);
                  setMismatch(null);
                }}
                className="w-full min-h-[48px] rounded-xl bg-surface-container-high text-on-surface font-bold text-xs border border-outline-variant/30 flex items-center justify-center gap-2"
              >
                <Keyboard className="w-4 h-4 text-secondary" /> Enter order number instead
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
