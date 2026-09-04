import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Lock,
  Mail,
  MailCheck,
  RefreshCw,
  User,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { BrandLogo } from './BrandLogo';

type Mode = 'signin' | 'signup';

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? '';

/** Deep link straight to the page holding the Redirect URLs allowlist. */
const SUPABASE_URL_CONFIG_LINK = SUPABASE_PROJECT_ID
  ? `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_ID}/auth/url-configuration`
  : 'https://supabase.com/dashboard';

/** Google's brand mark — lucide has no official Google logo. */
const GoogleMark: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84a10.1 10.1 0 0 1-4.39 6.63v5.52h7.1c4.16-3.83 6.57-9.47 6.57-16.16z"
    />
    <path
      fill="#34A853"
      d="M24 46c5.94 0 10.92-1.97 14.56-5.34l-7.1-5.52c-1.97 1.32-4.49 2.1-7.46 2.1-5.74 0-10.6-3.87-12.33-9.08H4.34v5.7A22 22 0 0 0 24 46z"
    />
    <path
      fill="#FBBC05"
      d="M11.67 28.16a13.2 13.2 0 0 1 0-8.42v-5.7H4.34a22 22 0 0 0 0 19.82l7.33-5.7z"
    />
    <path
      fill="#EA4335"
      d="M24 9.5c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 2.92 29.93 1 24 1 15.4 1 7.96 5.94 4.34 14.04l7.33 5.7C13.4 13.37 18.26 9.5 24 9.5z"
    />
  </svg>
);

export const AuthView: React.FC = () => {
  const { signIn, signUp, signInWithGoogle, configured, oauthError, clearOauthError } =
    useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmSent, setConfirmSent] = useState(false);

  // null = unknown / still checking, true = fine, false = misconfigured.
  const [googleRedirectOk, setGoogleRedirectOk] = useState<boolean | null>(null);
  const [rechecking, setRechecking] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);

  const probeGoogleRedirect = async () => {
    const res = await fetch(
      `/api/auth-health?origin=${encodeURIComponent(window.location.origin)}`,
    );
    const data = await res.json();
    return (data.googleRedirectOk ?? null) as boolean | null;
  };

  /** Lets the partner confirm the fix landed without reloading or redeploying. */
  const recheckGoogle = async () => {
    setRechecking(true);
    try {
      setGoogleRedirectOk(await probeGoogleRedirect());
    } catch {
      /* advisory only */
    } finally {
      setRechecking(false);
    }
  };

  const copyRedirectUrl = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/**`);
      setCopiedUrl(true);
      window.setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      /* clipboard blocked — the value is on screen to copy by hand */
    }
  };

  // Surface a failed Google redirect in the same place as form errors.
  useEffect(() => {
    if (oauthError) setError(oauthError);
  }, [oauthError]);

  /*
   * Ask the server whether this origin is allowlisted in Supabase before the
   * partner commits to a Google round-trip. Without this the failure mode is
   * invisible: GoTrue just drops them on the customer app.
   */
  useEffect(() => {
    let cancelled = false;
    probeGoogleRedirect()
      .then((ok) => {
        if (!cancelled) setGoogleRedirectOk(ok);
      })
      .catch(() => {
        /* probe is advisory — never block sign-in on it */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGoogle = async () => {
    setError(null);
    clearOauthError();
    setGoogleBusy(true);
    const { error: err } = await signInWithGoogle();
    if (err) {
      setError(err);
      setGoogleBusy(false);
    }
    // On success the page navigates to Google; leave the spinner running.
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (mode === 'signup' && !fullName.trim()) {
      setError('Enter your full name.');
      return;
    }
    if (mode === 'signup' && password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setBusy(true);
    const result =
      mode === 'signin'
        ? await signIn(email, password)
        : await signUp(email, password, fullName);
    setBusy(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    if (result.needsEmailConfirmation) setConfirmSent(true);
    // On success the AuthProvider swaps this screen out.
  };

  if (!configured) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6 bg-background">
        <div className="max-w-sm w-full rounded-3xl bg-surface-container p-6 border border-white/60 shadow-lg text-center">
          <AlertCircle className="w-10 h-10 text-error mx-auto mb-3" />
          <h1 className="text-lg font-bold text-on-surface">Backend not configured</h1>
          <p className="text-sm text-on-surface-variant mt-2">
            Copy <code className="font-mono text-xs">.env.example</code> to{' '}
            <code className="font-mono text-xs">.env</code> and set{' '}
            <code className="font-mono text-xs">VITE_SUPABASE_URL</code> and{' '}
            <code className="font-mono text-xs">VITE_SUPABASE_PUBLISHABLE_KEY</code> to the
            same Supabase project the BhoomiX Main app uses, then restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  if (confirmSent) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6 bg-background">
        <div className="max-w-sm w-full rounded-3xl bg-surface-container p-6 border border-white/60 shadow-lg text-center">
          <MailCheck className="w-12 h-12 text-secondary mx-auto mb-3" />
          <h1 className="text-lg font-bold text-on-surface">Check your inbox</h1>
          <p className="text-sm text-on-surface-variant mt-2">
            We sent a confirmation link to <strong>{email}</strong>. Confirm it, then sign in
            to start accepting deliveries.
          </p>
          <button
            onClick={() => {
              setConfirmSent(false);
              setMode('signin');
            }}
            className="mt-5 w-full py-3 rounded-xl bg-secondary text-on-secondary font-bold text-sm"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center p-6 bg-gradient-to-br from-tertiary-container/40 via-background to-surface-container">
      <div className="max-w-sm w-full">
        <div className="flex flex-col items-center text-center mb-7">
          <BrandLogo className="w-[240px] max-w-full text-on-surface" title="BhoomiX Partner" />
          <p className="text-sm text-on-surface-variant mt-4">
            Delivering growth, one order at a time.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl bg-surface-container/85 backdrop-blur-xl p-6 border border-white/60 shadow-lg flex flex-col gap-4"
        >
          <div className="flex rounded-xl bg-surface-variant/60 p-1">
            {(['signin', 'signup'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                  clearOauthError();
                }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  mode === m
                    ? 'bg-secondary text-on-secondary shadow-sm'
                    : 'text-on-surface-variant'
                }`}
              >
                {m === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          {/* Google first: BhoomiX accounts made through Google have no
              password, so the form below can never sign those partners in. */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={googleBusy || busy}
            className="w-full py-3.5 rounded-xl bg-surface border border-outline-variant/50 text-on-surface font-bold text-sm shadow-sm hover:bg-surface-container-low transition-colors flex items-center justify-center gap-2.5 disabled:opacity-60"
          >
            {googleBusy ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <GoogleMark className="w-5 h-5" />
            )}
            Continue with Google
          </button>

          {googleRedirectOk === false && (
            <div className="rounded-xl bg-error-container/70 border border-error/25 p-3 flex flex-col gap-2.5">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-px text-on-error-container" />
                <div className="text-[11px] leading-relaxed text-on-error-container">
                  <strong className="font-bold">
                    Google sign-in needs one setting enabled.
                  </strong>{' '}
                  Right now it sends partners to the BhoomiX customer app. Add this to the
                  project's Redirect URLs:
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <code className="flex-1 font-mono text-[11px] bg-surface/80 rounded-lg px-2 py-1.5 text-on-surface break-all">
                  {window.location.origin}/**
                </code>
                <button
                  type="button"
                  onClick={copyRedirectUrl}
                  className="shrink-0 w-9 h-9 rounded-lg bg-surface/80 flex items-center justify-center text-secondary"
                  aria-label="Copy redirect URL"
                >
                  {copiedUrl ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex gap-2">
                <a
                  href={SUPABASE_URL_CONFIG_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-h-[40px] rounded-lg bg-on-error-container text-error-container font-bold text-[11px] flex items-center justify-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open settings
                </a>
                <button
                  type="button"
                  onClick={recheckGoogle}
                  disabled={rechecking}
                  className="flex-1 min-h-[40px] rounded-lg bg-surface/80 text-on-surface font-bold text-[11px] flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  {rechecking ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  Check again
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-outline-variant/50" />
            <span className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">
              {googleRedirectOk === false ? 'use email instead' : 'or use email'}
            </span>
            <span className="h-px flex-1 bg-outline-variant/50" />
          </div>

          {mode === 'signup' && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-bold text-on-surface-variant">Full name</span>
              <div className="relative">
                <User className="absolute left-3 top-3.5 w-4 h-4 text-outline" />
                <input
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Rahul Sharma"
                  className="w-full bg-surface pl-10 pr-4 py-3 rounded-xl text-sm border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface"
                />
              </div>
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-on-surface-variant">Email</span>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 w-4 h-4 text-outline" />
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-surface pl-10 pr-4 py-3 rounded-xl text-sm border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-on-surface-variant">Password</span>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 w-4 h-4 text-outline" />
              <input
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-surface pl-10 pr-4 py-3 rounded-xl text-sm border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-secondary text-on-surface"
              />
            </div>
          </label>

          {error && (
            <p className="text-xs text-on-error-container bg-error-container rounded-xl px-3 py-2.5 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || googleBusy}
            className="w-full py-3.5 rounded-xl bg-secondary text-on-secondary font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'signin' ? 'Sign in' : 'Create partner account'}
          </button>

          <p className="text-[11px] text-center text-on-surface-variant leading-relaxed">
            Uses the same BhoomiX account system as the customer app.
          </p>
        </form>
      </div>
    </div>
  );
};
