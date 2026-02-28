-- 004_updated_at_triggers.sql
-- Add updated_at trigger function and attach to tables that need it
--
-- Safe to run multiple times.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- app_users
drop trigger if exists trg_app_users_set_updated_at on public.app_users;
create trigger trg_app_users_set_updated_at
before update on public.app_users
for each row
execute procedure public.set_updated_at();

-- success_path_sessions
drop trigger if exists trg_success_path_sessions_set_updated_at on public.success_path_sessions;
create trigger trg_success_path_sessions_set_updated_at
before update on public.success_path_sessions
for each row
execute procedure public.set_updated_at();
