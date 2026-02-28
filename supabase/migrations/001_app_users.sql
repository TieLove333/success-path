-- 001_app_users.sql
-- Create table for mapping WordPress users to internal app users
--
-- This table is the "identity glue" between WordPress (IdP) and Supabase storage.
-- We do NOT use Supabase Auth for end-user auth in v1; server routes will verify
-- the WordPress session and then read/write rows using the service role key.

create table if not exists public.app_users (
  -- Internal UUID for joins across tables
  id uuid primary key default gen_random_uuid(),

  -- WordPress user ID (wp_users.ID). Stored as bigint for safety.
  wp_user_id bigint not null unique,

  -- Optional denormalized fields (useful for debugging/admin)
  wp_email text,
  wp_display_name text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_users_wp_user_id_idx
  on public.app_users (wp_user_id);

comment on table public.app_users is
'Maps a WordPress user (wp_user_id) to an internal UUID (id) used by the Success Path app.';

comment on column public.app_users.wp_user_id is
'WordPress wp_users.ID. Used as the stable external identity key.';

comment on column public.app_users.wp_email is
'Optional snapshot of the WP user email for debugging/admin use. Not used for auth.';

comment on column public.app_users.wp_display_name is
'Optional snapshot of the WP display name for debugging/admin use. Not used for auth.';
