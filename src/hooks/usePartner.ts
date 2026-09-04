import { useCallback, useEffect, useState } from 'react';
import type { PartnerRow } from '../lib/schema';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export interface PartnerRegistration {
  fullName: string;
  phoneNumber: string;
  vehicleType: string;
}

interface UsePartnerResult {
  partner: PartnerRow | null;
  loading: boolean;
  error: string | null;
  /** Registered but `is_active = false` — RLS will block every order query. */
  awaitingApproval: boolean;
  register: (input: PartnerRegistration) => Promise<{ error: string | null }>;
  update: (patch: Partial<PartnerRow>) => Promise<{ error: string | null }>;
  refresh: () => void;
}

export function usePartner(): UsePartnerResult {
  const { user } = useAuth();
  const [partner, setPartner] = useState<PartnerRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!user) {
      setPartner(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    supabase
      .from('partners')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) {
          setError(err.message);
          setPartner(null);
        } else {
          setError(null);
          setPartner(data ?? null);
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, nonce]);

  const register = useCallback(
    async ({ fullName, phoneNumber, vehicleType }: PartnerRegistration) => {
      if (!user) return { error: 'You must be signed in to register.' };

      const { data, error: err } = await supabase
        .from('partners')
        .insert({
          user_id: user.id,
          full_name: fullName.trim(),
          phone_number: phoneNumber.trim(),
          vehicle_type: vehicleType.trim(),
          // The column defaults to false (admin approval); the Main app's
          // registration form sets it explicitly and so do we, otherwise a
          // fresh partner can never load a single order.
          is_active: true,
        })
        .select()
        .single();

      if (err) {
        // 23505 = unique_violation on partners.user_id
        if (err.code === '23505') {
          refresh();
          return { error: 'This account is already registered as a partner.' };
        }
        return { error: err.message };
      }

      setPartner(data);
      return { error: null };
    },
    [user, refresh],
  );

  const update = useCallback(
    async (patch: Partial<PartnerRow>) => {
      if (!user || !partner) return { error: 'No partner profile to update.' };

      const { data, error: err } = await supabase
        .from('partners')
        .update(patch)
        .eq('user_id', user.id)
        .select()
        .single();

      if (err) return { error: err.message };
      setPartner(data);
      return { error: null };
    },
    [user, partner],
  );

  return {
    partner,
    loading,
    error,
    awaitingApproval: Boolean(partner && partner.is_active === false),
    register,
    update,
    refresh,
  };
}
