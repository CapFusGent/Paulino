-- LOCAL DEVELOPMENT / TEST ONLY. Never run this against a Supabase project:
-- Supabase already provides these roles, the auth schema and auth.uid().
-- It recreates the parts of Supabase the migrations depend on, so the very
-- same migrations can be exercised in PGlite (in-process Postgres).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null unique,
  encrypted_password text not null,
  created_at         timestamptz not null default now()
);

-- Same definition Supabase uses.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                         (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')), '')::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
