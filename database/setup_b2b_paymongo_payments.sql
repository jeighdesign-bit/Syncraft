-- PayMongo QR Ph payments for Syncraft B2B/API credit wallets.
-- Apply after database/b2b_schema.sql. Amounts are stored in PHP centavos.

CREATE TABLE IF NOT EXISTS public.b2b_paymongo_payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES public.b2b_companies(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email text NOT NULL,
  plan text NOT NULL CHECK (plan IN ('starter', 'pro', 'studio')),
  credits integer NOT NULL CHECK (credits > 0),
  amount integer NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'PHP',
  paymongo_intent_id text,
  paymongo_payment_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'expired')),
  credited_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.b2b_paymongo_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own B2B PayMongo payments" ON public.b2b_paymongo_payments;
CREATE POLICY "Users can view their own B2B PayMongo payments"
ON public.b2b_paymongo_payments FOR SELECT
USING (auth.uid() = user_id);

CREATE UNIQUE INDEX IF NOT EXISTS b2b_paymongo_intent_unique
ON public.b2b_paymongo_payments (paymongo_intent_id)
WHERE paymongo_intent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS b2b_paymongo_payment_unique
ON public.b2b_paymongo_payments (paymongo_payment_id)
WHERE paymongo_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS b2b_paymongo_user_created_idx
ON public.b2b_paymongo_payments (user_id, created_at DESC);

DROP TRIGGER IF EXISTS set_b2b_paymongo_payments_updated_at ON public.b2b_paymongo_payments;
CREATE TRIGGER set_b2b_paymongo_payments_updated_at
BEFORE UPDATE ON public.b2b_paymongo_payments
FOR EACH ROW
EXECUTE FUNCTION public.set_paymongo_payments_updated_at();

CREATE OR REPLACE FUNCTION public.grant_b2b_paymongo_credits(
  payment_row_id uuid,
  provider_payment_id text,
  provider_intent_id text,
  paid_amount integer,
  paid_currency text
)
RETURNS TABLE(granted boolean, granted_credits integer, granted_company_id uuid) AS $$
DECLARE
  target_payment public.b2b_paymongo_payments%ROWTYPE;
BEGIN
  SELECT * INTO target_payment
  FROM public.b2b_paymongo_payments
  WHERE id = payment_row_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'B2B PayMongo payment not found'; END IF;

  IF target_payment.credited_at IS NOT NULL OR target_payment.status = 'paid' THEN
    RETURN QUERY SELECT false, target_payment.credits, target_payment.company_id;
    RETURN;
  END IF;

  IF paid_amount IS DISTINCT FROM target_payment.amount OR upper(paid_currency) <> 'PHP' THEN
    RAISE EXCEPTION 'B2B PayMongo amount or currency mismatch';
  END IF;

  UPDATE public.b2b_wallets
  SET
    balance_credits = balance_credits + target_payment.credits,
    last_topup_amount = target_payment.credits,
    last_topup_date = timezone('utc'::text, now()),
    updated_at = timezone('utc'::text, now())
  WHERE company_id = target_payment.company_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'B2B wallet not found'; END IF;

  UPDATE public.b2b_paymongo_payments
  SET
    status = 'paid',
    paymongo_payment_id = COALESCE(provider_payment_id, paymongo_payment_id),
    paymongo_intent_id = COALESCE(provider_intent_id, paymongo_intent_id),
    credited_at = timezone('utc'::text, now())
  WHERE id = target_payment.id;

  RETURN QUERY SELECT true, target_payment.credits, target_payment.company_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.grant_b2b_paymongo_credits(uuid, text, text, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_b2b_paymongo_credits(uuid, text, text, integer, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_b2b_paymongo_credits(uuid, text, text, integer, text) FROM anon;

NOTIFY pgrst, 'reload schema';

