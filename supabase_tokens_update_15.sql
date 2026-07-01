-- =====================================================================
-- SYNCRAFT SUPABASE DATABASE MIGRATION – STARTER TOKENS UPDATE TO 15
-- =====================================================================
-- Run this script in your Supabase SQL Editor to set the default free 
-- tokens for new users to 15 tokens.

-- 1. Alter the default value for the credits_max column to 15
ALTER TABLE public.profiles 
  ALTER COLUMN credits_max SET DEFAULT 15;

-- 2. Redefine or update the trigger function that inserts new profiles.
-- Updates the trigger to set default credits_max to 15 for new signups.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, plan, credits_used, credits_max, history)
  VALUES (
    new.id, 
    'Starter', 
    0, 
    15, 
    '[]'::jsonb
  )
  ON CONFLICT (id) DO UPDATE
  SET credits_max = EXCLUDED.credits_max;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- OPTIONAL: If you want to update existing Starter users' max limit to 15,
-- uncomment and run the following line:
-- UPDATE public.profiles SET credits_max = 15 WHERE plan = 'Starter';
