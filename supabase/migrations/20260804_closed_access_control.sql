-- ============================================================================
-- BhoomiX Distribution — closed access control.
--
-- Turns an open consumer signup into an invite-only staff system with three
-- tiers:
--
--   admin        creates managers and distributors, sees every rupee
--   manager      creates distributors, oversees their sales
--   distributor  inventory, accepts and ships orders
--
-- NOBODY CAN SELF-REGISTER. Accounts exist only because an admin or manager
-- created them.
--
-- ---------------------------------------------------------------------------
-- LOOPHOLES THIS CLOSES (each was a real way in)
--
--  1. Public email signup was enabled — anyone could create an account.
--  2. Google OAuth auto-provisioned accounts. Disabling *email* signup alone
--     would NOT have stopped this: the OAuth callback creates auth.users rows
--     directly. This is the hole most people miss.
--  3. "User roles are viewable by everyone" USING (true) let any caller list
--     exactly who the admins are — free reconnaissance for a targeted attack.
--  4. "Profiles are viewable by everyone" USING (true) leaked every user row.
--  5. "Partners can insert their own profile" was a self-registration path
--     into a privileged table.
--  6. Role checks lived only in the client, which is not a boundary.
--
-- The defence is deliberately in the DATABASE, not in dashboard settings: a
-- toggle can be flipped back by accident, a trigger cannot be bypassed by any
-- client, key, or provider.
-- ---------------------------------------------------------------------------
--
-- Safe to re-run.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ═══ 1. Roles ═══════════════════════════════════════════════════════════════

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'distributor';

COMMIT;  -- new enum values must be committed before they can be used below

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'manager'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_distributor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'distributor'
  );
$$;

/** Anyone who belongs inside this console at all. */
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = auth.uid() AND role IN ('admin', 'manager', 'distributor')
  );
$$;

/**
 * Highest-privilege role held by the caller — the app routes its whole UI on
 * this one value. 'distributor' was missing from the old ordering, so a
 * distributor silently fell through to 'user'.
 */
CREATE OR REPLACE FUNCTION public.my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT role::text FROM public.user_roles WHERE user_id = auth.uid()
    ORDER BY CASE role::text
      WHEN 'admin'       THEN 1
      WHEN 'manager'     THEN 2
      WHEN 'distributor' THEN 3
      WHEN 'partner'     THEN 4
      ELSE 5 END
    LIMIT 1), 'user');
$$;

GRANT EXECUTE ON FUNCTION public.my_role()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_distributor() TO authenticated;

-- ═══ 2. Staff directory and hierarchy ═══════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.staff_accounts (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role        public.app_role NOT NULL,
  full_name   text NOT NULL,
  phone       text,
  -- Which manager owns this distributor. NULL for admins and managers.
  manager_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Who provisioned the account; never null except for the bootstrap admin.
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_active   boolean NOT NULL DEFAULT true,
  -- Forces a change on first login for admin-set passwords.
  must_change_password boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_role_valid CHECK (role IN ('admin', 'manager', 'distributor'))
);

CREATE INDEX IF NOT EXISTS idx_staff_manager ON public.staff_accounts(manager_id);
CREATE INDEX IF NOT EXISTS idx_staff_role    ON public.staff_accounts(role);

ALTER TABLE public.staff_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff read own record" ON public.staff_accounts;
CREATE POLICY "Staff read own record" ON public.staff_accounts FOR SELECT
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Managers read their distributors" ON public.staff_accounts;
CREATE POLICY "Managers read their distributors" ON public.staff_accounts FOR SELECT
  USING (public.is_manager() AND manager_id = auth.uid());

DROP POLICY IF EXISTS "Admins read all staff" ON public.staff_accounts;
CREATE POLICY "Admins read all staff" ON public.staff_accounts FOR SELECT
  USING (public.is_admin());

-- Writes go exclusively through the audited provisioning RPCs below.
DROP POLICY IF EXISTS "No direct staff writes" ON public.staff_accounts;
CREATE POLICY "No direct staff writes" ON public.staff_accounts FOR ALL
  USING (false) WITH CHECK (false);

-- ═══ 3. THE LOCK: no account exists unless it was provisioned ═══════════════

/*
 * Every legitimate account creation inserts a row here first. The trigger on
 * auth.users rejects anything without one — so email signup, Google OAuth, a
 * leaked anon key, and any future provider are all refused identically.
 */
CREATE TABLE IF NOT EXISTS public.provisioning_tickets (
  email       text PRIMARY KEY,
  role        public.app_role NOT NULL,
  issued_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  issued_at   timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz
);

ALTER TABLE public.provisioning_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read tickets" ON public.provisioning_tickets;
CREATE POLICY "Admins read tickets" ON public.provisioning_tickets FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "No direct ticket writes" ON public.provisioning_tickets;
CREATE POLICY "No direct ticket writes" ON public.provisioning_tickets FOR ALL
  USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.enforce_invite_only_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ticket public.provisioning_tickets%ROWTYPE;
BEGIN
  SELECT * INTO ticket
    FROM public.provisioning_tickets
   WHERE email = lower(NEW.email)
     AND consumed_at IS NULL;

  IF ticket.email IS NULL THEN
    RAISE EXCEPTION
      'Registration is closed. Accounts are created by an administrator.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.provisioning_tickets
     SET consumed_at = now()
   WHERE email = ticket.email;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invite_only_signup ON auth.users;
CREATE TRIGGER trg_invite_only_signup
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_invite_only_signup();

-- ═══ 4. Close the read leaks ════════════════════════════════════════════════

-- Anyone could previously list every admin in the system.
DROP POLICY IF EXISTS "User roles are viewable by everyone" ON public.user_roles;

DROP POLICY IF EXISTS "Users read own roles" ON public.user_roles;
CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

-- Anyone could previously read every profile row.
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

DROP POLICY IF EXISTS "Staff read profiles" ON public.profiles;
CREATE POLICY "Staff read profiles" ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.is_staff());

-- Self-registration into a privileged table.
DROP POLICY IF EXISTS "Partners can insert their own profile" ON public.partners;

-- ═══ 5. Audited provisioning ════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.staff_audit_log (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action     text NOT NULL,
  target_id  uuid,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read audit log" ON public.staff_audit_log;
CREATE POLICY "Admins read audit log" ON public.staff_audit_log FOR SELECT
  USING (public.is_admin());

DROP POLICY IF EXISTS "No direct audit writes" ON public.staff_audit_log;
CREATE POLICY "No direct audit writes" ON public.staff_audit_log FOR ALL
  USING (false) WITH CHECK (false);

/**
 * Create a staff account.
 *
 *   admin   -> may create managers and distributors
 *   manager -> may create distributors only, always owned by themselves
 *
 * Writes auth.users directly (bcrypt via pgcrypto) because the Admin API needs
 * a service_role key, which must never reach a browser.
 */
CREATE OR REPLACE FUNCTION public.admin_create_staff(
  _email      text,
  _password   text,
  _role       text,
  _full_name  text,
  _phone      text DEFAULT NULL,
  _manager_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_id      uuid := gen_random_uuid();
  email_clean text := lower(btrim(_email));
  owner_id    uuid;
BEGIN
  IF NOT (public.is_admin() OR public.is_manager()) THEN
    RAISE EXCEPTION 'Only an admin or manager can create accounts'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _role NOT IN ('admin', 'manager', 'distributor') THEN
    RAISE EXCEPTION 'Unknown role: %', _role;
  END IF;

  -- A manager must not be able to mint peers or admins.
  IF public.is_manager() AND NOT public.is_admin() AND _role <> 'distributor' THEN
    RAISE EXCEPTION 'A manager may only create distributor accounts'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF email_clean IS NULL OR email_clean = '' THEN
    RAISE EXCEPTION 'Email is required';
  END IF;
  IF _password IS NULL OR length(_password) < 10 THEN
    RAISE EXCEPTION 'Password must be at least 10 characters';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = email_clean) THEN
    RAISE EXCEPTION 'An account already exists for %', email_clean;
  END IF;

  -- A manager owns everyone they create; an admin may assign explicitly.
  owner_id := CASE
    WHEN _role <> 'distributor' THEN NULL
    WHEN public.is_admin() THEN _manager_id
    ELSE auth.uid()
  END;

  -- The invite-only trigger demands a ticket, so issue one for ourselves.
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
    jsonb_build_object('full_name', _full_name)
  );

  -- Required by GoTrue for password logins to resolve.
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

  INSERT INTO public.staff_accounts (id, role, full_name, phone, manager_id, created_by)
  VALUES (new_id, _role::public.app_role, _full_name, _phone, owner_id, auth.uid());

  INSERT INTO public.staff_audit_log (actor_id, action, target_id, detail)
  VALUES (auth.uid(), 'create_staff', new_id,
          jsonb_build_object('email', email_clean, 'role', _role));

  RETURN new_id;
END;
$$;

/** Reset another account's password. Never returns or logs the password. */
CREATE OR REPLACE FUNCTION public.admin_set_password(
  _user_id  uuid,
  _password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  target public.staff_accounts%ROWTYPE;
BEGIN
  SELECT * INTO target FROM public.staff_accounts WHERE id = _user_id;
  IF target.id IS NULL THEN
    RAISE EXCEPTION 'No such staff account';
  END IF;

  IF NOT (
    public.is_admin()
    OR (public.is_manager() AND target.manager_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not permitted to reset this password'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _password IS NULL OR length(_password) < 10 THEN
    RAISE EXCEPTION 'Password must be at least 10 characters';
  END IF;

  UPDATE auth.users
     SET encrypted_password = extensions.crypt(_password, extensions.gen_salt('bf')),
         updated_at = now()
   WHERE id = _user_id;

  UPDATE public.staff_accounts
     SET must_change_password = true, updated_at = now()
   WHERE id = _user_id;

  INSERT INTO public.staff_audit_log (actor_id, action, target_id)
  VALUES (auth.uid(), 'reset_password', _user_id);
END;
$$;

/** Suspend or restore an account without deleting its history. */
CREATE OR REPLACE FUNCTION public.admin_set_active(_user_id uuid, _active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target public.staff_accounts%ROWTYPE;
BEGIN
  SELECT * INTO target FROM public.staff_accounts WHERE id = _user_id;
  IF target.id IS NULL THEN
    RAISE EXCEPTION 'No such staff account';
  END IF;

  IF NOT (
    public.is_admin()
    OR (public.is_manager() AND target.manager_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not permitted to change this account'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Never let the last remaining admin lock everyone out.
  IF target.role = 'admin' AND NOT _active THEN
    IF (SELECT COUNT(*) FROM public.staff_accounts
         WHERE role = 'admin' AND is_active AND id <> _user_id) = 0 THEN
      RAISE EXCEPTION 'Cannot deactivate the last active admin';
    END IF;
  END IF;

  UPDATE public.staff_accounts
     SET is_active = _active, updated_at = now()
   WHERE id = _user_id;

  INSERT INTO public.staff_audit_log (actor_id, action, target_id, detail)
  VALUES (auth.uid(), CASE WHEN _active THEN 'activate' ELSE 'deactivate' END,
          _user_id, jsonb_build_object('role', target.role));
END;
$$;

/** Who am I, and what should the app render? */
CREATE OR REPLACE FUNCTION public.my_staff_profile()
RETURNS TABLE (
  id         uuid,
  email      text,
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
  SELECT s.id, u.email::text, s.role::text, s.full_name, s.phone,
         s.manager_id, s.is_active, s.must_change_password
    FROM public.staff_accounts s
    JOIN auth.users u ON u.id = s.id
   WHERE s.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.my_staff_profile()                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_active(uuid, boolean)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_password(uuid, text)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_staff(text, text, text, text, text, uuid)
  TO authenticated;

-- The signup guard is trigger plumbing; nothing may invoke it directly.
REVOKE EXECUTE ON FUNCTION public.enforce_invite_only_signup() FROM anon, authenticated;

-- ============================================================================
-- BOOTSTRAP THE FIRST ADMIN
--
-- Deliberately NOT executed here, and the password is deliberately NOT written
-- into this file — anything committed to the repo is effectively public.
--
-- Run the block below ONCE in the Supabase SQL Editor, replacing the two
-- placeholders. Then sign in and change the password immediately.
--
--   DO $bootstrap$
--   DECLARE
--     admin_id uuid := gen_random_uuid();
--     admin_email text := 'REPLACE_WITH_YOUR_EMAIL';
--     admin_pass  text := 'REPLACE_WITH_A_NEW_PASSWORD';
--   BEGIN
--     INSERT INTO public.provisioning_tickets (email, role)
--     VALUES (lower(admin_email), 'admin')
--     ON CONFLICT (email) DO UPDATE SET consumed_at = NULL, role = 'admin';
--
--     INSERT INTO auth.users (
--       instance_id, id, aud, role, email, encrypted_password,
--       email_confirmed_at, created_at, updated_at,
--       raw_app_meta_data, raw_user_meta_data
--     ) VALUES (
--       '00000000-0000-0000-0000-000000000000',
--       admin_id, 'authenticated', 'authenticated', lower(admin_email),
--       extensions.crypt(admin_pass, extensions.gen_salt('bf')),
--       now(), now(), now(),
--       '{"provider":"email","providers":["email"]}'::jsonb,
--       jsonb_build_object('full_name', 'Khush')
--     );
--
--     INSERT INTO auth.identities (
--       provider_id, user_id, identity_data, provider,
--       last_sign_in_at, created_at, updated_at
--     ) VALUES (
--       admin_id::text, admin_id,
--       jsonb_build_object('sub', admin_id::text, 'email', lower(admin_email),
--                          'email_verified', true, 'phone_verified', false),
--       'email', now(), now(), now()
--     );
--
--     INSERT INTO public.user_roles (user_id, role) VALUES (admin_id, 'admin')
--     ON CONFLICT (user_id, role) DO NOTHING;
--
--     INSERT INTO public.staff_accounts (id, role, full_name, must_change_password)
--     VALUES (admin_id, 'admin', 'Khush', true);
--   END
--   $bootstrap$;
--
-- ============================================================================
