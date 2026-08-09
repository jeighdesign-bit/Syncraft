-- Run this in the Supabase SQL Editor before enabling paid store requests.

CREATE TABLE IF NOT EXISTS store_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  product_name text NOT NULL,
  product_type text,
  price text NOT NULL,
  receipt_url text,
  status text DEFAULT 'pending' NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone
);

ALTER TABLE store_requests
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE store_requests
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS store_requests_status_created_idx
  ON store_requests (status, created_at DESC);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'store_receipts',
  'store_receipts',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'store_request_records',
  'store_request_records',
  false,
  65536,
  ARRAY['application/json']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 65536,
  allowed_mime_types = ARRAY['application/json'];

ALTER TABLE store_requests ENABLE ROW LEVEL SECURITY;

-- No public policies are created intentionally. Store requests and private
-- receipts are accessed only by server routes using the Supabase service role.
