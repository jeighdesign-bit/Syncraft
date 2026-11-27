-- Run after setup_auth.sql and setup_verified_credit_ledger.sql.
-- Signup bonus paused. Only accounts already marked pending before the pause
-- may finish claiming their grant by confirming their email.
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
  UPDATE public.profiles
  SET credits = COALESCE(credits, 0) + welcome_amount,
      welcome_credits_pending = false
  WHERE id = NEW.id
    AND welcome_credits_pending
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

CREATE OR REPLACE TRIGGER on_auth_user_welcome_credits
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL
        AND NEW.email IS NOT NULL AND NOT NEW.is_anonymous)
  EXECUTE FUNCTION public.grant_verified_welcome_credits();

COMMIT;
