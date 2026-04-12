-- Clerk-linked profiles: run this in the Supabase SQL editor (or via CLI) once.
-- Chats/messages already use users.id as user_id.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS clerk_user_id text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS users_clerk_user_id_unique
  ON public.users (clerk_user_id)
  WHERE clerk_user_id IS NOT NULL;
