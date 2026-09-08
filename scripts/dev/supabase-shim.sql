-- Local-only stand-in for the parts of a Supabase project the migrations
-- depend on: the auth and storage schemas, and the three PostgREST roles.
-- Used by scripts/dev/db-test.sh to run the real migrations against a real
-- Postgres. Never applied to a Supabase project — it is already there.

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
grant anon, authenticated, service_role to postgres;

create schema if not exists auth;
create schema if not exists storage;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Supabase reads the JWT from a request-local GUC; the shim reads the same
-- one, so the policies under test are the policies that ship.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid
);
alter table storage.objects enable row level security;

grant usage on schema public, auth, storage to anon, authenticated, service_role;

-- Supabase hands anon, authenticated and service_role blanket grants on
-- everything created in `public`, and relies on RLS alone to restrict them.
-- The shim has to do the same or the tests would be passing against a
-- tighter database than the real one — which is the direction that hides
-- exactly the bugs these tests exist to catch.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
