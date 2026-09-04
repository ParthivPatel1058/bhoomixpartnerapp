#!/usr/bin/env bash
#
# Checks whether this app's origins are in the Supabase project's
# "Redirect URLs" allowlist — WITHOUT signing anyone in.
#
# How it works: start a real OAuth flow to get a valid `state`, then replay the
# provider callback as a DENIED consent (`error=access_denied`). GoTrue resolves
# the stored redirect_to and bounces there — or, if the URL is not allowlisted,
# falls back to the project's Site URL. No account, session, or email is created.
#
# A URL is allowlisted only if it lands on ITSELF. If it lands on the same place
# as the CONTROL row, it is NOT allowlisted.
#
# Usage:  bash scripts/check-oauth-redirect.sh

set -uo pipefail

SUPABASE_URL="${VITE_SUPABASE_URL:-https://tzmuivqtlnosgkubhyft.supabase.co}"

urlencode() { printf %s "$1" | sed 's|:|%3A|g; s|/|%2F|g'; }

probe() {
  local target="$1" label="$2" jar loc state final host
  jar="$(mktemp)"

  loc=$(curl -s -m 25 -o /dev/null -D - -c "$jar" \
        "$SUPABASE_URL/auth/v1/authorize?provider=google&redirect_to=$(urlencode "$target")" \
        | grep -i '^location:' | tr -d '\r')
  state=$(printf %s "$loc" | grep -oE 'state=[^&]+' | head -1 | cut -d= -f2)

  if [ -z "$state" ]; then
    printf '%-34s  ERROR: could not start flow (is Google enabled?)\n' "$label"
    rm -f "$jar"; return
  fi

  final=$(curl -s -m 25 -o /dev/null -D - -b "$jar" \
          "$SUPABASE_URL/auth/v1/callback?error=access_denied&error_description=probe&state=$state" \
          | grep -i '^location:' | tr -d '\r' | sed 's/^[Ll]ocation: *//')
  host=$(printf %s "$final" | sed -E 's|^(https?://[^/?#]+).*|\1|')

  printf '%-34s -> %s\n' "$label" "$host"
  rm -f "$jar"
}

echo "Supabase project: $SUPABASE_URL"
echo
probe "https://bhoomix-partner.vercel.app/"     "partner (production)"
probe "http://localhost:3000/"                  "partner (local dev)"
probe "https://control-not-allowed.invalid/"    "CONTROL (never allowlisted)"
echo
echo "PASS = each partner row points at itself."
echo "FAIL = a partner row matches the CONTROL row; add it under"
echo "       Authentication -> URL Configuration -> Redirect URLs as <origin>/**"
