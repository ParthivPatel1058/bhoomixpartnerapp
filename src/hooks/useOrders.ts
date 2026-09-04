import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isAcceptable, slaFor } from '../lib/sla';
import { useNow } from './useNow';
import type { OrderRow, OrderStatus, PartnerOrderRpcRow } from '../lib/schema';
import type { DeliveryOrder } from '../types';
import { sortForPartner, toDeliveryOrder } from '../lib/orders';
import type { LatLng } from '../lib/geo';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

/**
 * Realtime only delivers rows the subscriber can SELECT, and the partner SELECT
 * policy is limited to `assigned_partner = auth.uid()`. New *pending* orders
 * therefore never arrive as realtime events — they have to be polled.
 */
const AVAILABLE_POLL_MS = 15000;

interface ActionResult {
  error: string | null;
}

interface UseOrdersResult {
  /** Unclaimed pending orders, customer PII masked by the RPC. */
  available: DeliveryOrder[];
  /** Every order assigned to this partner, including delivered history. */
  mine: DeliveryOrder[];
  /** The one order currently being delivered, if any. */
  activeOrder: DeliveryOrder | null;
  loading: boolean;
  error: string | null;
  /** The RPC rejected us — no `partners` row, or `is_active = false`. */
  notAPartner: boolean;
  refresh: () => Promise<void>;
  acceptOrder: (orderId: string) => Promise<ActionResult>;
  startDelivery: (orderId: string) => Promise<ActionResult>;
  completeDelivery: (orderId: string) => Promise<ActionResult>;
}

/** `orders` rows and RPC rows overlap enough to render from one mapper. */
function rowToRpcShape(row: OrderRow): PartnerOrderRpcRow {
  return {
    id: row.id,
    order_number: row.order_number,
    items: row.items,
    total_amount: row.total_amount,
    status: row.status,
    delivery_address: row.delivery_address,
    phone_number: row.phone_number,
    gps_lat: row.gps_lat,
    gps_lng: row.gps_lng,
    created_at: row.created_at,
    assigned_partner: row.assigned_partner,
  };
}

const NOT_A_PARTNER = /not a registered partner|access denied/i;

export function useOrders(origin: LatLng | null): UseOrdersResult {
  const { user } = useAuth();
  const partnerId = user?.id ?? null;

  const [availableRows, setAvailableRows] = useState<PartnerOrderRpcRow[]>([]);
  const [mineRows, setMineRows] = useState<PartnerOrderRpcRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notAPartner, setNotAPartner] = useState(false);

  // Drives SLA countdowns and ages stale orders out of the pool between fetches.
  const now = useNow(30_000);

  // Guards against a slow in-flight fetch clobbering fresher state after the
  // partner signs out or a newer fetch has already landed.
  const requestSeq = useRef(0);
  // Order ids with a claim currently in flight, so a second tap cannot race
  // the first and then report our own claim as someone else's.
  const acceptingRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!partnerId || !isSupabaseConfigured) {
      setAvailableRows([]);
      setMineRows([]);
      return;
    }

    const seq = ++requestSeq.current;

    const [availableRes, mineRes] = await Promise.all([
      // Pending pool: must go through the RPC. A direct select cannot see
      // unassigned orders at all under the current policies.
      supabase.rpc('get_partner_orders'),
      // Own orders: direct select, which (unlike the RPC) is not capped to
      // pending/accepted/in_transit and so includes delivered history.
      supabase
        .from('orders')
        .select('*')
        .eq('assigned_partner', partnerId)
        .order('created_at', { ascending: false }),
    ]);

    if (seq !== requestSeq.current) return;

    if (availableRes.error) {
      const message = availableRes.error.message ?? 'Could not load available orders.';
      if (NOT_A_PARTNER.test(message)) {
        setNotAPartner(true);
        setAvailableRows([]);
      } else {
        setError(message);
      }
    } else {
      setNotAPartner(false);
      setError(null);
      const rows = (availableRes.data ?? []) as PartnerOrderRpcRow[];
      // Keep only the genuinely unclaimed ones; anything assigned to us comes
      // from the direct select with full, unmasked customer details.
      setAvailableRows(rows.filter((r) => !r.assigned_partner && r.status === 'pending'));
    }

    if (mineRes.error) {
      setError((prev) => prev ?? mineRes.error!.message);
    } else {
      setMineRows(((mineRes.data ?? []) as OrderRow[]).map(rowToRpcShape));
    }
  }, [partnerId]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await load();
    } finally {
      setLoading(false);
    }
  }, [load]);

  // Initial load + realtime for own orders + polling for the pending pool.
  useEffect(() => {
    if (!partnerId || !isSupabaseConfigured) {
      setAvailableRows([]);
      setMineRows([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    load().finally(() => {
      if (!cancelled) setLoading(false);
    });

    const channel = supabase
      .channel(`partner-orders-${partnerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        void load();
      })
      .subscribe();

    const poll = window.setInterval(() => {
      // Skip work while the tab is hidden; the visibilitychange handler below
      // refreshes on the way back.
      if (document.visibilityState === 'visible') void load();
    }, AVAILABLE_POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [partnerId, load]);

  // Distance/ETA depend on the live GPS fix, so mapping is memoised separately
  // from fetching — a GPS tick re-derives values without re-querying Supabase.
  //
  // Stale orders are dropped from the pool here: an order already past (or
  // nearly past) its delivery deadline would breach the moment it was accepted,
  // penalising a partner for a delay that predates them. `now` ticks so an
  // order ages out of the list on its own, without waiting for a refetch.
  const available = useMemo(
    () =>
      availableRows
        .map((row) => toDeliveryOrder(row, { partnerId, origin }))
        .filter((order) => isAcceptable(order, now))
        .sort(sortForPartner),
    [availableRows, partnerId, origin, now],
  );

  const mine = useMemo(
    () =>
      mineRows.map((row) => toDeliveryOrder(row, { partnerId, origin })).sort(sortForPartner),
    [mineRows, partnerId, origin],
  );

  const activeOrder = useMemo(() => mine.find((o) => o.stage === 'active') ?? null, [mine]);

  /** Shared update path; every write keeps `assigned_partner` = us to satisfy RLS. */
  const setStatus = useCallback(
    async (orderId: string, status: OrderStatus): Promise<ActionResult> => {
      if (!partnerId) return { error: 'You must be signed in.' };

      const { data, error: err } = await supabase
        .from('orders')
        .update({ status, assigned_partner: partnerId })
        .eq('id', orderId)
        .eq('assigned_partner', partnerId)
        .select();

      if (err) return { error: err.message };
      if (!data?.length) return { error: 'This order is no longer assigned to you.' };

      await load();
      return { error: null };
    },
    [partnerId, load],
  );

  const acceptOrder = useCallback(
    async (orderId: string): Promise<ActionResult> => {
      if (!partnerId) return { error: 'You must be signed in.' };

      // Refuse an order that has already blown its delivery window. The pool is
      // filtered too, but a stale render or a direct call could still get here.
      const target = availableRows.find((r) => r.id === orderId);
      if (target) {
        const sla = slaFor(toDeliveryOrder(target, { partnerId }), new Date());
        if (sla?.expired) {
          await load();
          return { error: 'This order passed its delivery deadline and has expired.' };
        }
      }

      // Collapse duplicate taps (and the modal re-arming mid-request) into the
      // single in-flight claim, instead of racing ourselves.
      if (acceptingRef.current.has(orderId)) return { error: null };
      acceptingRef.current.add(orderId);

      try {
        // Conditional update = optimistic concurrency: the WHERE clause only
        // matches while the order is genuinely unclaimed.
        const { data, error: err } = await supabase
          .from('orders')
          .update({ status: 'accepted', assigned_partner: partnerId })
          .eq('id', orderId)
          .eq('status', 'pending')
          .is('assigned_partner', null)
          .select();

        if (err) return { error: err.message };

        if (data?.length) {
          await load();
          return { error: null };
        }

        /*
         * Zero rows updated is NOT proof that someone else took it — it also
         * happens when we already own the order (a retry, or a second tap).
         * Blaming another partner there was wrong, so establish the real reason
         * first. RLS lets a partner read an order only once it is assigned to
         * them, which makes this read decisive: a hit means the order is ours.
         */
        const { data: owned } = await supabase
          .from('orders')
          .select('id, status, assigned_partner')
          .eq('id', orderId)
          .eq('assigned_partner', partnerId)
          .maybeSingle();

        await load();

        if (owned) {
          // Already ours — the claim succeeded, so this is a success, not an error.
          return { error: null };
        }

        return { error: 'This order is no longer available — another partner took it.' };
      } finally {
        acceptingRef.current.delete(orderId);
      }
    },
    [partnerId, load, availableRows],
  );

  const startDelivery = useCallback(
    // `out_for_delivery` is the value the customer app's timeline renders.
    (orderId: string) => setStatus(orderId, 'out_for_delivery'),
    [setStatus],
  );

  const completeDelivery = useCallback(
    (orderId: string) => setStatus(orderId, 'delivered'),
    [setStatus],
  );

  return {
    available,
    mine,
    activeOrder,
    loading,
    error,
    notAPartner,
    refresh,
    acceptOrder,
    startDelivery,
    completeDelivery,
  };
}
