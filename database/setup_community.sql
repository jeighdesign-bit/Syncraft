-- Run once in the Supabase SQL editor. Logos use a dedicated private bucket,
-- separate from the short-lived project assets and their cleanup jobs.
CREATE TABLE IF NOT EXISTS public.community_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL CHECK (char_length(business_name) BETWEEN 2 AND 100),
  website TEXT NOT NULL CHECK (char_length(website) <= 500 AND website ~ '^https?://'),
  logo_path TEXT NOT NULL,
  consent_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','changes_requested','withdrawn')),
  review_note TEXT NOT NULL DEFAULT '' CHECK (char_length(review_note) <= 500),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  revision UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS community_status_idx ON public.community_submissions(status, created_at);
ALTER TABLE public.community_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_submissions FROM anon, authenticated;
GRANT ALL ON public.community_submissions TO service_role;
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('community-logos', 'community-logos', false, 2097152, ARRAY['image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;
-- No anon/authenticated storage policies: all reads/writes go through the server.
NOTIFY pgrst, 'reload schema';
