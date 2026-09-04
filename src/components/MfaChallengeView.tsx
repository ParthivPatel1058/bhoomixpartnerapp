import React, { useState } from 'react';
import { AlertCircle, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import type { Factor } from '@supabase/supabase-js';
import { OtpInput } from './OtpInput';
import { useAuth } from '../hooks/useAuth';

interface MfaChallengeViewProps {
  factors: Factor[];
  verifyCode: (factorId: string, code: string) => Promise<{ error: string | null }>;
}

/**
 * Blocks the app until the partner enters a valid TOTP code.
 *
 * Reached when the session is aal1 but the account can reach aal2 — i.e. signed
 * in (by password or Google) with two-factor still outstanding.
 */
export const MfaChallengeView: React.FC<MfaChallengeViewProps> = ({ factors, verifyCode }) => {
  const { signOut } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const factorId = factors[0]?.id;

  const submit = async (value: string) => {
    if (!factorId || busy) return;
    setBusy(true);
    setError(null);

    const { error: err } = await verifyCode(factorId, value);
    if (err) {
      setError(err);
      setCode('');
      setBusy(false);
      return;
    }
    // Success flips the session to aal2; App swaps this screen out.
  };

  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-gradient-to-br from-tertiary-container/40 via-background to-surface-container">
      <div className="max-w-sm w-full rounded-3xl bg-surface-container/85 backdrop-blur-xl p-6 border border-white/60 shadow-lg flex flex-col gap-5">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-3 shadow-md">
            <ShieldCheck className="w-7 h-7 text-on-secondary" />
          </div>
          <h1 className="text-lg font-bold text-on-surface">Two-factor verification</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Open Google Authenticator and enter the 6-digit code for BhoomiX Partner.
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(code);
          }}
          className="flex flex-col gap-4"
        >
          <OtpInput
            value={code}
            onChange={setCode}
            onComplete={submit}
            disabled={busy}
            autoFocus
            invalid={Boolean(error)}
          />

          {error && (
            <p className="text-xs text-on-error-container bg-error-container rounded-xl px-3 py-2.5 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="w-full min-h-[52px] rounded-xl bg-secondary text-on-secondary font-bold text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            Verify and continue
          </button>
        </form>

        <p className="text-[11px] text-center text-on-surface-variant leading-relaxed">
          Codes refresh every 30 seconds. Lost your phone? Sign out and contact a BhoomiX admin
          to reset two-factor on your account.
        </p>

        <button
          onClick={signOut}
          className="text-xs font-semibold text-on-surface-variant hover:text-on-surface flex items-center justify-center gap-1.5 min-h-[44px]"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </div>
    </div>
  );
};
