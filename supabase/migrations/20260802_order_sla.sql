-- ============================================================================
-- BhoomiX — delivery SLA and order expiry.
--
-- An order must reach `delivered` within 80 minutes (1h 20m) of being placed.
-- Past that it is expired: unclaimed orders are cancelled outright, and orders
-- a partner is still holding are released so they stop occupying the partner's
-- active slot.
--
-- Why server-side: the app already shows live countdowns and hides stale orders
-- from the pool, but a client cannot be trusted to expire anything — close the
-- tab and its timers stop. This is the authority.
--
-- Modelled on how quick-commerce dispatch actually runs: a warning tier before
-- the deadline (so a late run can still be rescued) and a hard tier after it,
-- rather than a single silent cutoff.
--
-- Safe to re-run.
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS partner;
REVOKE ALL ON SCHEMA partner FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tunable SLA policy — changing the window must not require a redeploy.
-- Keep these in step with src/lib/sla.ts.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner.sla_config (
  id                 boolean PRIMARY KEY DEFAULT true CHECK (id),
  sla_minutes        integer NOT NULL DEFAULT 80,   -- placement -> delivered
  at_risk_minutes    integer NOT NULL DEFAULT 60,   -- warn from here
  accept_headroom_min integer NOT NULL DEFAULT 15,  -- too late to offer
  updated_at         timestamptz NOT NULL DEFAULT now()
);

INSERT INTO partner.sla_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Audit trail of expiries, so a partner is never silently blamed for an order
-- the system took away from them.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner.expired_orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  partner_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status_at_expiry text NOT NULL,
  minutes_elapsed  numeric NOT NULL,
  expired_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_expired_partner
  ON partner.expired_orders(partner_id, expired_at DESC);

ALTER TABLE partner.sla_config     ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner.expired_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Partners read own expiries" ON partner.expired_orders;
CREATE POLICY "Partners read own expiries"
  ON partner.expired_orders FOR SELECT
  USING (partner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins manage sla config" ON partner.sla_config;
CREATE POLICY "Admins manage sla config"
  ON partner.sla_config FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- The sweeper.
--
-- Returns how many orders it expired so a scheduled run can be monitored.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION partner.expire_stale_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = partner, public
AS $$
DECLARE
  cfg      partner.sla_config%ROWTYPE;
  cutoff   timestamptz;
  expired  integer := 0;
BEGIN
  SELECT * INTO cfg FROM partner.sla_config WHERE id;
  cutoff := now() - make_interval(mins => cfg.sla_minutes);

  -- Record first: once the row is cancelled the original status is lost.
  INSERT INTO partner.expired_orders (order_id, partner_id, status_at_expiry, minutes_elapsed)
  SELECT o.id,
         o.assigned_partner,
         o.status,
         EXTRACT(EPOCH FROM (now() - o.created_at)) / 60
    FROM public.orders o
   WHERE o.created_at < cutoff
     AND o.status IN ('pending', 'accepted', 'in_transit', 'out_for_delivery')
  ON CONFLICT (order_id) DO NOTHING;

  /*
   * Cancel the order and release the partner. Detaching assigned_partner is
   * deliberate: the delivery never completed, so it must not sit in anyone's
   * active list, and the payout trigger (which only fires on `delivered`)
   * correctly never pays out for it.
   */
  UPDATE public.orders
     SET status = 'cancelled',
         assigned_partner = NULL
   WHERE created_at < cutoff
     AND status IN ('pending', 'accepted', 'in_transit', 'out_for_delivery');

  GET DIAGNOSTICS expired = ROW_COUNT;
  RETURN expired;
END;
$$;

-- ---------------------------------------------------------------------------
-- Belt and braces: refuse to claim an order that is already past its window,
-- even if a stale client sends the update.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION partner.reject_expired_claim()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = partner, public
AS $$
DECLARE
  cfg partner.sla_config%ROWTYPE;
BEGIN
  -- Only guards a partner picking an order up, not admin edits or cancellation.
  IF NEW.assigned_partner IS NOT NULL
     AND OLD.assigned_partner IS NULL
     AND NEW.status = 'accepted' THEN

    SELECT * INTO cfg FROM partner.sla_config WHERE id;

    IF NEW.created_at < now() - make_interval(mins => cfg.sla_minutes) THEN
      RAISE EXCEPTION 'This order passed its % minute delivery window and has expired.',
        cfg.sla_minutes
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reject_expired_claim ON public.orders;
CREATE TRIGGER trg_reject_expired_claim
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION partner.reject_expired_claim();

-- ---------------------------------------------------------------------------
-- Public surface
-- ---------------------------------------------------------------------------

/**
 * Run the sweeper. Exposed so it can be driven by pg_cron, an Edge Function,
 * or any external scheduler without granting access to the partner schema.
 */
CREATE OR REPLACE FUNCTION public.expire_stale_orders()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = partner, public
AS $$
  SELECT partner.expire_stale_orders();
$$;

/** The live SLA policy, so the client can render the real numbers. */
CREATE OR REPLACE FUNCTION public.get_sla_config()
RETURNS TABLE (
  sla_minutes         integer,
  at_risk_minutes     integer,
  accept_headroom_min integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = partner, public
AS $$
  SELECT c.sla_minutes, c.at_risk_minutes, c.accept_headroom_min
    FROM partner.sla_config c WHERE c.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_sla_config()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_orders() TO authenticated;

-- ---------------------------------------------------------------------------
-- Schedule it. pg_cron is available on Supabase but must be enabled once.
-- If this block errors, enable the extension in Database -> Extensions and
-- re-run, or call public.expire_stale_orders() from an external scheduler.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('bhoomix-expire-orders')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bhoomix-expire-orders');

    PERFORM cron.schedule(
      'bhoomix-expire-orders',
      '* * * * *',                       -- every minute
      $cron$SELECT public.expire_stale_orders();$cron$
    );
  ELSE
    RAISE NOTICE
      'pg_cron not installed — enable it, or call public.expire_stale_orders() externally.';
  END IF;
END;
$$;
