-- Syncraft B2B API Tables (Run this in Supabase SQL Editor)

-- 1. Companies Table
CREATE TABLE IF NOT EXISTS public.b2b_companies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_email text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Wallets Table (Prepaid Credits for Manual GCash Top-ups)
CREATE TABLE IF NOT EXISTS public.b2b_wallets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES public.b2b_companies(id) ON DELETE CASCADE NOT NULL UNIQUE,
  balance_credits integer DEFAULT 0 NOT NULL,
  last_topup_amount integer DEFAULT 0,
  last_topup_date timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. API Keys Table (Used to authenticate B2B requests)
CREATE TABLE IF NOT EXISTS public.b2b_api_keys (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES public.b2b_companies(id) ON DELETE CASCADE NOT NULL,
  api_key text NOT NULL UNIQUE, -- The actual key (e.g., syncraft_live_abcd123)
  is_active boolean DEFAULT true,
  last_used_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. API Usage Logs (Tracks every single generation for analytics and dispute resolution)
CREATE TABLE IF NOT EXISTS public.b2b_usage_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid REFERENCES public.b2b_companies(id) ON DELETE CASCADE NOT NULL,
  api_key_id uuid REFERENCES public.b2b_api_keys(id),
  status text NOT NULL, -- 'success', 'failed', 'pending'
  credits_charged integer DEFAULT 0 NOT NULL, -- E.g., 40
  pipeline_cost_usd numeric, -- E.g., 0.161 (Raw cost for your tracking)
  error_message text,
  endpoint_called text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create RLS Policies (Since this is B2B backend-only, we restrict public access)
ALTER TABLE public.b2b_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_usage_logs ENABLE ROW LEVEL SECURITY;

-- Allow only authenticated admin service role to bypass RLS (Next.js server side)
-- B2B clients DO NOT query Supabase directly from the browser, so we don't need public policies.
