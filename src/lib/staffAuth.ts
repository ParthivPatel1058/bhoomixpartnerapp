import { supabase } from './supabase';

/**
 * Sign-in and recovery for the distribution console.
 *
 * Staff sign in with a username. Supabase authenticates on email, so a username
 * is resolved to its email first; anything containing "@" is treated as an
 * email and passed straight through.
 */

/** Where the recovery link sends people back to. */
export const RECOVERY_REDIRECT = `${window.location.origin}/#recovery`;

export interface AuthResult {
  error: string | null;
}

/**
 * Identical wording for every failure.
 *
 * Distinguishing "no such user" from "wrong password" would turn the login form
 * into a directory of valid staff usernames.
 */
const GENERIC_FAILURE = 'Those credentials were not recognised.';

export async function signInWithUsername(
  identifier: string,
  password: string,
): Promise<AuthResult> {
  const id = identifier.trim();
  if (!id || !password) return { error: GENERIC_FAILURE };

  let email = id;

  if (!id.includes('@')) {
    const { data, error } = await supabase.rpc('resolve_login_email', { _username: id });
    // A missing username and a lookup failure must be indistinguishable.
    if (error || !data) return { error: GENERIC_FAILURE };
    email = String(data);
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: email.toLowerCase(),
    password,
  });

  return { error: error ? GENERIC_FAILURE : null };
}

/**
 * Start password recovery.
 *
 * Always reports success. Telling the caller whether an address is registered
 * would leak the staff list to anyone who can load the page.
 */
export async function requestPasswordReset(email: string): Promise<AuthResult> {
  const clean = email.trim().toLowerCase();
  if (!clean.includes('@')) {
    return { error: 'Enter the email address on your account.' };
  }

  await supabase.auth.resetPasswordForEmail(clean, {
    redirectTo: RECOVERY_REDIRECT,
  });

  return { error: null };
}

/** Set a new password for the session opened by a recovery link. */
export async function completePasswordReset(newPassword: string): Promise<AuthResult> {
  if (newPassword.length < 10) {
    return { error: 'Use at least 10 characters.' };
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: error.message };

  // Discharge the forced-change obligation only after the password really moved.
  await supabase.rpc('clear_must_change_password');

  return { error: null };
}

/**
 * True when the current page load came from a recovery link.
 *
 * Supabase returns the token in the URL fragment, so this has to read the hash
 * rather than the query string.
 */
export function isRecoveryLanding(): boolean {
  const hash = window.location.hash ?? '';
  return hash.includes('type=recovery') || hash.startsWith('#recovery');
}
