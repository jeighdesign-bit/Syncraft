-- Verified, project-linked credit ledger for consumer generation routes.
-- Safe for existing data: all new columns are nullable and historical rows remain unchanged.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.credit_logs
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS feature text,
  ADD COLUMN IF NOT EXISTS transaction_type text,
  ADD COLUMN IF NOT EXISTS transaction_status text,
  ADD COLUMN IF NOT EXISTS balance_before integer,
  ADD COLUMN IF NOT EXISTS balance_after integer,
  ADD COLUMN IF NOT EXISTS related_transaction_id uuid REFERENCES public.credit_logs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS is_owner_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS credit_logs_idempotency_key_unique
  ON public.credit_logs (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS credit_logs_project_id_idx
  ON public.credit_logs (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS credit_logs_related_transaction_idx
  ON public.credit_logs (related_transaction_id)
  WHERE related_transaction_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.provider_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_transaction_id uuid REFERENCES public.credit_logs(id) ON DELETE SET NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  provider text NOT NULL,
  endpoint text NOT NULL,
  provider_request_id text,
  request_status text NOT NULL DEFAULT 'succeeded',
  estimated_cost_usd numeric(12, 6),
  is_owner_test boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS provider_usage_request_unique
  ON public.provider_usage_logs (provider, provider_request_id)
  WHERE provider_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS provider_usage_project_idx
  ON public.provider_usage_logs (project_id, created_at DESC);

ALTER TABLE public.provider_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.charge_credits_verified(
  p_user_id uuid,
  p_project_id uuid,
  p_feature text,
  p_action text,
  p_amount integer,
  p_idempotency_key text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  applied boolean,
  replayed boolean,
  transaction_id uuid,
  balance_before integer,
  balance_after integer,
  failure_reason text,
  is_owner_test boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.credit_logs%ROWTYPE;
  v_before integer;
  v_after integer;
  v_transaction_id uuid;
  v_is_owner boolean;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN QUERY SELECT false, false, NULL::uuid, NULL::integer, NULL::integer, 'INVALID_AMOUNT'::text, false;
    RETURN;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.credit_logs
    WHERE idempotency_key = p_idempotency_key
    LIMIT 1;

    IF FOUND THEN
      RETURN QUERY SELECT
        true,
        true,
        v_existing.id,
        v_existing.balance_before,
        v_existing.balance_after,
        NULL::text,
        COALESCE(v_existing.is_owner_test, false);
      RETURN;
    END IF;
  END IF;

  SELECT credits, COALESCE(is_admin, false)
    INTO v_before, v_is_owner
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, NULL::uuid, NULL::integer, NULL::integer, 'PROFILE_NOT_FOUND'::text, false;
    RETURN;
  END IF;

  IF v_before < p_amount THEN
    RETURN QUERY SELECT false, false, NULL::uuid, v_before, v_before, 'INSUFFICIENT_CREDITS'::text, v_is_owner;
    RETURN;
  END IF;

  v_after := v_before - p_amount;
  UPDATE public.profiles SET credits = v_after WHERE id = p_user_id;

  INSERT INTO public.credit_logs (
    user_id, action, amount, project_id, feature, transaction_type,
    transaction_status, balance_before, balance_after, idempotency_key,
    is_owner_test, verified_at, metadata
  ) VALUES (
    p_user_id, p_action, -p_amount, p_project_id, p_feature, 'charge',
    'pending', v_before, v_after, p_idempotency_key,
    v_is_owner, timezone('utc'::text, now()), COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_transaction_id;

  RETURN QUERY SELECT true, false, v_transaction_id, v_before, v_after, NULL::text, v_is_owner;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_credit_verified(
  p_charge_transaction_id uuid,
  p_reason text,
  p_action text DEFAULT 'Refund (Error)',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  applied boolean,
  already_refunded boolean,
  refund_transaction_id uuid,
  balance_before integer,
  balance_after integer,
  failure_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge public.credit_logs%ROWTYPE;
  v_existing public.credit_logs%ROWTYPE;
  v_before integer;
  v_after integer;
  v_refund_id uuid;
  v_amount integer;
BEGIN
  SELECT * INTO v_charge
  FROM public.credit_logs
  WHERE id = p_charge_transaction_id
    AND transaction_type = 'charge'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, NULL::uuid, NULL::integer, NULL::integer, 'CHARGE_NOT_FOUND'::text;
    RETURN;
  END IF;

  SELECT * INTO v_existing
  FROM public.credit_logs
  WHERE related_transaction_id = v_charge.id
    AND transaction_type = 'refund'
    AND transaction_status = 'verified'
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT false, true, v_existing.id, v_existing.balance_before, v_existing.balance_after, NULL::text;
    RETURN;
  END IF;

  v_amount := abs(v_charge.amount);
  SELECT credits INTO v_before
  FROM public.profiles
  WHERE id = v_charge.user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, NULL::uuid, NULL::integer, NULL::integer, 'PROFILE_NOT_FOUND'::text;
    RETURN;
  END IF;

  v_after := v_before + v_amount;
  UPDATE public.profiles SET credits = v_after WHERE id = v_charge.user_id;

  INSERT INTO public.credit_logs (
    user_id, action, amount, project_id, feature, transaction_type,
    transaction_status, balance_before, balance_after, related_transaction_id,
    is_owner_test, verified_at, metadata
  ) VALUES (
    v_charge.user_id, p_action, v_amount, v_charge.project_id, v_charge.feature, 'refund',
    'verified', v_before, v_after, v_charge.id,
    COALESCE(v_charge.is_owner_test, false), timezone('utc'::text, now()),
    COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('reason', left(COALESCE(p_reason, ''), 500))
  )
  RETURNING id INTO v_refund_id;

  UPDATE public.credit_logs
  SET transaction_status = 'refunded',
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('refund_transaction_id', v_refund_id)
  WHERE id = v_charge.id;

  RETURN QUERY SELECT true, false, v_refund_id, v_before, v_after, NULL::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_credit_transaction_status(
  p_transaction_id uuid,
  p_status text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.credit_logs
  SET transaction_status = p_status,
      metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb)
  WHERE id = p_transaction_id
    AND transaction_type = 'charge';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.charge_credits_verified(uuid, uuid, text, text, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_credit_verified(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_credit_transaction_status(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.charge_credits_verified(uuid, uuid, text, text, integer, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_credit_verified(uuid, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_credit_transaction_status(uuid, text, jsonb) TO service_role;

REVOKE ALL ON public.provider_usage_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.provider_usage_logs TO service_role;

NOTIFY pgrst, 'reload schema';
