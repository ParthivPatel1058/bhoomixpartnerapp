import type { DeliveryOrder } from '../types';

export interface EarningsSummary {
  today: number;
  week: number;
  total: number;
  tripsToday: number;
  tripsTotal: number;
  /** Payout per weekday, Mon→Sun, for the dashboard sparkline. */
  weekSeries: number[];
  /** 7 days x 4 dayparts of trip counts, for the peak-hours heatmap. */
  heatmap: number[][];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Monday-based week start, matching how Indian delivery weeks are counted. */
function startOfWeek(d: Date): Date {
  const start = startOfDay(d);
  const dayIndex = (start.getDay() + 6) % 7; // Mon = 0
  return new Date(start.getTime() - dayIndex * DAY_MS);
}

const DAYPART_BOUNDS = [6, 12, 17, 21]; // morning / midday / evening / night

function daypartOf(hour: number): number {
  for (let i = DAYPART_BOUNDS.length - 1; i >= 0; i -= 1) {
    if (hour >= DAYPART_BOUNDS[i]) return i;
  }
  return 0;
}

/**
 * Derives earnings from delivered orders.
 *
 * `orders` has no payout column, so this sums the client-side payout estimate
 * (see `estimatePayout`). Trip counts and timings are real.
 */
export function summarizeEarnings(orders: DeliveryOrder[], now = new Date()): EarningsSummary {
  const delivered = orders.filter((o) => o.status === 'delivered');

  const dayStart = startOfDay(now).getTime();
  const weekStart = startOfWeek(now).getTime();

  const weekSeries = new Array(7).fill(0);
  const heatmap = Array.from({ length: 7 }, () => new Array(4).fill(0));

  let today = 0;
  let week = 0;
  let total = 0;
  let tripsToday = 0;

  for (const order of delivered) {
    // Bucket by when the order was DELIVERED, not when the customer placed it.
    // Using createdAt put an order placed yesterday and delivered today into
    // yesterday's total, so "Today's earnings" under-reported real work.
    const at = new Date(order.completedAt ?? order.createdAt);
    const t = at.getTime();
    if (!Number.isFinite(t)) continue;

    total += order.payout;

    if (t >= dayStart) {
      today += order.payout;
      tripsToday += 1;
    }

    if (t >= weekStart) {
      week += order.payout;
      const dayIndex = (at.getDay() + 6) % 7;
      weekSeries[dayIndex] += order.payout;
      heatmap[dayIndex][daypartOf(at.getHours())] += 1;
    }
  }

  return {
    today,
    week,
    total,
    tripsToday,
    tripsTotal: delivered.length,
    weekSeries,
    heatmap,
  };
}

/**
 * Acceptance rate over the orders this partner has touched. Returns null when
 * there is no history yet, so the UI can say "—" instead of a fake 0%.
 */
export function successRateOf(orders: DeliveryOrder[]): number | null {
  const finished = orders.filter(
    (o) => o.status === 'delivered' || o.status === 'cancelled',
  );
  if (!finished.length) return null;
  const delivered = finished.filter((o) => o.status === 'delivered').length;
  return Math.round((delivered / finished.length) * 100);
}

export const formatRupees = (value: number, fractionDigits = 0): string =>
  `₹${value.toLocaleString('en-IN', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
