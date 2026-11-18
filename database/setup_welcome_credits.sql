-- Run after setup_auth.sql and setup_verified_credit_ledger.sql.
-- Only accounts inserted after this trigger is installed can earn the grant.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'auth.users'::regclass
      AND tgname = 'on_auth_user_created'
      AND tgfoid = pg_catalog.to_regprocedure('public.handle_new_user()')
      AND tgenabled IN ('O', 'A')
      AND tgtype = 5 -- AFTER INSERT FOR EACH ROW
  ) THEN
    RAISE EXCEPTION 'Expected signup profile trigger is missing or disabled. No welcome-credit changes applied.';
  END IF;
END;
$$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_credits_pending boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.grant_verified_welcome_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  welcome_amount constant integer := 12;
  new_balance integer;
BEGIN
  IF NEW.email IS NULL OR NEW.is_anonymous THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Only the first confirmation of an eligible new account can grant credits.
    IF OLD.email_confirmed_at IS NOT NULL OR NEW.email_confirmed_at IS NULL THEN
      RETURN NEW;
    END IF;
  ELSIF NEW.email_confirmed_at IS NULL THEN
    UPDATE public.profiles SET welcome_credits_pending = true WHERE id = NEW.id;
    RETURN NEW;
  END IF;

  UPDATE public.profiles
  SET credits = COALESCE(credits, 0) + welcome_amount,
      welcome_credits_pending = false
  WHERE id = NEW.id
    AND (TG_OP = 'INSERT' OR welcome_credits_pending)
  RETURNING credits INTO new_balance;

  IF FOUND THEN
    INSERT INTO public.credit_logs (
      user_id, action, amount, feature, transaction_type, transaction_status,
      balance_before, balance_after, idempotency_key, verified_at
    ) VALUES (
      NEW.id, 'Welcome credits', welcome_amount, 'welcome_credits', 'grant', 'succeeded',
      new_balance - welcome_amount, new_balance, 'welcome_credits:' || NEW.id, now()
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.grant_verified_welcome_credits() FROM PUBLIC, anon, authenticated;

-- PostgreSQL fires these triggers alphabetically. on_auth_user_created creates
-- the profile before on_auth_user_welcome_credits reads or writes it.
CREATE OR REPLACE TRIGGER on_auth_user_welcome_credits
  AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.grant_verified_welcome_credits();

COMMIT;
