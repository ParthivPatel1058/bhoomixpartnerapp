import type { LatLng } from './lib/geo';
import type { OrderItem, OrderStatus } from './lib/schema';

export type TabType = 'dashboard' | 'orders' | 'navigation' | 'wallet' | 'profile' | 'admin';

export type { OrderItem, OrderStatus };

/**
 * Coarse bucket the partner UI groups orders into. Derived from the shared
 * `orders.status` column so the customer app's timeline and this app never
 * disagree about what an order is doing.
 */
export type OrderStage = 'incoming' | 'active' | 'completed' | 'cancelled';

export interface DeliveryOrder {
  id: string;
  orderNumber: string;
  /** Human label for the order, derived from its line items. */
  title: string;
  items: OrderItem[];
  itemCount: number;
  /** What the customer paid, in rupees. */
  totalAmount: number;
  /** Estimated partner payout — see `estimatePayout`, not a DB column. */
  payout: number;

  status: OrderStatus;
  stage: OrderStage;

  /** Null until this partner accepts the order (RLS masks customer PII). */
  address: string | null;
  phone: string | null;
  destination: LatLng | null;

  assignedPartner: string | null;
  /** True when the signed-in partner owns this order and can see full details. */
  isMine: boolean;

  createdAt: string;
  /**
   * When the order last changed state. For a delivered order this is when it
   * was delivered, which is what earnings must be bucketed by — `createdAt` is
   * when the customer placed it, so an order placed yesterday and delivered
   * today would otherwise count towards yesterday.
   */
  completedAt: string | null;

  /** Live values, filled in once we have a GPS fix. Null when unknown. */
  distanceKm: number | null;
  etaMinutes: number | null;
}

export interface PartnerProfile {
  userId: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  vehicle: string;
  /** Registered in the shared `partners` table. */
  isRegistered: boolean;
  /** `partners.is_active` — false means awaiting approval; RLS blocks orders. */
  isActive: boolean;
  /** Local-only availability toggle; the schema has no online/offline column. */
  isOnline: boolean;

  /** Computed from this partner's delivered orders. */
  totalTrips: number;
  earningsToday: number;
  earningsWeek: number;
  earningsTotal: number;

  /** Average customer rating; null until someone has actually rated a delivery. */
  rating: number | null;
  ratingCount: number;
  /** Delivered / (delivered + cancelled); null with no finished orders yet. */
  successRate: number | null;
}
