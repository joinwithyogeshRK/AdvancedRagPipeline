-- GitHub OAuth token storage (per Clerk-linked user row in public.users)

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS github_access_token text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS github_login text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS github_token_updated_at timestamptz;
