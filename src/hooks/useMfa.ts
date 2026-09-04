import { useCallback, useEffect, useState } from 'react';
import type { Factor } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

/**
 * TOTP two-factor auth backed by Supabase MFA.
 *
 * Assurance levels drive the whole flow:
 *   aal1 = signed in with one factor (password or Google)
 *   aal2 = a TOTP code has also been verified this session
 *
 * `currentLevel === 'aal1' && nextLevel === 'aal2'` means the partner has a
 * verified factor but has not entered a code yet — that is the state that must
 * gate the app.
 */

export interface EnrollmentStart {
  factorId: string;
  /** SVG data URI of the QR code to scan with Google Authenticator. */
  qrCode: string;
  /** Base32 secret, for manual entry when a camera is unavailable. */
  secret: string;
}

interface UseMfaResult {
  /** Verified TOTP factors on this account. */
  factors: Factor[];
  enabled: boolean;
  /** Signed in, has a factor, but has not passed the code challenge yet. */
  challengeRequired: boolean;
  loading: boolean;
  error: string | null;

  startEnrollment: () => Promise<{ data: EnrollmentStart | null; error: string | null }>;
  /** Confirms enrolment, or satisfies the sign-in challenge. */
  verifyCode: (factorId: string, code: string) => Promise<{ error: string | null }>;
  cancelEnrollment: (factorId: string) => Promise<void>;
  removeFactor: (factorId: string) => Promise<{ error: string | null }>;
  refresh: () => Promise<void>;
}

const FRIENDLY_NAME = 'BhoomiX Partner';

/** Supabase MFA errors are cryptic; make them mean something to a driver. */
function friendlyMfaError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid totp code') || m.includes('invalid code')) {
    return 'That code is not right. Check the app and try the current 6 digits.';
  }
  if (m.includes('expired')) {
    return 'That code expired. Enter the new one showing in your app.';
  }
  if (m.includes('rate') || m.includes('too many')) {
    return 'Too many attempts. Wait a minute, then try again.';
  }
  if (m.includes('mfa') && m.includes('disabled')) {
    return 'Two-factor auth is turned off for this Supabase project.';
  }
  if (m.includes('already exists')) {
    return 'An unfinished setup was found. Try again — we cleared it.';
  }
  return message;
}

export function useMfa(): UseMfaResult {
  const { user } = useAuth();

  const [factors, setFactors] = useState<Factor[]>([]);
  const [challengeRequired, setChallengeRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setFactors([]);
      setChallengeRequired(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [factorsRes, aalRes] = await Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);

      if (factorsRes.error) {
        setError(friendlyMfaError(factorsRes.error.message));
        setFactors([]);
      } else {
        setError(null);
        // `totp` holds only verified factors; half-finished enrolments live in
        // `all` and must not count as "2FA is on".
        setFactors(factorsRes.data?.totp ?? []);
      }

      const aal = aalRes.data;
      setChallengeRequired(aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startEnrollment = useCallback(async () => {
    // Clear abandoned enrolments first, otherwise Supabase rejects the new one
    // with "factor already exists" and the user is stuck with no way out.
    const existing = await supabase.auth.mfa.listFactors();
    const stale = (existing.data?.all ?? []).filter((f) => f.status === 'unverified');
    await Promise.all(stale.map((f) => supabase.auth.mfa.unenroll({ factorId: f.id })));

    const { data, error: err } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `${FRIENDLY_NAME} ${new Date().toISOString().slice(0, 10)}`,
    });

    if (err) return { data: null, error: friendlyMfaError(err.message) };
    if (!data) return { data: null, error: 'Could not start two-factor setup.' };

    return {
      data: {
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      },
      error: null,
    };
  }, []);

  const verifyCode = useCallback(
    async (factorId: string, code: string) => {
      const trimmed = code.replace(/\D/g, '');
      if (trimmed.length !== 6) return { error: 'Enter all 6 digits.' };

      // challengeAndVerify does the challenge + verify round trip in one call
      // and upgrades the session to aal2 on success.
      const { error: err } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: trimmed,
      });

      if (err) return { error: friendlyMfaError(err.message) };

      await refresh();
      return { error: null };
    },
    [refresh],
  );

  const cancelEnrollment = useCallback(async (factorId: string) => {
    await supabase.auth.mfa.unenroll({ factorId });
    // Deliberately not refreshing: the caller is closing the dialog anyway, and
    // an unverified factor never affected `factors` or `challengeRequired`.
  }, []);

  const removeFactor = useCallback(
    async (factorId: string) => {
      const { error: err } = await supabase.auth.mfa.unenroll({ factorId });
      if (err) return { error: friendlyMfaError(err.message) };
      await refresh();
      return { error: null };
    },
    [refresh],
  );

  return {
    factors,
    enabled: factors.length > 0,
    challengeRequired,
    loading,
    error,
    startEnrollment,
    verifyCode,
    cancelEnrollment,
    removeFactor,
    refresh,
  };
}
