import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Lock,
  LogIn,
  Mail,
  ShieldCheck,
  User,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { requestPasswordReset, signInWithUsername } from '../lib/staffAuth';

/**
 * Sign-in for the distribution console.
 *
 * There is deliberately no "create account" path and no OAuth button. Accounts
 * exist only because an admin or manager provisioned them, and the database
 * enforces that independently — removing the UI is the courtesy, the
 * invite-only trigger on auth.users is the actual control.
 */
export const StaffAuthView: React.FC = () => {
  const [mode, setMode] = useState<'signin' | 'forgot'>('signin');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error: err } = await signInWithUsername(identifier, password);

    if (err) {
      setError(err);
      setBusy(false);
    }
    // On success the auth listener swaps the whole tree; leave the spinner on.
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const { error: err } = await requestPasswordReset(resetEmail);
    setBusy(false);

    if (err) setError(err);
    else setResetSent(true);
  };

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-6 bg-gradient-to-br from-tertiary-container/40 via-background to-surface-container">
      <div className="max-w-sm w-full">
        <div className="flex flex-col items-center text-center mb-7">
          <BrandLogo className="w-[240px] max-w-full text-on-surface" title="BhoomiX" />
          <p className="text-sm text-on-surface-variant mt-4">Distribution console</p>
        </div>

        {mode === 'signin' ? (
          <form
            onSubmit={submit}
            className="bg-surface-container/70 backdrop-blur-xl rounded-3xl p-6 shadow-lg border border-white/60 flex flex-col gap-4"
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-on-surface-variant">Username</span>
              <span className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
                <input
                  type="text"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="khush"
                  className="w-full min-h-[52px] bg-surface pl-10 pr-4 rounded-xl border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface"
                />
              </span>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-on-surface-variant">Password</span>
              <span className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[52px] bg-surface pl-10 pr-4 rounded-xl border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface"
                />
              </span>
            </label>

            {error && (
              <p className="text-xs text-on-error-container bg-error-container rounded-xl px-3 py-2.5 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[52px] rounded-xl bg-secondary text-on-secondary font-bold text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
              Sign in
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('forgot');
                setError(null);
              }}
              className="min-h-[44px] text-xs font-bold text-secondary"
            >
              Forgot your password?
            </button>

            <p className="text-[11px] text-on-surface-variant text-center leading-relaxed flex items-start gap-1.5 justify-center">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px text-secondary" />
              Access is by invitation only. Contact your administrator to be added.
            </p>
          </form>
        ) : (
          <form
            onSubmit={submitReset}
            className="bg-surface-container/70 backdrop-blur-xl rounded-3xl p-6 shadow-lg border border-white/60 flex flex-col gap-4"
          >
            {resetSent ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="w-12 h-12 text-secondary" />
                <p className="text-base font-bold text-on-surface">Check your email</p>
                {/* Worded so it reveals nothing about whether the address exists. */}
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  If that address belongs to an account, a reset link is on its way. The
                  link expires shortly, so use it soon.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setResetSent(false);
                    setResetEmail('');
                  }}
                  className="mt-2 min-h-[44px] text-xs font-bold text-secondary flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" /> Back to sign in
                </button>
              </div>
            ) : (
              <>
                <div>
                  <h2 className="text-base font-bold text-on-surface">Reset your password</h2>
                  <p className="text-xs text-on-surface-variant mt-1 leading-relaxed">
                    Enter the email on your account and we'll send you a link. No need to
                    involve your administrator.
                  </p>
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-on-surface-variant">Email</span>
                  <span className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
                    <input
                      type="email"
                      required
                      autoComplete="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full min-h-[52px] bg-surface pl-10 pr-4 rounded-xl border border-outline-variant/50 focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface"
                    />
                  </span>
                </label>

                {error && (
                  <p className="text-xs text-on-error-container bg-error-container rounded-xl px-3 py-2.5 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full min-h-[52px] rounded-xl bg-secondary text-on-secondary font-bold text-sm shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  Send reset link
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setError(null);
                  }}
                  className="min-h-[44px] text-xs font-bold text-on-surface-variant flex items-center justify-center gap-1.5"
                >
                  <ArrowLeft className="w-4 h-4" /> Back to sign in
                </button>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
