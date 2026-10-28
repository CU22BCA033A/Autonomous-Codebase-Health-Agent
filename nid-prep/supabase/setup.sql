-- NID Prep Studio — full database setup.
-- Paste this whole file into Supabase → SQL Editor → New query → Run. Run it once on a fresh project.
-- Generated from supabase/migrations by `npm run db:bundle`; do not edit by hand.

-- ── 20261028000001_schema.sql ──

-- NID Prep Studio — core schema.
-- Two roles: student (Veeru) and mentor (GB). Content is readable by any signed-in user and
-- writable by the mentor; personal data is owned by the student and readable by the mentor.

create extension if not exists pg_trgm;

-- ───────────────────────────── users & settings ─────────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('student', 'mentor')),
  display_name text not null,
  why_nid text,
  created_at timestamptz not null default now()
);

create or replace function public.is_mentor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'mentor');
$$;

-- Single-row settings. `exam_facts` and `phases` override /content defaults when present.
create table public.settings (
  id int primary key default 1 check (id = 1),
  exam_facts jsonb,
  phases jsonb,
  mentor_message text,
  updated_at timestamptz not null default now()
);

-- ───────────────────────────────── content ─────────────────────────────────

create table public.categories (
  id text primary key,
  name text not null,
  description text not null default '',
  sort int not null default 0
);

create table public.subtopics (
  id text primary key,
  category_id text not null references public.categories (id),
  name text not null
);

create table public.images (
  id text primary key,
  path text,                                  -- storage path once uploaded
  description text not null,
  shot_notes text,                            -- angle / lighting / aspect for IMAGES_NEEDED.md
  aspect text,
  license text,
  author text,
  source_url text,
  status text not null default 'needed' check (status in ('needed', 'ready')),
  created_at timestamptz not null default now(),
  constraint images_ready_has_license check (status <> 'ready' or (path is not null and license is not null))
);

create table public.items (
  id text primary key,
  type text not null check (type in ('mcq', 'multi', 'short')),
  category_id text not null references public.categories (id),
  subtopic_id text not null references public.subtopics (id),
  difficulty smallint not null check (difficulty between 1 and 5),
  source text not null check (source in ('PYQ', 'PYQ-style', 'Expected-2027', 'Practice', 'Generated')),
  pattern_ref text,                            -- for PYQ-style: the pattern it imitates
  stem text not null,
  stem_svg text,                               -- inline SVG for visual items
  options jsonb,                               -- [{id, text?, svg?}]
  answer jsonb,                                -- mcq: "b"; multi: ["a","c"]; short: null
  explanation text not null,
  distractor_rationale jsonb,                  -- {optionId: why it's wrong}
  takeaway text,
  model_answer text,                           -- short: an exemplary answer
  rubric jsonb,                                -- short: {keywords:[], minIdeas, maxWords}
  tags text[] not null default '{}',
  image_ids text[] not null default '{}',
  valid_until date,
  needs_review boolean not null default false,
  status text not null default 'live' check (status in ('draft', 'live', 'retired')),
  content_hash text not null unique,
  variant_of text references public.items (id),
  generator text,
  generator_seed text,
  created_at timestamptz not null default now()
);
create index items_subtopic_idx on public.items (subtopic_id) where status = 'live';
create index items_stem_trgm on public.items using gin (stem gin_trgm_ops);

create table public.generators_log (
  generator text not null,
  seed text not null,
  content_hash text not null unique,
  item_id text references public.items (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (generator, seed)
);

create table public.concept_cards (
  id text primary key,
  subtopic_id text not null references public.subtopics (id),
  title text not null,
  body text not null,
  svg text
);

create table public.studio_tasks (
  id text primary key,
  kind text not null check (kind in ('test', 'daily', 'mains')),
  category text not null,                      -- storyboard, symbol, signage, …
  subtopic_id text references public.subtopics (id),
  title text not null,
  brief text not null,
  minutes int not null check (minutes > 0),
  sheet text not null default 'A4',
  materials text[] not null default '{pencil}',
  hints text[] not null default '{}',
  examiner_checklist text[] not null default '{}',
  phases text[] not null default '{}',
  difficulty smallint not null default 3 check (difficulty between 1 and 5),
  source text not null default 'Practice' check (source in ('PYQ', 'PYQ-style', 'Expected-2027', 'Practice')),
  image_ids text[] not null default '{}',
  content_hash text not null unique,
  status text not null default 'live' check (status in ('draft', 'live', 'retired'))
);

create table public.mocks (
  id text primary key,
  title text not null,
  format text not null check (format in ('2026', 'mixed', 'mini')),
  duration_min int not null,
  total_marks int not null,
  questions jsonb not null,                    -- [{no, marks, prompt, parts:[…], suggestedMinutes}]
  analysis jsonb not null default '[]',        -- [{no, idealApproach}]
  status text not null default 'live' check (status in ('draft', 'live', 'retired'))
);

create table public.tips (
  id text primary key,
  phases text[] not null default '{}',
  category text not null,
  title text not null,
  body text not null
);

-- ─────────────────────────────── student data ───────────────────────────────

create table public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day_no int not null,
  date date not null,
  phase text not null,
  warmup_item_ids text[] not null default '{}',
  item_ids text[] not null default '{}',
  studio_task_ids text[] not null default '{}',
  daily_task_id text references public.studio_tasks (id),
  tip_id text references public.tips (id),
  steps jsonb not null default '{}',           -- {warmup:ts, test:ts, result:ts, homework:ts, task:ts, reflection:ts}
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'missed')),
  tough_day boolean not null default false,
  catch_up_of int,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, day_no)
);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null references public.items (id),
  plan_id uuid references public.daily_plans (id) on delete set null,
  context text not null check (context in ('warmup', 'daily', 'homework', 'review', 'drill', 'mock')),
  answer jsonb,
  correct boolean,
  score numeric,                               -- 0..1 (short answers can be partial)
  confidence text check (confidence in ('sure', 'guess')),
  time_ms int,
  note text,                                   -- "why I got it wrong"
  client_id text unique,                       -- idempotency key for offline sync
  created_at timestamptz not null default now()
);
create index attempts_user_time on public.attempts (user_id, created_at desc);

-- Every item ever shown. The daily builder never re-serves these (except as labelled review).
create table public.served_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null references public.items (id),
  context text not null,
  first_served_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table public.skill_ratings (
  user_id uuid not null references auth.users (id) on delete cascade,
  subtopic_id text not null references public.subtopics (id),
  rating numeric not null default 1000,
  attempts int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, subtopic_id)
);

create table public.srs_cards (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null references public.items (id),
  step int not null default 0,                 -- index into review offsets (1,3,7,16 days)
  due date not null,
  lapses int not null default 0,
  last_reviewed_at timestamptz,
  retired boolean not null default false,
  primary key (user_id, item_id)
);

create table public.homework (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day_no int not null,
  item_id text not null references public.items (id),
  source_attempt_id uuid references public.attempts (id) on delete set null,
  kind text not null check (kind in ('reattempt', 'variant', 'review')),
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped')),
  skip_reason text,
  created_at timestamptz not null default now(),
  done_at timestamptz,
  unique (user_id, day_no, item_id)
);

create table public.mock_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mock_id text not null references public.mocks (id),
  mode text not null check (mode in ('screen', 'paper')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  answers jsonb not null default '{}',
  time_split jsonb not null default '{}',     -- {questionNo: seconds}
  est_score numeric,
  readiness numeric
);

create table public.studio_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id text references public.studio_tasks (id),
  plan_id uuid references public.daily_plans (id) on delete set null,
  mock_attempt_id uuid references public.mock_attempts (id) on delete cascade,
  question_no int,
  context text not null check (context in ('test', 'daily', 'mock', 'mains', 'sketch')),
  image_paths text[] not null default '{}',
  time_limit_s int,
  time_used_s int,
  hints_used int not null default 0,
  self_scores jsonb,
  ai_scores jsonb,
  ai_provider text,
  mentor_scores jsonb,
  mentor_comment text,
  final_score numeric,                         -- 0..100, mentor > ai > self
  checklist jsonb,                             -- examiner checklist ticks
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index studio_submissions_user_time on public.studio_submissions (user_id, created_at desc);

create table public.reflections (
  user_id uuid not null references auth.users (id) on delete cascade,
  day_no int not null,
  mood smallint check (mood between 1 and 5),
  energy smallint check (energy between 1 and 5),
  sleep_hours numeric check (sleep_hours between 0 and 24),
  learned text,
  observation text,                            -- daily observation journal
  created_at timestamptz not null default now(),
  primary key (user_id, day_no)
);

create table public.sketch_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  minutes int not null check (minutes > 0),
  image_path text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table public.badges (
  user_id uuid not null references auth.users (id) on delete cascade,
  badge_id text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create table public.interview_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  question text not null,
  audio_path text,
  transcript text,
  self_notes text,
  mentor_comment text,
  ai_feedback jsonb,
  created_at timestamptz not null default now()
);

create table public.checklist_ticks (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null,
  done_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table public.item_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null references public.items (id),
  reason text not null,
  status text not null default 'open' check (status in ('open', 'fixed', 'dismissed')),
  created_at timestamptz not null default now()
);

create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  provider text not null,
  model text not null,
  purpose text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric not null default 0,
  created_at timestamptz not null default now()
);

-- ───────────────────────────────── RLS ─────────────────────────────────────

do $$
declare t text;
begin
  -- content: read for signed-in users, write for mentor
  foreach t in array array['categories','subtopics','images','items','generators_log','concept_cards','studio_tasks','mocks','tips','settings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s read" on public.%1$I for select to authenticated using (true)', t);
    execute format('create policy "%1$s mentor write" on public.%1$I for all to authenticated using (public.is_mentor()) with check (public.is_mentor())', t);
  end loop;

  -- personal data: owner full access, mentor read
  foreach t in array array['daily_plans','attempts','served_items','skill_ratings','srs_cards','homework','mock_attempts','studio_submissions','reflections','sketch_logs','badges','interview_answers','checklist_ticks','item_reports','ai_usage'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "%1$s owner" on public.%1$I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    execute format('create policy "%1$s mentor read" on public.%1$I for select to authenticated using (public.is_mentor())', t);
  end loop;
end $$;

-- Mentor may score studio work, comment on interview answers and triage reports.
create policy "studio_submissions mentor review" on public.studio_submissions
  for update to authenticated using (public.is_mentor()) with check (public.is_mentor());
create policy "interview_answers mentor review" on public.interview_answers
  for update to authenticated using (public.is_mentor()) with check (public.is_mentor());
create policy "item_reports mentor triage" on public.item_reports
  for update to authenticated using (public.is_mentor()) with check (public.is_mentor());

alter table public.profiles enable row level security;
create policy "profiles self read" on public.profiles for select to authenticated using (id = auth.uid() or public.is_mentor());
create policy "profiles self update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and role = (select p.role from public.profiles p where p.id = auth.uid()));

-- Near-duplicate check used by the content importer.
create or replace function public.similar_items(q text, threshold real default 0.85)
returns table (id text, stem text, sim real)
language sql stable as $$
  select i.id, i.stem, similarity(i.stem, q) as sim
  from public.items i
  where similarity(i.stem, q) > threshold
  order by sim desc
  limit 5;
$$;

-- ─────────────────────────────── storage ───────────────────────────────────
-- sheets: private, path = <user_id>/<…>. content-images: public read, mentor write.

insert into storage.buckets (id, name, public) values ('sheets', 'sheets', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('content-images', 'content-images', true) on conflict do nothing;

create policy "sheets owner" on storage.objects for all to authenticated
  using (bucket_id = 'sheets' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'sheets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "sheets mentor read" on storage.objects for select to authenticated
  using (bucket_id = 'sheets' and public.is_mentor());
create policy "content images mentor write" on storage.objects for all to authenticated
  using (bucket_id = 'content-images' and public.is_mentor())
  with check (bucket_id = 'content-images' and public.is_mentor());

-- Live updates for dashboards.
alter publication supabase_realtime add table public.attempts, public.studio_submissions, public.daily_plans;
