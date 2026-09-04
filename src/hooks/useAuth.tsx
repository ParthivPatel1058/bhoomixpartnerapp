import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

interface AuthResult {
  error: string | null;
  /** Set when Supabase requires the user to confirm their email first. */
  needsEmailConfirmation?: boolean;
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signUp: (email: string, password: string, fullName: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  signOut: () => Promise<void>;
  /** Error the OAuth provider handed back on the redirect, if any. */
  oauthError: string | null;
  clearOauthError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Set just before we hand off to Google, cleared once a session lands.
 *
 * Both BhoomiX apps share one Supabase project, and a project has exactly one
 * Site URL (the Main app). If this app's origin is missing from Authentication →
 * URL Configuration → Redirect URLs, GoTrue silently falls back to that Site URL
 * and the partner is dumped on the customer app instead of signed in here. This
 * flag lets us name that failure instead of showing a blank login form.
 *
 * sessionStorage survives the redirect round-trip within the same tab.
 */
const OAUTH_PENDING_KEY = 'bhoomix-partner-oauth-pending';

/** Supabase error strings are terse; make the common ones actionable. */
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) {
    // BhoomiX accounts created through Google have no password at all, so this
    // is the error a Google user hits on the password form every single time.
    return 'Email or password is incorrect. If you signed up with Google, use "Continue with Google" instead.';
  }
  if (m.includes('email not confirmed')) {
    return 'Confirm your email address, then sign in again.';
  }
  if (m.includes('already registered') || m.includes('user already')) {
    return 'That email already has an account — sign in instead.';
  }
  if (m.includes('password') && m.includes('at least')) {
    return 'Password must be at least 6 characters.';
  }
  if (m.includes('failed to fetch') || m.includes('network')) {
    return 'Cannot reach BhoomiX servers. Check your connection.';
  }
  return message;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [oauthError, setOauthError] = useState<string | null>(null);

  const clearOauthError = useCallback(() => setOauthError(null), []);

  /*
   * Read whatever the OAuth provider appended to the redirect, then scrub it.
   * Supabase returns failures in the query string (?error=...) or, for implicit
   * responses, the hash. Leaving `?code=` or `#access_token=` in the address bar
   * after the exchange means a refresh replays a spent code and errors out.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));

    const errorCode = query.get('error') ?? hash.get('error');
    const description = query.get('error_description') ?? hash.get('error_description');
    if (errorCode) {
      setOauthError(
        description?.replace(/\+/g, ' ') ?? `Google sign-in failed (${errorCode}).`,
      );
    }

    const dirty =
      errorCode ||
      query.has('code') ||
      hash.has('access_token') ||
      query.has('error_description');

    if (dirty) {
      // Give supabase-js a tick to consume the params before we strip them.
      const timer = window.setTimeout(() => {
        window.history.replaceState({}, '', window.location.pathname);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    // Register the listener before the initial getSession() so a token refresh
    // that lands mid-boot isn't dropped.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    supabase.auth
      .getSession()
      .then(({ data }) => {
        setSession(data.session);
        setUser(data.session?.user ?? null);

        // We handed off to Google and came back empty-handed. The usual cause is
        // this origin missing from the project's Redirect URLs allowlist.
        let pending: string | null = null;
        try {
          pending = sessionStorage.getItem(OAUTH_PENDING_KEY);
          if (pending) sessionStorage.removeItem(OAUTH_PENDING_KEY);
        } catch {
          /* ignore */
        }

        if (pending && !data.session) {
          setOauthError(
            `Google sent you back without a session. Add ${pending}/** to Supabase → ` +
              'Authentication → URL Configuration → Redirect URLs, then try again.',
          );
        }
      })
      .finally(() => setLoading(false));

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return { error: error ? friendlyAuthError(error.message) : null };
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, fullName: string): Promise<AuthResult> => {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: { full_name: fullName.trim() },
        },
      });
      if (error) return { error: friendlyAuthError(error.message) };

      // No session back means the project has email confirmation switched on.
      return { error: null, needsEmailConfirmation: !data.session };
    },
    [],
  );

  const signInWithGoogle = useCallback(async (): Promise<AuthResult> => {
    try {
      sessionStorage.setItem(OAUTH_PENDING_KEY, window.location.origin);
    } catch {
      /* private mode — the diagnostic is best-effort, sign-in still proceeds */
    }

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Must be listed under Authentication → URL Configuration → Redirect
        // URLs in Supabase, or GoTrue drops the partner on the Site URL (the
        // BhoomiX Main app) instead of bringing them back here.
        redirectTo: `${window.location.origin}/`,
        queryParams: {
          // Ask for a refresh token and let the partner pick an account rather
          // than silently reusing whichever one Chrome saw last.
          access_type: 'offline',
          prompt: 'select_account',
        },
      },
    });
    // On success the browser navigates away to Google, so nothing after this
    // runs; only a failure to *start* the flow returns here.
    return { error: error ? friendlyAuthError(error.message) : null };
  }, []);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore — local state is cleared below regardless */
    } finally {
      setUser(null);
      setSession(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      loading,
      configured: isSupabaseConfigured,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      oauthError,
      clearOauthError,
    }),
    [
      user,
      session,
      loading,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      oauthError,
      clearOauthError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
