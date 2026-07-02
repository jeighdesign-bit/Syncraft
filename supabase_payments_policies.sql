-- =====================================================================
-- SYNCRAFT – RLS POLICIES FOR MANUAL PAYMENTS VERIFICATION
-- =====================================================================
-- Run this in Supabase Dashboard → SQL Editor → New Query → Paste → Run
--
-- This ensures that:
-- 1. Row Level Security (RLS) is active on the payments table.
-- 2. Authenticated users can insert their own payment references.
-- 3. Authenticated users can view their own payment status/history.
-- 4. Admin (jeighdesign@gmail.com) can view all payments.
-- 5. Admin (jeighdesign@gmail.com) can update payments (for approval/rejection).
-- =====================================================================

-- 1. Enable RLS on the payments table
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies if they exist (safe to re-run)
DROP POLICY IF EXISTS "Users can insert own payments" ON public.payments;
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can view all payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can update all payments" ON public.payments;

-- 3. INSERT policy – users can insert their own payment records
CREATE POLICY "Users can insert own payments"
  ON public.payments
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
  );

-- 4. SELECT policy – users can read their own payment records
CREATE POLICY "Users can view own payments"
  ON public.payments
  FOR SELECT
  USING (
    auth.uid() = user_id
  );

-- 5. SELECT policy – Admins can view all payment records
CREATE POLICY "Admins can view all payments"
  ON public.payments
  FOR SELECT
  USING (
    auth.jwt() ->> 'email' = 'jeighdesign@gmail.com'
  );

-- 6. UPDATE policy – Admins can update all payment records (for approval/rejection)
CREATE POLICY "Admins can update all payments"
  ON public.payments
  FOR UPDATE
  USING (
    auth.jwt() ->> 'email' = 'jeighdesign@gmail.com'
  )
  WITH CHECK (
    auth.jwt() ->> 'email' = 'jeighdesign@gmail.com'
  );

-- =====================================================================
-- DONE! The admin panel can now fetch and update all manual payments.
-- =====================================================================
