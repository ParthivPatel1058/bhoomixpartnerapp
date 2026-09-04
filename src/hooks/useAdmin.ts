import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

/**
 * Admin console data.
 *
 * Access is decided by the database, not here — every RPC re-checks the admin
 * role server-side. `isAdmin` only governs whether the tab is worth rendering;
 * hiding a button is not a security boundary.
 */

export interface AdminStats {
  totalUsers: number;
  totalPartners: number;
  activePartners: number;
  totalOrders: number;
  pendingOrders: number;
  activeOrders: number;
  deliveredOrders: number;
  cancelledOrders: number;
  ordersToday: number;
  revenueTotal: number;
  revenueToday: number;
}

export interface AdminUser {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  roles: string[];
  isPartner: boolean;
  orderCount: number;
  createdAt: string;
  lastSignIn: string | null;
}

export interface AdminPartner {
  id: string;
  fullName: string | null;
  phoneNumber: string | null;
  vehicleType: string | null;
  isActive: boolean;
  email: string | null;
  deliveredCount: number;
  activeCount: number;
  createdAt: string;
}

export interface AdminOrder {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  itemCount: number;
  customerEmail: string | null;
  partnerName: string | null;
  deliveryAddress: string | null;
  phoneNumber: string | null;
  minutesElapsed: number;
  createdAt: string;
  updatedAt: string | null;
}

export type AdminTable = 'users' | 'partners' | 'orders';

/** Migration not applied yet. */
const MISSING_FN = /could not find the function|does not exist|PGRST202/i;
/** Signed in, but not an admin — expected, not an error worth showing. */
const FORBIDDEN = /admin access required|insufficient_privilege|not signed in/i;

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
};

export function useAdmin() {
  const { user } = useAuth();

  const [isAdmin, setIsAdmin] = useState(false);
  const [checking, setChecking] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [partners, setPartners] = useState<AdminPartner[]>([]);
  const [orders, setOrders] = useState<AdminOrder[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Establish admin status once per session.
  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setIsAdmin(false);
      setChecking(false);
      return;
    }

    setChecking(true);
    supabase
      .rpc('is_admin')
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          if (MISSING_FN.test(`${err.message} ${err.code ?? ''}`)) setUnavailable(true);
          setIsAdmin(false);
        } else {
          setIsAdmin(Boolean(data));
        }
      })
      .then(() => {
        if (!cancelled) setChecking(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const load = useCallback(
    async (table: AdminTable, search = '', status = '') => {
      if (!isAdmin) return;

      setLoading(true);
      setError(null);
      try {
        if (table === 'users') {
          const { data, error: err } = await supabase.rpc('admin_list_users', {
            _search: search || null,
            _limit: 200,
          });
          if (err) throw err;
          setUsers(
            ((data ?? []) as never[]).map((r: Record<string, unknown>) => ({
              id: String(r.id),
              email: (r.email as string) ?? null,
              displayName: (r.display_name as string) ?? null,
              avatarUrl: (r.avatar_url as string) ?? null,
              roles: (r.roles as string[]) ?? [],
              isPartner: Boolean(r.is_partner),
              orderCount: num(r.order_count),
              createdAt: String(r.created_at),
              lastSignIn: (r.last_sign_in as string) ?? null,
            })),
          );
        } else if (table === 'partners') {
          const { data, error: err } = await supabase.rpc('admin_list_partners', {
            _search: search || null,
            _limit: 200,
          });
          if (err) throw err;
          setPartners(
            ((data ?? []) as never[]).map((r: Record<string, unknown>) => ({
              id: String(r.id),
              fullName: (r.full_name as string) ?? null,
              phoneNumber: (r.phone_number as string) ?? null,
              vehicleType: (r.vehicle_type as string) ?? null,
              isActive: Boolean(r.is_active),
              email: (r.email as string) ?? null,
              deliveredCount: num(r.delivered_count),
              activeCount: num(r.active_count),
              createdAt: String(r.created_at),
            })),
          );
        } else {
          const { data, error: err } = await supabase.rpc('admin_list_orders', {
            _search: search || null,
            _status: status || null,
            _limit: 200,
          });
          if (err) throw err;
          setOrders(
            ((data ?? []) as never[]).map((r: Record<string, unknown>) => ({
              id: String(r.id),
              orderNumber: String(r.order_number),
              status: String(r.status),
              totalAmount: num(r.total_amount),
              itemCount: num(r.item_count),
              customerEmail: (r.customer_email as string) ?? null,
              partnerName: (r.partner_name as string) ?? null,
              deliveryAddress: (r.delivery_address as string) ?? null,
              phoneNumber: (r.phone_number as string) ?? null,
              minutesElapsed: num(r.minutes_elapsed),
              createdAt: String(r.created_at),
              updatedAt: (r.updated_at as string) ?? null,
            })),
          );
        }
      } catch (e) {
        const msg = (e as { message?: string })?.message ?? 'Could not load admin data.';
        setError(FORBIDDEN.test(msg) ? 'Admin access required.' : msg);
      } finally {
        setLoading(false);
      }
    },
    [isAdmin],
  );

  const loadStats = useCallback(async () => {
    if (!isAdmin) return;
    const { data, error: err } = await supabase.rpc('admin_stats');
    if (err) return;

    const r = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
    if (!r) return;

    setStats({
      totalUsers: num(r.total_users),
      totalPartners: num(r.total_partners),
      activePartners: num(r.active_partners),
      totalOrders: num(r.total_orders),
      pendingOrders: num(r.pending_orders),
      activeOrders: num(r.active_orders),
      deliveredOrders: num(r.delivered_orders),
      cancelledOrders: num(r.cancelled_orders),
      ordersToday: num(r.orders_today),
      revenueTotal: num(r.revenue_total),
      revenueToday: num(r.revenue_today),
    });
  }, [isAdmin]);

  return {
    isAdmin,
    checking,
    unavailable,
    stats,
    users,
    partners,
    orders,
    loading,
    error,
    load,
    loadStats,
  };
}
