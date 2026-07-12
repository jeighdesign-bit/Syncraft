-- ============================================================
-- increment_credits RPC function
-- Used to atomically refund a credit when remove-bg processing fails.
-- This must be run with the Service Role (adminSupabase) so it
-- bypasses RLS — users cannot call this directly from the client.
-- ============================================================

CREATE OR REPLACE FUNCTION public.increment_credits(user_id UUID, amount INTEGER)
RETURNS void AS $$
BEGIN
  UPDATE public.profiles
  SET credits = credits + amount
  WHERE id = user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- IMPORTANT: Do NOT expose this function via RLS policies for anon/authenticated
-- roles. It should only ever be called server-side via the service role key.
-- Revoke any public/authenticated execution access to be safe:
REVOKE EXECUTE ON FUNCTION public.increment_credits(UUID, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_credits(UUID, INTEGER) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_credits(UUID, INTEGER) FROM anon;

NOTIFY pgrst, 'reload schema';
