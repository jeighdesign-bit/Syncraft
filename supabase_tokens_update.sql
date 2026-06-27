-- =====================================================================
-- SYNCRAFT SUPABASE DATABASE MIGRATION – STARTER TOKENS UPDATE
-- =====================================================================
-- Run this script in your Supabase SQL Editor to set the default free 
-- tokens for new users to 25 tokens and update existing free users.

-- 1. Alter the default value for the credits_max column to 25
ALTER TABLE public.profiles 
  ALTER COLUMN credits_max SET DEFAULT 25;

-- 2. Update existing users who have 10 max tokens to 25
UPDATE public.profiles 
  SET credits_max = 25 
  WHERE credits_max = 10;

-- 3. Redefine or update the trigger function (if exists) that inserts new profiles.
-- Typically in Supabase, there is a trigger on auth.users to insert into public.profiles.
-- Run the query below to update the insert parameters to default to 25.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, plan, credits_used, credits_max, history)
  VALUES (
    new.id, 
    'Starter', 
    0, 
    25, 
    '[]'::jsonb
  )
  ON CONFLICT (id) DO UPDATE
  SET credits_max = EXCLUDED.credits_max;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
