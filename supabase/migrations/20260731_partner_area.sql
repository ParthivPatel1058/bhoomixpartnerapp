-- ============================================================================
-- BhoomiX Partner — dedicated `partner` schema inside the SHARED project.
--
-- Same Supabase project as BhoomiX Main (tzmuivqtlnosgkubhyft), but partner
-- operational data lives in its own schema instead of being mixed into the
-- customer-facing `public` tables.
--
--   public.*   -> customers: orders, cart_items, profiles  (unchanged)
--   partner.*  -> partners:  payouts, delivery_events, ratings, payout_config
--
-- The schema is deliberately NOT exposed to PostgREST. Everything the app needs
-- is reached through SECURITY DEFINER functions in `public`, so no "Exposed
-- schemas" dashboard change is required and the tables cannot be queried
-- directly by a client.
--
-- Safe to re-run: every statement is idempotent.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS partner;

-- Clients never touch this schema directly; only SECURITY DEFINER functions do.
REVOKE ALL ON SCHEMA partner FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Payout configuration (single row)
--
-- Replaces the payout constants the app currently hard-codes client-side, so
-- rates can change without shipping a new build and every partner agrees on
-- what a delivery was worth.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner.payout_config (
  id           boolean PRIMARY KEY DEFAULT true CHECK (id),
  base_fare    numeric NOT NULL DEFAULT 30,
  per_km       numeric NOT NULL DEFAULT 7,
  order_share  numeric NOT NULL DEFAULT 0.05,
  min_payout   numeric NOT NULL DEFAULT 35,
  assumed_km   numeric NOT NULL DEFAULT 3,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO partner.payout_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Delivery event log — audit trail of every status transition.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner.delivery_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  partner_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  from_status text,
  to_status   text NOT NULL,
  lat         numeric,
  lng         numeric,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_events_order   ON partner.delivery_events(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_events_partner ON partner.delivery_events(partner_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Settled payouts — one row per delivered order.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner.payouts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  partner_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      numeric NOT NULL CHECK (amount >= 0),
  distance_km numeric,
  status      text NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'paid', 'cancelled')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  paid_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_payouts_partner ON partner.payouts(partner_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Ratings — real customer feedback, replacing the hard-coded 4.9 in the UI.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner.ratings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id   uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rated_by   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating     smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ratings_partner ON partner.ratings(partner_id);

-- ---------------------------------------------------------------------------
-- RLS: defence in depth. Nothing reaches these tables except through the
-- SECURITY DEFINER functions below, but enable it anyway so a future schema
-- exposure cannot silently leak data.
-- ---------------------------------------------------------------------------
ALTER TABLE partner.payout_config    ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner.delivery_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner.payouts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner.ratings          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Partners read own payouts" ON partner.payouts;
CREATE POLICY "Partners read own payouts"
  ON partner.payouts FOR SELECT
  USING (partner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Partners read own events" ON partner.delivery_events;
CREATE POLICY "Partners read own events"
  ON partner.delivery_events FOR SELECT
  USING (partner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Partners read own ratings" ON partner.ratings;
CREATE POLICY "Partners read own ratings"
  ON partner.ratings FOR SELECT
  USING (partner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage payout config" ON partner.payout_config;
CREATE POLICY "Admins manage payout config"
  ON partner.payout_config FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- Payout maths, server-side and authoritative.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION partner.calculate_payout(
  _total_amount numeric,
  _distance_km  numeric
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = partner, public
AS $$
DECLARE
  cfg partner.payout_config%ROWTYPE;
  km  numeric;
BEGIN
  SELECT * INTO cfg FROM partner.payout_config WHERE id;
  km := COALESCE(NULLIF(_distance_km, 0), cfg.assumed_km);

  RETURN GREATEST(
    cfg.min_payout,
    ROUND(cfg.base_fare + (km * cfg.per_km) + (COALESCE(_total_amount, 0) * cfg.order_share))
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Bridge between the two apps: every status change a partner writes to
-- public.orders is logged here, and delivery settles a payout automatically.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION partner.handle_order_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = partner, public
AS $$
DECLARE
  km numeric;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  INSERT INTO partner.delivery_events (order_id, partner_id, from_status, to_status, lat, lng)
  VALUES (NEW.id, NEW.assigned_partner, OLD.status, NEW.status, NEW.gps_lat, NEW.gps_lng);

  IF NEW.status = 'delivered' AND NEW.assigned_partner IS NOT NULL THEN
    -- Straight-line km between where the order was accepted and the drop-off.
    SELECT ROUND(
             (6371 * acos(
               LEAST(1, GREATEST(-1,
                 cos(radians(e.lat)) * cos(radians(NEW.gps_lat)) *
                 cos(radians(NEW.gps_lng) - radians(e.lng)) +
                 sin(radians(e.lat)) * sin(radians(NEW.gps_lat))
               ))
             ))::numeric, 2)
      INTO km
      FROM partner.delivery_events e
     WHERE e.order_id = NEW.id
       AND e.to_status = 'accepted'
       AND e.lat IS NOT NULL AND e.lng IS NOT NULL
     ORDER BY e.created_at
     LIMIT 1;

    INSERT INTO partner.payouts (order_id, partner_id, amount, distance_km)
    VALUES (
      NEW.id,
      NEW.assigned_partner,
      partner.calculate_payout(NEW.total_amount, km),
      km
    )
    ON CONFLICT (order_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partner_order_status ON public.orders;
CREATE TRIGGER trg_partner_order_status
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION partner.handle_order_status_change();

-- ---------------------------------------------------------------------------
-- Public API surface. These are the ONLY way the app reaches `partner.*`.
-- ---------------------------------------------------------------------------

-- Aggregate earnings + rating for the calling partner.
CREATE OR REPLACE FUNCTION public.get_partner_stats()
RETURNS TABLE (
  earned_total  numeric,
  earned_today  numeric,
  earned_week   numeric,
  trips_total   bigint,
  trips_today   bigint,
  avg_rating    numeric,
  rating_count  bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = partner, public
AS $$
BEGIN
  IF NOT public.is_partner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: User is not a registered partner';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE((SELECT SUM(p.amount) FROM partner.payouts p
               WHERE p.partner_id = auth.uid() AND p.status <> 'cancelled'), 0),
    COALESCE((SELECT SUM(p.amount) FROM partner.payouts p
               WHERE p.partner_id = auth.uid() AND p.status <> 'cancelled'
                 AND p.created_at >= date_trunc('day', now())), 0),
    COALESCE((SELECT SUM(p.amount) FROM partner.payouts p
               WHERE p.partner_id = auth.uid() AND p.status <> 'cancelled'
                 AND p.created_at >= date_trunc('week', now())), 0),
    (SELECT COUNT(*) FROM partner.payouts p
       WHERE p.partner_id = auth.uid() AND p.status <> 'cancelled'),
    (SELECT COUNT(*) FROM partner.payouts p
       WHERE p.partner_id = auth.uid() AND p.status <> 'cancelled'
         AND p.created_at >= date_trunc('day', now())),
    (SELECT ROUND(AVG(r.rating)::numeric, 2) FROM partner.ratings r
       WHERE r.partner_id = auth.uid()),
    (SELECT COUNT(*) FROM partner.ratings r WHERE r.partner_id = auth.uid());
END;
$$;

-- Settled payout ledger for the calling partner.
CREATE OR REPLACE FUNCTION public.get_partner_payouts(_limit integer DEFAULT 100)
RETURNS TABLE (
  order_id     uuid,
  order_number text,
  amount       numeric,
  distance_km  numeric,
  status       text,
  created_at   timestamptz,
  paid_at      timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = partner, public
AS $$
BEGIN
  IF NOT public.is_partner(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: User is not a registered partner';
  END IF;

  RETURN QUERY
  SELECT p.order_id, o.order_number, p.amount, p.distance_km,
         p.status, p.created_at, p.paid_at
    FROM partner.payouts p
    JOIN public.orders o ON o.id = p.order_id
   WHERE p.partner_id = auth.uid()
   ORDER BY p.created_at DESC
   LIMIT GREATEST(1, LEAST(_limit, 500));
END;
$$;

-- Customer-facing: rate the partner who delivered your order.
CREATE OR REPLACE FUNCTION public.rate_delivery(
  _order_id uuid,
  _rating   smallint,
  _comment  text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = partner, public
AS $$
DECLARE
  ord public.orders%ROWTYPE;
BEGIN
  SELECT * INTO ord FROM public.orders WHERE id = _order_id;

  IF ord.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF ord.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'You can only rate your own orders';
  END IF;
  IF ord.status <> 'delivered' OR ord.assigned_partner IS NULL THEN
    RAISE EXCEPTION 'Only delivered orders can be rated';
  END IF;

  INSERT INTO partner.ratings (order_id, partner_id, rated_by, rating, comment)
  VALUES (_order_id, ord.assigned_partner, auth.uid(), _rating, _comment)
  ON CONFLICT (order_id) DO UPDATE
    SET rating = EXCLUDED.rating, comment = EXCLUDED.comment;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_partner_stats()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_partner_payouts(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rate_delivery(uuid, smallint, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: settle payouts for orders already delivered before this migration.
-- ---------------------------------------------------------------------------
INSERT INTO partner.payouts (order_id, partner_id, amount, created_at)
SELECT o.id, o.assigned_partner,
       partner.calculate_payout(o.total_amount, NULL),
       o.updated_at
  FROM public.orders o
 WHERE o.status = 'delivered'
   AND o.assigned_partner IS NOT NULL
ON CONFLICT (order_id) DO NOTHING;
