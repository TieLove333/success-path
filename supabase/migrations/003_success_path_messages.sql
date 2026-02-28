-- 003_success_path_messages.sql
-- Create messages table to persist chat history per session with optional step/task scoping metadata
--
-- Design notes:
-- - Messages belong to a success_path_session and a user.
-- - "role" is constrained to user/assistant/system.
-- - step_id/task_id are optional metadata so we can reconstruct scoped help contexts.
-- - We index by (session_id, created_at) for fast "load last N messages" queries.

create table if not exists public.success_path_messages (
  id uuid primary key default gen_random_uuid(),

  session_id uuid not null references public.success_path_sessions(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,

  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,

  -- Optional scoping metadata (helps with "Get help on this" + debugging)
  step_id text,
  task_id text,

  created_at timestamptz not null default now()
);

create index if not exists success_path_messages_session_created_at_idx
  on public.success_path_messages (session_id, created_at);

create index if not exists success_path_messages_user_id_idx
  on public.success_path_messages (user_id);

create index if not exists success_path_messages_step_id_idx
  on public.success_path_messages (step_id);

create index if not exists success_path_messages_task_id_idx
  on public.success_path_messages (task_id);

comment on table public.success_path_messages is
'Chat messages for a Success Path session. Includes optional step/task metadata for scoped help contexts.';

comment on column public.success_path_messages.role is
'Message role: user, assistant, or system.';

comment on column public.success_path_messages.step_id is
'Optional curriculum step id active when the message was created (e.g., "m1.s01").';

comment on column public.success_path_messages.task_id is
'Optional curriculum task id active when the message was created (e.g., "m1.s01.t03").';
