import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

/**
 * Which console the signed-in person gets.
 *
 * The role comes from the database, never from client state or user metadata —
 * `my_staff_profile()` reads `staff_accounts`, which only the audited
 * provisioning RPCs can write. Rendering decisions made here are convenience;
 * every query the three consoles run is independently gated server-side.
 */

export type StaffRole = 'admin' | 'manager' | 'distributor';

export interface StaffProfile {
  id: string;
  email: string | null;
  role: StaffRole;
  fullName: string;
  phone: string | null;
  managerId: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
}

/** The access-control migration has not been applied yet. */
const MISSING_FN = /could not find the function|does not exist|PGRST202/i;

export function useStaffRole() {
  const { user } = useAuth();

  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('my_staff_profile');

      if (error) {
        if (MISSING_FN.test(`${error.message} ${error.code ?? ''}`)) setUnavailable(true);
        setProfile(null);
        return;
      }

      const row = (Array.isArray(data) ? data[0] : data) as
        | Record<string, unknown>
        | undefined;

      // Signed in but with no staff record: an account that predates the
      // migration, or a customer. Neither belongs in this console.
      if (!row) {
        setProfile(null);
        return;
      }

      setUnavailable(false);
      setProfile({
        id: String(row.id),
        email: (row.email as string) ?? null,
        role: String(row.role) as StaffRole,
        fullName: String(row.full_name ?? ''),
        phone: (row.phone as string) ?? null,
        managerId: (row.manager_id as string) ?? null,
        isActive: Boolean(row.is_active),
        mustChangePassword: Boolean(row.must_change_password),
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    profile,
    role: profile?.role ?? null,
    loading,
    unavailable,
    /** Signed in, but not provisioned as staff — must be refused entry. */
    isOutsider: Boolean(user) && !loading && !unavailable && profile === null,
    /** Provisioned but suspended by an admin. */
    isSuspended: Boolean(profile && !profile.isActive),
    refresh,
  };
}
