-- =============================================================================
-- Tandem — Supabase schema
-- Paste this entire file into Supabase Dashboard → SQL Editor → New query → Run.
-- Safe to re-run (uses IF NOT EXISTS / CREATE OR REPLACE everywhere).
-- =============================================================================

-- Required for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- profiles  — username + partner link (1 row per auth.users)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT UNIQUE NOT NULL,
  email       TEXT,
  partner_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  birthday    DATE,
  anniversary DATE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS anniversary DATE;

-- -----------------------------------------------------------------------------
-- invites
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,
  created_by  UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  used_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  used        BOOLEAN DEFAULT FALSE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- lists  (todo / grocery / chores / custom)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('todo','grocery','chores','custom')),
  custom_label TEXT,
  shared_with  UUID[] DEFAULT ARRAY[]::UUID[],
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.lists ADD COLUMN IF NOT EXISTS custom_label TEXT;
ALTER TABLE public.lists DROP CONSTRAINT IF EXISTS lists_type_check;
ALTER TABLE public.lists ADD CONSTRAINT lists_type_check
  CHECK (type IN ('todo','grocery','chores','custom'));

CREATE TABLE IF NOT EXISTS public.list_items (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id                  UUID REFERENCES public.lists(id) ON DELETE CASCADE NOT NULL,
  text                     TEXT NOT NULL,
  qty                      TEXT,
  assignee_id              UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  done                     BOOLEAN DEFAULT FALSE,
  due_at                   TIMESTAMPTZ,
  remind_minutes_before    INT,
  recurrence               JSONB,
  created_by               UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS list_items_list_id_idx ON public.list_items(list_id);

-- Multimodal list items (links, video, images) — safe to re-run
ALTER TABLE public.list_items ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'text';
ALTER TABLE public.list_items ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE public.list_items ADD COLUMN IF NOT EXISTS media_uri TEXT;

-- -----------------------------------------------------------------------------
-- item_comments  (replies on list items)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.item_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID REFERENCES public.list_items(id) ON DELETE CASCADE NOT NULL,
  author_id   UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS item_comments_item_id_idx ON public.item_comments(item_id);

-- -----------------------------------------------------------------------------
-- Storage bucket for shared list images (private; signed URLs via backend)
-- Run once in Supabase Dashboard if INSERT fails (Storage → New bucket → list-media).
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('list-media', 'list-media', false)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- events
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.events (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id                 UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title                    TEXT NOT NULL,
  date                     DATE NOT NULL,
  time                     TEXT,
  notes                    TEXT,
  location                 TEXT,
  remind_minutes_before    INT,
  recurrence               JSONB,
  shared                   BOOLEAN DEFAULT FALSE,
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- thoughts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.thoughts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  text        TEXT NOT NULL,
  mood        TEXT,
  shared      BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.thoughts ADD COLUMN IF NOT EXISTS mood TEXT;

-- -----------------------------------------------------------------------------
-- journal entries
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  mood        TEXT,
  shared      BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- routines  + per-day completion ticks
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.routines (
  user_id     UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  steps       JSONB DEFAULT '[]'::JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.routine_checks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  step_id     TEXT NOT NULL,
  date        DATE NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, step_id, date)
);

-- -----------------------------------------------------------------------------
-- quotes  (AI daily quote cache)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quotes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  date        DATE NOT NULL,
  text        TEXT NOT NULL,
  author      TEXT,
  is_fallback BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, date)
);

-- -----------------------------------------------------------------------------
-- push_tokens (one row per device)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  platform      TEXT,
  device_token  TEXT UNIQUE NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Row-Level Security
-- The FastAPI backend uses the service-role key (bypasses RLS).
-- These policies make the tables safe for *direct* anon-key access too.
-- =============================================================================

-- Helper: returns the connected partner's id, or NULL
CREATE OR REPLACE FUNCTION public.my_partner_id() RETURNS UUID
LANGUAGE SQL STABLE AS $$
  SELECT partner_id FROM public.profiles WHERE id = auth.uid()
$$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','invites','lists','list_items','item_comments','events','thoughts','journal_entries','routines','routine_checks','quotes','push_tokens']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- profiles
DROP POLICY IF EXISTS profiles_self_or_partner ON public.profiles;
CREATE POLICY profiles_self_or_partner ON public.profiles FOR SELECT USING (
  id = auth.uid() OR id = public.my_partner_id()
);
DROP POLICY IF EXISTS profiles_self_update ON public.profiles;
CREATE POLICY profiles_self_update ON public.profiles FOR UPDATE USING (id = auth.uid());

-- invites: creator can see their own
DROP POLICY IF EXISTS invites_owner ON public.invites;
CREATE POLICY invites_owner ON public.invites FOR ALL USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

-- lists / list_items: owner or partner
DROP POLICY IF EXISTS lists_owner_or_partner ON public.lists;
CREATE POLICY lists_owner_or_partner ON public.lists FOR ALL USING (
  owner_id = auth.uid()
  OR (public.my_partner_id() IS NOT NULL AND owner_id = public.my_partner_id() AND public.my_partner_id() = ANY(shared_with))
  OR auth.uid() = ANY(shared_with)
);

DROP POLICY IF EXISTS items_via_list ON public.list_items;
CREATE POLICY items_via_list ON public.list_items FOR ALL USING (
  EXISTS (SELECT 1 FROM public.lists l WHERE l.id = list_id AND (
    l.owner_id = auth.uid()
    OR auth.uid() = ANY(l.shared_with)
  ))
);

DROP POLICY IF EXISTS item_comments_via_item ON public.item_comments;
CREATE POLICY item_comments_via_item ON public.item_comments FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.list_items i
    JOIN public.lists l ON l.id = i.list_id
    WHERE i.id = item_id AND (
      l.owner_id = auth.uid()
      OR auth.uid() = ANY(l.shared_with)
    )
  )
) WITH CHECK (
  author_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.list_items i
    JOIN public.lists l ON l.id = i.list_id
    WHERE i.id = item_id AND (
      l.owner_id = auth.uid()
      OR auth.uid() = ANY(l.shared_with)
    )
  )
);

-- events: owner or (partner of owner AND shared=true)
DROP POLICY IF EXISTS events_owner_or_partner ON public.events;
CREATE POLICY events_owner_or_partner ON public.events FOR ALL USING (
  owner_id = auth.uid()
  OR (shared = TRUE AND owner_id = public.my_partner_id())
);

-- thoughts: same shape
DROP POLICY IF EXISTS thoughts_owner_or_partner ON public.thoughts;
CREATE POLICY thoughts_owner_or_partner ON public.thoughts FOR ALL USING (
  owner_id = auth.uid()
  OR (shared = TRUE AND owner_id = public.my_partner_id())
);

-- journal_entries
DROP POLICY IF EXISTS journal_owner_or_partner ON public.journal_entries;
CREATE POLICY journal_owner_or_partner ON public.journal_entries FOR ALL USING (
  owner_id = auth.uid()
  OR (shared = TRUE AND owner_id = public.my_partner_id())
);

-- routines / routine_checks: self only
DROP POLICY IF EXISTS routines_self ON public.routines;
CREATE POLICY routines_self ON public.routines FOR ALL USING (user_id = auth.uid());
DROP POLICY IF EXISTS routine_checks_self ON public.routine_checks;
CREATE POLICY routine_checks_self ON public.routine_checks FOR ALL USING (user_id = auth.uid());

-- quotes: self only
DROP POLICY IF EXISTS quotes_self ON public.quotes;
CREATE POLICY quotes_self ON public.quotes FOR ALL USING (user_id = auth.uid());

-- push_tokens: self only
DROP POLICY IF EXISTS push_tokens_self ON public.push_tokens;
CREATE POLICY push_tokens_self ON public.push_tokens FOR ALL USING (user_id = auth.uid());

-- =============================================================================
-- Auto-create a profile row on signup
-- =============================================================================
-- REMINDERS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.reminders (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title                  TEXT NOT NULL,
  notes                  TEXT NOT NULL DEFAULT '',
  due_at                 TIMESTAMPTZ,
  remind_minutes_before  INTEGER,
  recurrence             JSONB NOT NULL DEFAULT '{"type":"none"}'::JSONB,
  shared_with_partner    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reminders_user_id_idx ON public.reminders(user_id);

-- The frontend passes { username } via auth.signUp(options.data); this trigger
-- copies it into public.profiles.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1))
  );
  INSERT INTO public.routines (user_id, steps) VALUES (NEW.id, '[]'::JSONB);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
