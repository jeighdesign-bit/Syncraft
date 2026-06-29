-- =====================================================================
-- SYNCRAFT – FIX RLS POLICIES FOR PROFILES TABLE
-- =====================================================================
-- Run this in Supabase Dashboard → SQL Editor → New Query → Paste → Run
--
-- This ensures that authenticated users can read and update their OWN
-- profile row, which is required for token tracking to work properly.
-- =====================================================================

-- 1. Make sure RLS is enabled on the profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies if they exist (safe to re-run)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- 3. SELECT policy – users can read their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- 4. UPDATE policy – users can update their own profile (THIS IS THE CRITICAL FIX)
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 5. INSERT policy – users can create their own profile (for first-time sign-in fallback)
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- =====================================================================
-- DONE! Token tracking should now work for all accounts.
-- =====================================================================
