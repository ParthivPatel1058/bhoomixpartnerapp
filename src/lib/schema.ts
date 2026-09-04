/**
 * Domain aliases over the generated Supabase schema.
 *
 * `database.types.ts` is a verbatim copy of the BhoomiX Main app's generated
 * types — regenerate it from the same project rather than hand-editing, and
 * put any partner-specific shapes here instead.
 */
import type { Json, Tables } from './database.types';

export type { Json };

export type OrderRow = Tables<'orders'>;
export type PartnerRow = Tables<'partners'>;

/** Status values the customer app's order timeline renders. */
export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

/** A single line item inside `orders.items`, as written by the Main app cart. */
export interface OrderItem {
  product_id?: number | string;
  name?: string;
  name_hi?: string;
  nameHi?: string;
  price?: number;
  quantity?: number;
  image?: string;
}

/**
 * Shape returned by `get_partner_orders()`.
 *
 * The generated signature types every column as non-nullable, but the function
 * deliberately returns NULL for address / phone / GPS on orders the calling
 * partner has not accepted. This corrected type is what the app reads against.
 */
export interface PartnerOrderRpcRow {
  id: string;
  order_number: string;
  items: Json;
  total_amount: number;
  status: string;
  delivery_address: string | null;
  phone_number: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  created_at: string;
  /**
   * Last status change. The pending-pool RPC does not select it, so it is
   * optional; for a partner's own orders (a direct select) it is always
   * present and is the closest thing to a delivered-at timestamp.
   */
  updated_at?: string | null;
  assigned_partner: string | null;
}
