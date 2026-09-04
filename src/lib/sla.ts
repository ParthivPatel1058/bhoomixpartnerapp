import type { DeliveryOrder } from '../types';

/**
 * Delivery SLA: how long an order has before it is considered failed.
 *
 * Modelled on how quick-commerce dispatch actually works. Rather than a single
 * hard cutoff, orders move through tiers so the partner is warned while the
 * delivery can still be rescued — in the industry that early warning saves the
 * large majority of at-risk deliveries. Only past the deadline is the order
 * treated as breached.
 *
 * Everything here is derived from `created_at`, so the tiers work with or
 * without the server-side enforcement migration applied.
 */

/** Total time allowed from order placement to delivery: 1h20m. */
export const SLA_MINUTES = 80;

/** Past this, the delivery is flagged as at risk of breaching. */
export const AT_RISK_MINUTES = 60;

/**
 * An unclaimed order with less than this left is not worth offering — a partner
 * accepting it would breach almost immediately, taking the hit for a delay that
 * happened before they were involved.
 */
export const MIN_ACCEPT_HEADROOM_MINUTES = 15;

export type SlaState = 'on_time' | 'at_risk' | 'breached';

export interface SlaInfo {
  minutesElapsed: number;
  /** Negative once the deadline has passed. */
  minutesRemaining: number;
  state: SlaState;
  /** True once past the deadline — the order is expired. */
  expired: boolean;
  /** 0–1 share of the SLA window consumed, clamped. */
  fraction: number;
  deadline: Date;
}

const MS_PER_MIN = 60_000;

/** SLA position for an order, measured from when the customer placed it. */
export function slaFor(order: DeliveryOrder, now: Date = new Date()): SlaInfo | null {
  const placed = new Date(order.createdAt).getTime();
  if (!Number.isFinite(placed)) return null;

  const elapsed = (now.getTime() - placed) / MS_PER_MIN;
  const remaining = SLA_MINUTES - elapsed;

  const state: SlaState =
    remaining <= 0 ? 'breached' : elapsed >= AT_RISK_MINUTES ? 'at_risk' : 'on_time';

  return {
    minutesElapsed: elapsed,
    minutesRemaining: remaining,
    state,
    expired: remaining <= 0,
    fraction: Math.max(0, Math.min(1, elapsed / SLA_MINUTES)),
    deadline: new Date(placed + SLA_MINUTES * MS_PER_MIN),
  };
}

/**
 * Whether an unclaimed order should still be offered.
 *
 * Delivered and cancelled orders keep their history regardless; this only
 * governs what a partner is invited to take on.
 */
export function isAcceptable(order: DeliveryOrder, now: Date = new Date()): boolean {
  const sla = slaFor(order, now);
  if (!sla) return true; // unparseable timestamp — do not hide the order
  return sla.minutesRemaining >= MIN_ACCEPT_HEADROOM_MINUTES;
}

/** "1h 12m left" / "8m left" / "12m overdue" */
export function formatSlaRemaining(minutesRemaining: number): string {
  const abs = Math.abs(Math.round(minutesRemaining));
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  const label = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  return minutesRemaining <= 0 ? `${label} overdue` : `${label} left`;
}

/** Tailwind classes per tier, so the urgency reads the same everywhere. */
export const SLA_STYLES: Record<SlaState, { chip: string; bar: string; label: string }> = {
  on_time: {
    chip: 'bg-secondary-container text-on-secondary-container',
    bar: 'bg-secondary',
    label: 'On time',
  },
  at_risk: {
    chip: 'bg-[#fff2d6] text-[#7a4b00]',
    bar: 'bg-[#d98a00]',
    label: 'Running late',
  },
  breached: {
    chip: 'bg-error-container text-on-error-container',
    bar: 'bg-error',
    label: 'Expired',
  },
};
