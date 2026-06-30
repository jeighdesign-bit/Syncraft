-- =====================================================================
-- SYNCRAFT SUPABASE DATABASE MIGRATION – STARTER TOKENS UPDATE
-- =====================================================================
-- Run this script in your Supabase SQL Editor to set the default free 
-- tokens for new users to 30 tokens and update existing free users.

-- 1. Alter the default value for the credits_max column to 30
ALTER TABLE public.profiles 
  ALTER COLUMN credits_max SET DEFAULT 30;

-- 2. Update existing users who have 10 or 25 max tokens to 30
UPDATE public.profiles 
  SET credits_max = 30 
  WHERE credits_max = 10 OR credits_max = 25 OR credits_max = 20;

-- 3. Redefine or update the trigger function (if exists) that inserts new profiles.
-- Typically in Supabase, there is a trigger on auth.users to insert into public.profiles.
-- Run the query below to update the insert parameters to default to 30.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, plan, credits_used, credits_max, history)
  VALUES (
    new.id, 
    'Starter', 
    0, 
    30, 
    '[]'::jsonb
  )
  ON CONFLICT (id) DO UPDATE
  SET credits_max = EXCLUDED.credits_max;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
