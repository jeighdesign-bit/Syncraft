-- =====================================================================
-- SYNCRAFT – ADMIN POLICIES FOR MANUAL TOKEN VERIFICATION
-- =====================================================================
-- Run this in Supabase Dashboard → SQL Editor → New Query → Paste → Run
--
-- This allows the admin account (jeighdesign@gmail.com) to view and 
-- update all profile records for manual payment approval/rejection.
-- =====================================================================

-- 1. SELECT policy – Admins can view all profile records
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles
  FOR SELECT
  USING (
    auth.jwt() ->> 'email' = 'jeighdesign@gmail.com'
  );

-- 2. UPDATE policy – Admins can update all profile records
DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles"
  ON public.profiles
  FOR UPDATE
  USING (
    auth.jwt() ->> 'email' = 'jeighdesign@gmail.com'
  )
  WITH CHECK (
    auth.jwt() ->> 'email' = 'jeighdesign@gmail.com'
  );

-- =====================================================================
-- DONE! The admin panel will now be able to retrieve and approve payments.
-- =====================================================================
