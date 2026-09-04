import React from 'react';
import { AlertTriangle, Clock, Timer } from 'lucide-react';
import type { DeliveryOrder } from '../types';
import { slaFor, formatSlaRemaining, SLA_STYLES } from '../lib/sla';

interface SlaChipProps {
  order: DeliveryOrder;
  /** Ticking clock so the countdown advances without a refetch. */
  now: Date;
  /** Adds a thin progress bar showing how much of the window is used. */
  showBar?: boolean;
  className?: string;
}

/**
 * Live delivery-deadline countdown.
 *
 * Terminal orders are not shown a countdown — a delivered order has no deadline
 * left to run, and a cancelled one never will.
 */
export const SlaChip: React.FC<SlaChipProps> = ({ order, now, showBar = false, className = '' }) => {
  if (order.stage === 'completed' || order.stage === 'cancelled') return null;

  const sla = slaFor(order, now);
  if (!sla) return null;

  const styles = SLA_STYLES[sla.state];
  const Icon = sla.state === 'breached' ? AlertTriangle : sla.state === 'at_risk' ? Timer : Clock;

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${styles.chip}`}
        title={`Deliver by ${sla.deadline.toLocaleTimeString('en-IN', {
          hour: 'numeric',
          minute: '2-digit',
        })}`}
      >
        <Icon className="w-3 h-3 shrink-0" />
        {formatSlaRemaining(sla.minutesRemaining)}
      </span>

      {showBar && (
        <div className="h-1 w-full rounded-full bg-surface-variant overflow-hidden">
          <div
            className={`h-full rounded-full transition-[width] duration-1000 ${styles.bar}`}
            style={{ width: `${Math.round(sla.fraction * 100)}%` }}
          />
        </div>
      )}
    </div>
  );
};
