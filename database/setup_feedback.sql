-- Public feedback is served through authenticated server routes. Never expose auth emails.
CREATE TABLE IF NOT EXISTS public.feedback_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 5 AND 120),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 10 AND 4000),
  category TEXT NOT NULL CHECK (category IN ('feature','bug')),
  status TEXT NOT NULL DEFAULT 'Under review' CHECK (status IN ('Under review','Planned','In progress','Completed','Closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.feedback_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.feedback_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.feedback_votes (
  post_id UUID NOT NULL REFERENCES public.feedback_posts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY(post_id,user_id)
);
CREATE INDEX IF NOT EXISTS feedback_posts_created_idx ON public.feedback_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_comments_post_idx ON public.feedback_comments(post_id,created_at);
ALTER TABLE public.feedback_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_votes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feedback_posts, public.feedback_comments, public.feedback_votes FROM anon, authenticated;
GRANT ALL ON public.feedback_posts, public.feedback_comments, public.feedback_votes TO service_role;
NOTIFY pgrst, 'reload schema';
