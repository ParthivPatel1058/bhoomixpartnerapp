import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Reports whether this deployment's origin is in the Supabase project's
 * "Redirect URLs" allowlist, so the UI can warn about a broken Google sign-in
 * instead of silently dumping the partner on the customer app.
 *
 * Why this runs server-side: the check reads the `Location` header of a 302
 * from Supabase, and CORS makes that unreadable from the browser.
 *
 * The probe starts a real OAuth flow to obtain a valid `state`, then replays the
 * provider callback as a DENIED consent. GoTrue resolves the stored redirect_to
 * and bounces there — or falls back to the project's Site URL when the URL is
 * not allowlisted. No account, session, or email is ever created.
 */

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ?? 'https://tzmuivqtlnosgkubhyft.supabase.co';

const TIMEOUT_MS = 8000;

interface ProbeResult {
  /** Where GoTrue actually sent the callback. */
  landedOn: string | null;
  allowlisted: boolean;
}

function originOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

async function locationOf(url: string, cookie?: string): Promise<{ location: string | null; cookie: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
      headers: cookie ? { cookie } : undefined,
    });
    return {
      location: res.headers.get('location'),
      cookie: res.headers.get('set-cookie'),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function probe(target: string): Promise<ProbeResult> {
  const authorize =
    `${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(target)}`;

  const started = await locationOf(authorize);
  const state = started.location
    ? new URL(started.location).searchParams.get('state')
    : null;

  if (!state) return { landedOn: null, allowlisted: false };

  const callback =
    `${SUPABASE_URL}/auth/v1/callback?error=access_denied&error_description=probe&state=${state}`;
  const finished = await locationOf(callback, started.cookie ?? undefined);

  const landedOn = originOf(finished.location);
  return {
    landedOn,
    // Allowlisted only if GoTrue honoured the requested destination.
    allowlisted: landedOn === originOf(target),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin =
    (typeof req.query.origin === 'string' && req.query.origin) ||
    (req.headers.origin as string | undefined) ||
    (req.headers.host ? `https://${req.headers.host}` : null);

  if (!origin) {
    return res.status(400).json({ error: 'Could not determine origin' });
  }

  // Cheap and stable enough to cache briefly; this is a config check, not data.
  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');

  try {
    const result = await probe(`${origin}/`);
    return res.status(200).json({
      origin,
      googleRedirectOk: result.allowlisted,
      landedOn: result.landedOn,
      // Only meaningful when the check failed.
      fix: result.allowlisted
        ? null
        : `Add ${origin}/** to Supabase -> Authentication -> URL Configuration -> Redirect URLs`,
    });
  } catch (error) {
    console.error('auth-health probe failed:', error);
    // Unknown is not the same as broken — let the UI stay quiet.
    return res.status(200).json({ origin, googleRedirectOk: null, landedOn: null, fix: null });
  }
}
