-- ============================================================================
-- BhoomiX — admin console.
--
-- Read-only windows onto users, partners and orders for the in-app admin
-- section, plus aggregate counters.
--
-- SECURITY MODEL — read before changing anything here:
--   * Every function is SECURITY DEFINER, because it must read auth.users and
--     cross RLS boundaries.
--   * Therefore every function opens with an explicit has_role(...,'admin')
--     check that RAISEs. Without that check, any signed-in partner could call
--     these and walk the entire customer table.
--   * Nothing here writes. Admin mutation deserves its own reviewed surface.
--
-- Safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Guard shared by every function below, so the rule lives in exactly one place.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.require_admin()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin access required' USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;

/** True when the caller is an admin — lets the UI hide the section entirely. */
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin');
$$;

-- ---------------------------------------------------------------------------
-- Users — auth.users joined to profiles and roles.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_users(
  _search text DEFAULT NULL,
  _limit  integer DEFAULT 200
)
RETURNS TABLE (
  id            uuid,
  email         text,
  display_name  text,
  avatar_url    text,
  roles         text[],
  is_partner    boolean,
  order_count   bigint,
  created_at    timestamptz,
  last_sign_in  timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    COALESCE(
      p.username,
      u.raw_user_meta_data ->> 'full_name',
      u.raw_user_meta_data ->> 'name'
    )::text,
    COALESCE(p.avatar_url, u.raw_user_meta_data ->> 'avatar_url')::text,
    COALESCE(
      (SELECT array_agg(ur.role::text ORDER BY ur.role) FROM public.user_roles ur
        WHERE ur.user_id = u.id),
      ARRAY[]::text[]
    ),
    EXISTS (SELECT 1 FROM public.partners pa WHERE pa.id = u.id),
    (SELECT COUNT(*) FROM public.orders o WHERE o.user_id = u.id),
    u.created_at,
    u.last_sign_in_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE _search IS NULL
     OR _search = ''
     OR u.email ILIKE '%' || _search || '%'
     OR COALESCE(p.username, '') ILIKE '%' || _search || '%'
     OR COALESCE(u.raw_user_meta_data ->> 'full_name', '') ILIKE '%' || _search || '%'
  ORDER BY u.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 1000));
END;
$$;

-- ---------------------------------------------------------------------------
-- Partners — registration plus delivery counters.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_partners(
  _search text DEFAULT NULL,
  _limit  integer DEFAULT 200
)
RETURNS TABLE (
  id              uuid,
  full_name       text,
  phone_number    text,
  vehicle_type    text,
  is_active       boolean,
  email           text,
  delivered_count bigint,
  active_count    bigint,
  created_at      timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();

  RETURN QUERY
  SELECT
    pa.id,
    pa.full_name::text,
    pa.phone_number::text,
    pa.vehicle_type::text,
    pa.is_active,
    u.email::text,
    (SELECT COUNT(*) FROM public.orders o
      WHERE o.assigned_partner = pa.id AND o.status = 'delivered'),
    (SELECT COUNT(*) FROM public.orders o
      WHERE o.assigned_partner = pa.id
        AND o.status IN ('accepted', 'in_transit', 'out_for_delivery')),
    pa.created_at
  FROM public.partners pa
  LEFT JOIN auth.users u ON u.id = pa.id
  WHERE _search IS NULL
     OR _search = ''
     OR pa.full_name ILIKE '%' || _search || '%'
     OR pa.phone_number ILIKE '%' || _search || '%'
     OR COALESCE(u.email, '') ILIKE '%' || _search || '%'
  ORDER BY pa.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 1000));
END;
$$;

-- ---------------------------------------------------------------------------
-- Orders — every order, with who placed it and who is carrying it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_orders(
  _search text DEFAULT NULL,
  _status text DEFAULT NULL,
  _limit  integer DEFAULT 200
)
RETURNS TABLE (
  id               uuid,
  order_number     text,
  status           text,
  total_amount     numeric,
  item_count       integer,
  customer_email   text,
  partner_name     text,
  delivery_address text,
  phone_number     text,
  minutes_elapsed  numeric,
  created_at       timestamptz,
  updated_at       timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();

  RETURN QUERY
  SELECT
    o.id,
    o.order_number::text,
    o.status::text,
    o.total_amount,
    COALESCE(jsonb_array_length(CASE
      WHEN jsonb_typeof(o.items::jsonb) = 'array' THEN o.items::jsonb
      ELSE '[]'::jsonb
    END), 0),
    cu.email::text,
    pa.full_name::text,
    o.delivery_address::text,
    o.phone_number::text,
    ROUND(EXTRACT(EPOCH FROM (now() - o.created_at)) / 60)::numeric,
    o.created_at,
    o.updated_at
  FROM public.orders o
  LEFT JOIN auth.users cu ON cu.id = o.user_id
  LEFT JOIN public.partners pa ON pa.id = o.assigned_partner
  WHERE (_status IS NULL OR _status = '' OR o.status = _status)
    AND (
      _search IS NULL OR _search = ''
      OR o.order_number ILIKE '%' || _search || '%'
      OR COALESCE(o.delivery_address, '') ILIKE '%' || _search || '%'
      OR COALESCE(cu.email, '') ILIKE '%' || _search || '%'
      OR COALESCE(pa.full_name, '') ILIKE '%' || _search || '%'
    )
  ORDER BY o.created_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 1000));
END;
$$;

-- ---------------------------------------------------------------------------
-- Headline counters for the overview strip.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_stats()
RETURNS TABLE (
  total_users      bigint,
  total_partners   bigint,
  active_partners  bigint,
  total_orders     bigint,
  pending_orders   bigint,
  active_orders    bigint,
  delivered_orders bigint,
  cancelled_orders bigint,
  orders_today     bigint,
  revenue_total    numeric,
  revenue_today    numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_admin();

  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM auth.users),
    (SELECT COUNT(*) FROM public.partners),
    (SELECT COUNT(*) FROM public.partners WHERE is_active),
    (SELECT COUNT(*) FROM public.orders),
    (SELECT COUNT(*) FROM public.orders WHERE status = 'pending'),
    (SELECT COUNT(*) FROM public.orders
      WHERE status IN ('accepted', 'in_transit', 'out_for_delivery')),
    (SELECT COUNT(*) FROM public.orders WHERE status = 'delivered'),
    (SELECT COUNT(*) FROM public.orders WHERE status = 'cancelled'),
    (SELECT COUNT(*) FROM public.orders WHERE created_at >= date_trunc('day', now())),
    COALESCE((SELECT SUM(total_amount) FROM public.orders WHERE status = 'delivered'), 0),
    COALESCE((SELECT SUM(total_amount) FROM public.orders
       WHERE status = 'delivered' AND created_at >= date_trunc('day', now())), 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin()                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_stats()                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, integer)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_partners(text, integer)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_orders(text, text, integer)  TO authenticated;

-- require_admin is internal plumbing; nothing should call it directly.
REVOKE EXECUTE ON FUNCTION public.require_admin() FROM anon, authenticated;

-- ============================================================================
-- GRANT YOURSELF ACCESS
--
-- The console stays invisible until your account holds the admin role. Run
-- this once, with your own login email:
--
--   INSERT INTO public.user_roles (user_id, role)
--   SELECT id, 'admin' FROM auth.users WHERE email = 'you@example.com'
--   ON CONFLICT (user_id, role) DO NOTHING;
--
-- ============================================================================
