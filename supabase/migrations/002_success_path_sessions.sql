-- 002_success_path_sessions.sql
-- Create session table to persist active step/task and progress for each WordPress user
--
-- v1 design:
-- - one "active" session per user (enforced via partial unique index)
-- - stores active step/task + completed item ids as JSONB (flexible as curriculum evolves)
-- - WordPress remains the Identity Provider; we key via app_users.id (UUID)
--
-- Notes:
-- - We intentionally keep step/task ids as TEXT because your curriculum ids are strings (e.g., "m1.s01", "m1.s01.t03").
-- - "completed_item_ids" should store checklist/subtask ids (strings).
-- - "diagnostic_answers" stores the yes/no diagnostic results that drove routing (optional).

create table if not exists public.success_path_sessions (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references public.app_users(id) on delete cascade,

  status text not null default 'active'
    check (status in ('active', 'completed', 'archived')),

  -- Current working context
  active_step_id text,
  active_task_id text,

  -- Progress
  completed_item_ids jsonb not null default '[]'::jsonb,

  -- Optional diagnostic snapshot
  diagnostic_answers jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enforce at most one active session per user (v1).
create unique index if not exists success_path_sessions_one_active_per_user
  on public.success_path_sessions(user_id)
  where status = 'active';

create index if not exists success_path_sessions_user_id_idx
  on public.success_path_sessions(user_id);

create index if not exists success_path_sessions_active_step_id_idx
  on public.success_path_sessions(active_step_id);

comment on table public.success_path_sessions is
'Stores a user’s Success Path session (active step/task + progress). One active session per user in v1.';

comment on column public.success_path_sessions.active_step_id is
'Curriculum Step ID (e.g., "m1.s01").';

comment on column public.success_path_sessions.active_task_id is
'Curriculum Task ID currently in focus (e.g., "m1.s01.t03"), usually set by "Get help on this".';

comment on column public.success_path_sessions.completed_item_ids is
'JSON array of completed checklist/subtask ids (strings).';

comment on column public.success_path_sessions.diagnostic_answers is
'Optional JSON capturing diagnostic answers used for routing (e.g., [{questionId, answer}]).';
