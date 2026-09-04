import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, Loader2, Lock, ShieldCheck } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { completePasswordReset } from '../lib/staffAuth';

interface SetPasswordViewProps {
  /** 'recovery' arrived from an emailed link; 'forced' is a first login. */
  mode: 'recovery' | 'forced';
  onDone: () => void;
  onCancel?: () => void;
}

const MIN_LENGTH = 10;

/** Cheap, honest strength read — length and variety, no false precision. */
function strengthOf(pw: string): { score: 0 | 1 | 2 | 3; label: string; tone: string } {
  if (pw.length < MIN_LENGTH) return { score: 0, label: 'Too short', tone: 'bg-error' };

  const variety =
    Number(/[a-z]/.test(pw)) +
    Number(/[A-Z]/.test(pw)) +
    Number(/[0-9]/.test(pw)) +
    Number(/[^a-zA-Z0-9]/.test(pw));

  if (pw.length >= 16 && variety >= 3) return { score: 3, label: 'Strong', tone: 'bg-secondary' };
  if (variety >= 3) return { score: 2, label: 'Good', tone: 'bg-tertiary' };
  return { score: 1, label: 'Weak', tone: 'bg-[#d98a00]' };
}

/**
 * Choose a new password.
 *
 * Serves both the emailed recovery link and the forced change an admin-set
 * password triggers on first login — the two differ only in wording and in
 * whether the screen can be dismissed.
 */
export const SetPasswordView: React.FC<SetPasswordViewProps> = ({ mode, onDone, onCancel }) => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const strength = useMemo(() => strengthOf(password), [password]);
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = password.length >= MIN_LENGTH && !mismatch && confirm.length > 0 && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setError(null);

    const { error: err } = await completePasswordReset(password);
    setBusy(false);

    if (err) {
      setError(err);
      return;
    }

    setDone(true);
    // Let the confirmation register before handing back to the app.
    window.setTimeout(onDone, 1200);
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-6 bg-gradient-to-br from-tertiary-container/40 via-background to-surface-container">
      <div className="max-w-sm w-full">
        <div className="flex flex-col items-center text-center mb-7">
          <BrandLogo className="w-[200px] max-w-full text-on-surface" title="BhoomiX" />
        </div>

        <div className="bg-surface-container/70 backdrop-blur-xl rounded-3xl p-6 shadow-lg border border-white/60">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <CheckCircle2 className="w-12 h-12 text-secondary" />
              <p className="text-base font-bold text-on-surface">Password updated</p>
              <p className="text-xs text-on-surface-variant text-center">
                Signing you in…
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <div className="flex items-start gap-2.5">
                <div className="w-10 h-10 shrink-0 rounded-xl bg-secondary/15 flex items-center justify-center">
                  <KeyRound className="w-5 h-5 text-secondary" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-base font-bold text-on-surface">
                    {mode === 'forced' ? 'Choose your own password' : 'Set a new password'}
                  </h1>
                  <p className="text-xs text-on-surface-variant mt-0.5 leading-relaxed">
                    {mode === 'forced'
                      ? 'Your account was created with a temporary password. Replace it before continuing.'
                      : 'Pick something you have not used elsewhere.'}
                  </p>
                </div>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-on-surface-variant">New password</span>
                <span className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full min-h-[52px] bg-surface pl-10 pr-4 rounded-xl border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface"
                  />
                </span>
              </label>

              {password.length > 0 && (
                <div className="flex items-center gap-2 -mt-2">
                  <div className="flex-1 h-1.5 rounded-full bg-surface-variant overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${strength.tone}`}
                      style={{ width: `${((strength.score + 1) / 4) * 100}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-bold text-on-surface-variant shrink-0">
                    {strength.label}
                  </span>
                </div>
              )}

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-on-surface-variant">Confirm password</span>
                <span className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
                  <input
                    type="password"
                    required
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={`w-full min-h-[52px] bg-surface pl-10 pr-4 rounded-xl border focus:outline-none focus:ring-2 text-on-surface ${
                      mismatch
                        ? 'border-error/60 focus:ring-error'
                        : 'border-outline-variant/50 focus:ring-secondary'
                    }`}
                  />
                </span>
              </label>

              {mismatch && (
                <p className="text-xs text-on-error-container -mt-2">
                  Both entries must match.
                </p>
              )}

              {error && (
                <p className="text-xs text-on-error-container bg-error-container rounded-xl px-3 py-2.5 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full min-h-[52px] rounded-xl bg-secondary text-on-secondary font-bold text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                Save password
              </button>

              {mode === 'recovery' && onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="min-h-[44px] text-xs font-bold text-on-surface-variant"
                >
                  Back to sign in
                </button>
              )}

              <p className="text-[11px] text-on-surface-variant text-center">
                At least {MIN_LENGTH} characters.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
