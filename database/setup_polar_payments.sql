-- Run this in Supabase SQL Editor before enabling Polar card payments.
-- Amounts are stored in the smallest currency unit (USD cents).

CREATE TABLE IF NOT EXISTS public.polar_payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  email text NOT NULL,
  plan text NOT NULL,
  credits integer NOT NULL CHECK (credits > 0),
  amount integer NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'USD',
  polar_product_id text NOT NULL,
  polar_checkout_id text,
  polar_order_id text,
  status text NOT NULL DEFAULT 'pending',
  credited_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.polar_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own polar payments" ON public.polar_payments;
CREATE POLICY "Users can view their own polar payments"
ON public.polar_payments FOR SELECT
USING (auth.uid() = user_id);

CREATE UNIQUE INDEX IF NOT EXISTS polar_payments_checkout_unique
ON public.polar_payments (polar_checkout_id)
WHERE polar_checkout_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS polar_payments_order_unique
ON public.polar_payments (polar_order_id)
WHERE polar_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS polar_payments_user_created_idx
ON public.polar_payments (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_polar_payments_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_polar_payments_updated_at ON public.polar_payments;
CREATE TRIGGER set_polar_payments_updated_at
BEFORE UPDATE ON public.polar_payments
FOR EACH ROW
EXECUTE FUNCTION public.set_polar_payments_updated_at();

CREATE OR REPLACE FUNCTION public.grant_polar_payment_credits(
  payment_row_id uuid,
  provider_order_id text,
  provider_checkout_id text,
  paid_amount integer,
  paid_currency text
)
RETURNS TABLE(granted boolean, granted_credits integer, granted_user_id uuid) AS $$
DECLARE
  target_payment public.polar_payments%ROWTYPE;
BEGIN
  SELECT * INTO target_payment
  FROM public.polar_payments
  WHERE id = payment_row_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Polar payment not found';
  END IF;

  IF target_payment.credited_at IS NOT NULL OR target_payment.status = 'paid' THEN
    RETURN QUERY SELECT false, target_payment.credits, target_payment.user_id;
    RETURN;
  END IF;

  UPDATE public.profiles
  SET credits = credits + target_payment.credits
  WHERE id = target_payment.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found for Polar payment';
  END IF;

  UPDATE public.polar_payments
  SET
    status = 'paid',
    polar_order_id = COALESCE(provider_order_id, polar_order_id),
    polar_checkout_id = COALESCE(provider_checkout_id, polar_checkout_id),
    amount = COALESCE(paid_amount, amount),
    currency = COALESCE(paid_currency, currency),
    credited_at = timezone('utc'::text, now())
  WHERE id = target_payment.id;

  RETURN QUERY SELECT true, target_payment.credits, target_payment.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.grant_polar_payment_credits(uuid, text, text, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_polar_payment_credits(uuid, text, text, integer, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_polar_payment_credits(uuid, text, text, integer, text) FROM anon;

NOTIFY pgrst, 'reload schema';
