import type { Json, OrderItem, OrderStatus, PartnerOrderRpcRow } from './schema';
import type { DeliveryOrder, OrderStage } from '../types';
import { etaMinutesFromKm, haversineKm, toLatLng, type LatLng } from './geo';

/**
 * Partner payout model.
 *
 * The shared schema has no payout column — the customer app only stores what
 * the customer paid. These constants are the Partner app's client-side
 * estimate so the earnings UI shows something coherent; move them server-side
 * before real money depends on them.
 */
const PAYOUT_BASE = 30;
const PAYOUT_PER_KM = 7;
const PAYOUT_ORDER_SHARE = 0.05;
const PAYOUT_MIN = 35;
/** Assumed trip length when GPS is missing, so pending cards still show a fee. */
const ASSUMED_KM = 3;

export function estimatePayout(totalAmount: number, distanceKm: number | null): number {
  const km = distanceKm != null && Number.isFinite(distanceKm) ? distanceKm : ASSUMED_KM;
  const raw = PAYOUT_BASE + km * PAYOUT_PER_KM + (totalAmount || 0) * PAYOUT_ORDER_SHARE;
  return Math.max(PAYOUT_MIN, Math.round(raw));
}

const KNOWN_STATUSES: OrderStatus[] = [
  'pending',
  'accepted',
  'out_for_delivery',
  'delivered',
  'cancelled',
];

/**
 * Normalises the free-text `orders.status` column.
 *
 * `in_transit` is accepted for backwards compatibility: the original
 * `get_partner_orders` filter was written against that value while the
 * customer app's timeline uses `out_for_delivery`. We read both and only ever
 * *write* `out_for_delivery`, so both apps stay in agreement going forward.
 */
export function normalizeStatus(raw: string | null | undefined): OrderStatus {
  const value = (raw ?? '').toLowerCase().trim();
  if (value === 'in_transit' || value === 'in transit') return 'out_for_delivery';
  return (KNOWN_STATUSES as string[]).includes(value) ? (value as OrderStatus) : 'pending';
}

export function stageOf(status: OrderStatus): OrderStage {
  switch (status) {
    case 'pending':
      return 'incoming';
    case 'accepted':
    case 'out_for_delivery':
      return 'active';
    case 'delivered':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
  }
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: 'New request',
  accepted: 'Accepted',
  out_for_delivery: 'On the way',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

/** `orders.items` is jsonb — defend against anything that isn't the expected array. */
export function parseItems(raw: Json | null | undefined): OrderItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry) => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry),
  ) as OrderItem[];
}

export function itemName(item: OrderItem): string {
  return item.name ?? item.name_hi ?? item.nameHi ?? 'Item';
}

export function itemCountOf(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
}

/** "Tomatoes +2 more" — a compact, meaningful card title. */
export function titleFor(items: OrderItem[], orderNumber: string): string {
  if (!items.length) return `Order ${orderNumber}`;
  const first = itemName(items[0]);
  const rest = items.length - 1;
  return rest > 0 ? `${first} +${rest} more` : first;
}

export interface MapOrderContext {
  /** Signed-in partner's auth user id. */
  partnerId: string | null;
  /** Latest GPS fix, used to compute live distance and ETA. */
  origin?: LatLng | null;
}

/**
 * Converts a row from either `get_partner_orders()` or a direct `orders`
 * select into the shape the UI renders.
 */
export function toDeliveryOrder(
  row: PartnerOrderRpcRow,
  { partnerId, origin }: MapOrderContext,
): DeliveryOrder {
  const status = normalizeStatus(row.status);
  const items = parseItems(row.items);
  const destination = toLatLng(row.gps_lat, row.gps_lng);
  const isMine = Boolean(partnerId && row.assigned_partner === partnerId);

  const distanceKm = origin && destination ? haversineKm(origin, destination) : null;
  const etaMinutes = distanceKm != null ? etaMinutesFromKm(distanceKm) : null;

  return {
    id: row.id,
    orderNumber: row.order_number,
    title: titleFor(items, row.order_number),
    items,
    itemCount: itemCountOf(items),
    totalAmount: Number(row.total_amount) || 0,
    payout: estimatePayout(Number(row.total_amount) || 0, distanceKm),

    status,
    stage: stageOf(status),

    address: row.delivery_address,
    phone: row.phone_number,
    destination,

    assignedPartner: row.assigned_partner,
    isMine,

    createdAt: row.created_at,
    // Falls back to created_at when the row came from the pending-pool RPC,
    // which does not select updated_at — those are never delivered anyway.
    completedAt: row.updated_at ?? null,

    distanceKm,
    etaMinutes,
  };
}

/** Newest first, but anything in flight outranks history. */
export function sortForPartner(a: DeliveryOrder, b: DeliveryOrder): number {
  const rank = (o: DeliveryOrder) =>
    o.stage === 'active' ? 0 : o.stage === 'incoming' ? 1 : 2;
  const byRank = rank(a) - rank(b);
  if (byRank !== 0) return byRank;
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

export function isTerminal(status: OrderStatus): boolean {
  return status === 'delivered' || status === 'cancelled';
}
