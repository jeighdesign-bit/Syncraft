-- Account-only project collaboration. Shared access expires with the parent
-- project because the application enforces the existing 3-day retention window.
CREATE TABLE IF NOT EXISTS public.project_collaborators (
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('view', 'edit')),
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS project_collaborators_user_id_idx
  ON public.project_collaborators(user_id);

ALTER TABLE public.project_collaborators ENABLE ROW LEVEL SECURITY;

-- Collaboration reads and writes go through authenticated server routes so
-- account emails and membership details are never exposed by the browser API.
REVOKE ALL ON public.project_collaborators FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

