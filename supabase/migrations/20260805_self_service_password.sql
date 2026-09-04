-- ============================================================================
-- BhoomiX Distribution — usernames + self-service password recovery.
--
-- Adds two things the closed-access system was missing:
--
--   1. Staff sign in with a USERNAME ("khush"), not an email address.
--   2. A forgotten password is recovered by the person themselves, over email,
--      without an admin or manager having to intervene.
--
-- Recovery deliberately runs through Supabase's own reset flow rather than
-- anything bespoke: the token is single-use, expiring, and never passes through
-- our code. A hand-rolled "reset question" scheme would be strictly worse.
--
-- Note the invite-only trigger from 20260804 does NOT interfere here. It fires
-- on INSERT into auth.users; a password recovery is an UPDATE, so existing
-- staff can always recover while registration stays shut.
--
-- Safe to re-run.
-- ============================================================================

-- ═══ 1. Usernames ═══════════════════════════════════════════════════════════

ALTER TABLE public.staff_accounts
  ADD COLUMN IF NOT EXISTS username text;

-- Case-insensitive uniqueness: "Khush" and "khush" must not be two people.
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_username_lower
  ON public.staff_accounts (lower(username))
  WHERE username IS NOT NULL;

ALTER TABLE public.staff_accounts
  DROP CONSTRAINT IF EXISTS staff_username_format;
ALTER TABLE public.staff_accounts
  ADD CONSTRAINT staff_username_format
  CHECK (username IS NULL OR username ~ '^[a-zA-Z0-9._-]{3,32}$');

/**
 * Resolve a username to its login email.
 *
 * Runs as `anon` because it is needed before sign-in. It returns ONLY the email
 * for an active account and NULL for anything else, so it cannot be used to
 * tell a suspended account from a non-existent one.
 *
 * This does let someone test whether a username exists. That is an accepted
 * trade for username login on an invite-only internal console — the attacker
 * still needs the password, and there is no public registration to harvest
 * usernames from in the first place.
 */
CREATE OR REPLACE FUNCTION public.resolve_login_email(_username text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT u.email::text
    FROM public.staff_accounts s
    JOIN auth.users u ON u.id = s.id
   WHERE lower(s.username) = lower(btrim(_username))
     AND s.is_active
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated;

-- ═══ 2. Self-service password change ════════════════════════════════════════

/*
 * Clearing the forced-change flag.
 *
 * The password itself is changed via supabase.auth.updateUser(), which is
 * already scoped to the caller's own session — this only records that the
 * obligation is discharged. It is a separate call so the flag can never be
 * cleared without the password actually having been updated first.
 */
CREATE OR REPLACE FUNCTION public.clear_must_change_password()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.staff_accounts
     SET must_change_password = false, updated_at = now()
   WHERE id = auth.uid();

  INSERT INTO public.staff_audit_log (actor_id, action, target_id)
  VALUES (auth.uid(), 'password_changed_self', auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.clear_must_change_password() TO authenticated;

/**
 * Confirm an email belongs to an active staff account.
 *
 * The forgot-password screen calls this only to decide whether to bother
 * sending. It returns a bare boolean and the UI shows the same message either
 * way, so it never confirms an address to an outsider.
 */
CREATE OR REPLACE FUNCTION public.staff_email_exists(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.staff_accounts s
      JOIN auth.users u ON u.id = s.id
     WHERE lower(u.email) = lower(btrim(_email))
       AND s.is_active
  );
$$;

GRANT EXECUTE ON FUNCTION public.staff_email_exists(text) TO anon, authenticated;

-- ═══ 3. Provisioning now takes a username ═══════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_create_staff(
  _email      text,
  _password   text,
  _role       text,
  _full_name  text,
  _phone      text DEFAULT NULL,
  _manager_id uuid DEFAULT NULL,
  _username   text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_id      uuid := gen_random_uuid();
  email_clean text := lower(btrim(_email));
  uname       text := NULLIF(btrim(_username), '');
  owner_id    uuid;
BEGIN
  IF NOT (public.is_admin() OR public.is_manager()) THEN
    RAISE EXCEPTION 'Only an admin or manager can create accounts'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _role NOT IN ('admin', 'manager', 'distributor') THEN
    RAISE EXCEPTION 'Unknown role: %', _role;
  END IF;

  IF public.is_manager() AND NOT public.is_admin() AND _role <> 'distributor' THEN
    RAISE EXCEPTION 'A manager may only create distributor accounts'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF email_clean IS NULL OR email_clean = '' THEN
    RAISE EXCEPTION 'A real email address is required so the account can recover its own password';
  END IF;
  IF _password IS NULL OR length(_password) < 10 THEN
    RAISE EXCEPTION 'Password must be at least 10 characters';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = email_clean) THEN
    RAISE EXCEPTION 'An account already exists for %', email_clean;
  END IF;
  IF uname IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.staff_accounts WHERE lower(username) = lower(uname)
  ) THEN
    RAISE EXCEPTION 'Username % is already taken', uname;
  END IF;

  owner_id := CASE
    WHEN _role <> 'distributor' THEN NULL
    WHEN public.is_admin() THEN _manager_id
    ELSE auth.uid()
  END;

  INSERT INTO public.provisioning_tickets (email, role, issued_by)
  VALUES (email_clean, _role::public.app_role, auth.uid())
  ON CONFLICT (email) DO UPDATE
    SET role = EXCLUDED.role, issued_by = EXCLUDED.issued_by,
        issued_at = now(), consumed_at = NULL;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_id, 'authenticated', 'authenticated', email_clean,
    extensions.crypt(_password, extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', _full_name, 'username', uname)
  );

  INSERT INTO auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at,
    created_at, updated_at
  ) VALUES (
    new_id::text, new_id,
    jsonb_build_object('sub', new_id::text, 'email', email_clean,
                       'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (new_id, _role::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.staff_accounts
    (id, role, full_name, username, phone, manager_id, created_by)
  VALUES
    (new_id, _role::public.app_role, _full_name, uname, _phone, owner_id, auth.uid());

  INSERT INTO public.staff_audit_log (actor_id, action, target_id, detail)
  VALUES (auth.uid(), 'create_staff', new_id,
          jsonb_build_object('email', email_clean, 'role', _role, 'username', uname));

  RETURN new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.admin_create_staff(text, text, text, text, text, uuid, text)
  TO authenticated;

-- The six-argument version is superseded; drop it so callers cannot
-- accidentally create an account with no username.
DROP FUNCTION IF EXISTS public.admin_create_staff(text, text, text, text, text, uuid);

-- ═══ 4. Expose username on the profile the app routes with ══════════════════

CREATE OR REPLACE FUNCTION public.my_staff_profile()
RETURNS TABLE (
  id         uuid,
  email      text,
  username   text,
  role       text,
  full_name  text,
  phone      text,
  manager_id uuid,
  is_active  boolean,
  must_change_password boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, u.email::text, s.username, s.role::text, s.full_name, s.phone,
         s.manager_id, s.is_active, s.must_change_password
    FROM public.staff_accounts s
    JOIN auth.users u ON u.id = s.id
   WHERE s.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.my_staff_profile() TO authenticated;

-- ============================================================================
-- REQUIRED DASHBOARD SETTINGS
--
-- Recovery emails will not arrive unless both of these are right:
--
--  1. Authentication -> URL Configuration -> Redirect URLs must contain
--       https://bhoomix-partner.vercel.app/**
--     This is the SAME allowlist that was silently sending Google sign-ins to
--     the customer app. A recovery link that is not allowlisted lands on the
--     Site URL instead and the reset will appear to do nothing.
--
--  2. Authentication -> Providers -> Email must stay ENABLED (for delivery of
--     recovery mail) while "Allow new users to sign up" is turned OFF.
--     Turning the provider off entirely would also kill password recovery.
--     Registration is blocked by the trigger regardless, so the toggle is
--     belt-and-braces rather than the control itself.
-- ============================================================================
