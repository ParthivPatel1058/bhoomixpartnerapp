import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

/**
 * Authoritative earnings from the `partner` schema.
 *
 * Returns null until `supabase/migrations/20260731_partner_area.sql` has been
 * applied — the app then keeps using its client-side payout estimate. Both
 * paths work, so deploying the frontend before running the migration is safe.
 */
export interface PartnerStats {
  earnedTotal: number;
  earnedToday: number;
  earnedWeek: number;
  tripsTotal: number;
  tripsToday: number;
  /** Null when no customer has rated this partner yet. */
  avgRating: number | null;
  ratingCount: number;
}

interface StatsRow {
  earned_total: number | string | null;
  earned_today: number | string | null;
  earned_week: number | string | null;
  trips_total: number | string | null;
  trips_today: number | string | null;
  avg_rating: number | string | null;
  rating_count: number | string | null;
}

/** Postgres numerics arrive as strings over PostgREST. */
const num = (value: number | string | null | undefined): number => {
  const n = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** The RPC does not exist yet — migration not applied. */
const MISSING_FN = /could not find the function|does not exist|PGRST202/i;

export function usePartnerStats(): {
  stats: PartnerStats | null;
  /** True once we know the partner schema is not installed. */
  unavailable: boolean;
  refresh: () => Promise<void>;
} {
  const { user } = useAuth();
  const [stats, setStats] = useState<PartnerStats | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setStats(null);
      return;
    }

    const { data, error } = await supabase.rpc('get_partner_stats');

    if (error) {
      // A missing function is expected pre-migration and must stay silent; any
      // other error just leaves the estimate in place.
      if (MISSING_FN.test(`${error.message} ${error.code ?? ''}`)) setUnavailable(true);
      setStats(null);
      return;
    }

    const row = (Array.isArray(data) ? data[0] : data) as StatsRow | undefined;
    if (!row) {
      setStats(null);
      return;
    }

    setUnavailable(false);
    setStats({
      earnedTotal: num(row.earned_total),
      earnedToday: num(row.earned_today),
      earnedWeek: num(row.earned_week),
      tripsTotal: num(row.trips_total),
      tripsToday: num(row.trips_today),
      avgRating: row.avg_rating == null ? null : num(row.avg_rating),
      ratingCount: num(row.rating_count),
    });
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { stats, unavailable, refresh };
}
