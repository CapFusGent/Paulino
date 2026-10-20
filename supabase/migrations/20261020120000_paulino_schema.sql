-- =============================================================================
-- PAULINO — schema, access control and RPC API
--
-- Access model
--   * Coach (Paul) signs in with Supabase Auth. Every coach-facing function is
--     SECURITY INVOKER, so row-level security (coach_id = auth.uid()) is what
--     actually protects the data.
--   * Clients never sign in. They hold a 64-hex-character secret link token.
--     The anon role has NO table privileges at all; clients can only call the
--     client_* SECURITY DEFINER functions, which resolve the token to exactly
--     one client and only ever touch that client's rows.
--   * Prescriptions (what Paul planned) and logs (what the athlete did) live in
--     separate tables. Client deviations are stored apart from the prescription
--     so Paul's original is never modified by a client.
-- =============================================================================

create schema if not exists private;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- 2 × uuid v4 = 244 bits of randomness, no pgcrypto dependency.
create or replace function private.new_token() returns text
language sql volatile as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
$$;

-- Validates a prescription's set list:
-- [{ "reps": 5, "reps_max": null, "load": {"kind":"kg","value":60}, "rpe": 8, "rir": null }, ...]
-- load.kind: kg | bw (bodyweight) | bw_plus (bodyweight + value kg) | pct_top (value % of set 1)
create or replace function private.valid_sets(p jsonb) returns boolean
language plpgsql immutable as $$
declare
  s jsonb;
  k text;
begin
  if p is null or jsonb_typeof(p) <> 'array' then return false; end if;
  if jsonb_array_length(p) < 1 or jsonb_array_length(p) > 30 then return false; end if;
  for s in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(s) <> 'object' then return false; end if;
    if jsonb_typeof(s->'reps') <> 'number' then return false; end if;
    if (s->>'reps')::numeric <> floor((s->>'reps')::numeric) then return false; end if;
    if (s->>'reps')::int < 1 or (s->>'reps')::int > 100 then return false; end if;
    if s ? 'reps_max' and jsonb_typeof(s->'reps_max') <> 'null' then
      if jsonb_typeof(s->'reps_max') <> 'number' or (s->>'reps_max')::numeric < (s->>'reps')::numeric
         or (s->>'reps_max')::numeric > 100 then return false; end if;
    end if;
    if jsonb_typeof(s->'load') <> 'object' then return false; end if;
    k := s->'load'->>'kind';
    if k not in ('kg', 'bw', 'bw_plus', 'pct_top') then return false; end if;
    if k in ('kg', 'bw_plus') then
      if jsonb_typeof(s->'load'->'value') <> 'number' then return false; end if;
      if (s->'load'->>'value')::numeric < 0 or (s->'load'->>'value')::numeric > 1000 then return false; end if;
    end if;
    if k = 'pct_top' then
      if jsonb_typeof(s->'load'->'value') <> 'number' then return false; end if;
      if (s->'load'->>'value')::numeric <= 0 or (s->'load'->>'value')::numeric > 100 then return false; end if;
    end if;
    if s ? 'rpe' and jsonb_typeof(s->'rpe') <> 'null' then
      if jsonb_typeof(s->'rpe') <> 'number' or (s->>'rpe')::numeric < 1 or (s->>'rpe')::numeric > 10 then return false; end if;
    end if;
    if s ? 'rir' and jsonb_typeof(s->'rir') <> 'null' then
      if jsonb_typeof(s->'rir') <> 'number' or (s->>'rir')::numeric < 0 or (s->>'rir')::numeric > 10 then return false; end if;
    end if;
  end loop;
  return true;
end $$;

-- Optional progression rule. null = no automatic load changes (the default).
-- {"type":"linear","increment_kg":2.5}  →  add increment after a session where
-- every prescribed set was completed at its target reps; otherwise repeat.
create or replace function private.valid_progression(p jsonb) returns boolean
language sql immutable as $$
  select p is null or jsonb_typeof(p) = 'null' or (
    jsonb_typeof(p) = 'object'
    and p->>'type' = 'linear'
    and jsonb_typeof(p->'increment_kg') = 'number'
    and (p->>'increment_kg')::numeric > 0
    and (p->>'increment_kg')::numeric <= 50
  )
$$;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  role         text not null default 'coach' check (role = 'coach'),
  display_name text not null default 'Paul' check (length(btrim(display_name)) between 1 and 80),
  created_at   timestamptz not null default now()
);

create table public.clients (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null references public.profiles (id) on delete cascade,
  role         text not null default 'client' check (role = 'client'),
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  access_token text not null unique default private.new_token() check (access_token ~ '^[0-9a-f]{64}$'),
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index clients_coach_idx on public.clients (coach_id);

create table public.exercises (
  id          text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,59}$'),
  name        text not null check (length(btrim(name)) between 1 and 80),
  category    text not null check (category in ('squat', 'bench', 'deadlift', 'accessory')),
  description text not null default '',
  tips        jsonb not null default '{}'::jsonb check (jsonb_typeof(tips) = 'object'),
  coach_id    uuid references public.profiles (id) on delete cascade, -- null = core library
  created_at  timestamptz not null default now()
);

create table public.programs (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references public.profiles (id) on delete cascade,
  client_id  uuid references public.clients (id) on delete set null,
  name       text not null check (length(btrim(name)) between 1 and 120),
  status     text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  notes      text not null default '' check (length(notes) <= 4000),
  version    integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index programs_coach_idx on public.programs (coach_id);
create unique index programs_one_active_per_client on public.programs (client_id) where status = 'active';

create table public.blocks (
  id         uuid primary key,
  program_id uuid not null references public.programs (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 120),
  position   integer not null check (position >= 0),
  start_date date,
  end_date   date,
  notes      text not null default '' check (length(notes) <= 2000),
  unique (id, program_id),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.workouts (
  id             uuid primary key,
  program_id     uuid not null,
  block_id       uuid not null,
  name           text not null check (length(btrim(name)) between 1 and 120),
  scheduled_date date,
  position       integer not null check (position >= 0),
  notes          text not null default '' check (length(notes) <= 2000),
  -- composite FK: a workout can only sit in a block of the same program
  foreign key (block_id, program_id) references public.blocks (id, program_id) on delete cascade
);
create index workouts_program_idx on public.workouts (program_id);

create table public.prescriptions (
  id           uuid primary key,
  workout_id   uuid not null references public.workouts (id) on delete cascade,
  exercise_id  text not null references public.exercises (id),
  position     integer not null check (position >= 0),
  sets         jsonb not null check (private.valid_sets(sets)),
  rest_seconds integer check (rest_seconds is null or rest_seconds between 0 and 1800),
  tempo        text check (tempo is null or length(tempo) <= 20),
  coach_notes  text not null default '' check (length(coach_notes) <= 2000),
  progression  jsonb check (private.valid_progression(progression))
);
create index prescriptions_workout_idx on public.prescriptions (workout_id);

-- Every coach save stores a full snapshot so revisions stay distinguishable
-- from client deviations.
create table public.program_revisions (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs (id) on delete cascade,
  version    integer not null,
  snapshot   jsonb not null,
  saved_by   uuid not null,
  saved_at   timestamptz not null default now(),
  unique (program_id, version)
);

create table public.workout_logs (
  id                uuid primary key,
  client_id         uuid not null references public.clients (id) on delete cascade,
  program_id        uuid references public.programs (id) on delete set null,
  workout_id        uuid references public.workouts (id) on delete set null,
  -- frozen copy of what was prescribed when the log was written: later program
  -- edits never change history.
  workout_snapshot  jsonb not null,
  status            text not null check (status in ('in_progress', 'completed', 'skipped')),
  skip_reason       text check (skip_reason is null or skip_reason in ('illness', 'pain', 'schedule', 'other')),
  started_at        timestamptz,
  completed_at      timestamptz,
  session_rpe       numeric check (session_rpe is null or session_rpe between 1 and 10),
  pain_reported     boolean not null default false,
  notes             text not null default '' check (length(notes) <= 2000),
  client_updated_at timestamptz not null,
  server_updated_at timestamptz not null default now()
);
create unique index workout_logs_one_per_workout on public.workout_logs (client_id, workout_id) where workout_id is not null;
create index workout_logs_client_idx on public.workout_logs (client_id);

create table public.set_logs (
  id               uuid primary key default gen_random_uuid(),
  workout_log_id   uuid not null references public.workout_logs (id) on delete cascade,
  prescription_id  uuid,          -- no FK on purpose: history survives prescription deletion
  exercise_id      text not null,
  exercise_position integer not null check (exercise_position >= 0),
  set_index        integer not null check (set_index >= 0),
  target           jsonb,
  actual_reps      integer check (actual_reps is null or actual_reps between 0 and 200),
  actual_load_kg   numeric check (actual_load_kg is null or actual_load_kg between 0 and 1000),
  rpe              numeric check (rpe is null or rpe between 1 and 10),
  completed        boolean not null default false,
  notes            text not null default '' check (length(notes) <= 500),
  unique (workout_log_id, exercise_position, set_index)
);

create table public.deviations (
  id                uuid primary key,
  client_id         uuid not null references public.clients (id) on delete cascade,
  program_id        uuid references public.programs (id) on delete set null,
  workout_id        uuid references public.workouts (id) on delete set null,
  prescription_id   uuid,          -- null when the athlete added an exercise
  modification_type text not null check (modification_type in
    ('replace_exercise', 'remove_exercise', 'add_exercise', 'change_sets', 'change_reps', 'change_load', 'change_structure')),
  reason            text not null default 'preference' check (reason in ('preference', 'pain', 'fatigue', 'equipment', 'other')),
  original          jsonb,         -- written by the server from Paul's prescription, never by the client
  modified          jsonb not null,
  status            text not null default 'active' check (status in ('active', 'reverted', 'superseded')),
  created_at        timestamptz not null default now(),
  reverted_at       timestamptz,
  client_updated_at timestamptz not null
);
create index deviations_client_idx on public.deviations (client_id);

-- -----------------------------------------------------------------------------
-- Integrity triggers
-- -----------------------------------------------------------------------------

-- A program can only be assigned to a client of the same coach.
create or replace function private.check_program_client() returns trigger
language plpgsql as $$
begin
  if new.client_id is not null and not exists (
    select 1 from public.clients c where c.id = new.client_id and c.coach_id = new.coach_id
  ) then
    raise exception 'invalid_assignment' using errcode = '23514', detail = 'client belongs to another coach';
  end if;
  return new;
end $$;
create trigger programs_client_same_coach before insert or update of client_id, coach_id on public.programs
  for each row execute function private.check_program_client();

-- A prescription can only use a core exercise or one of the program coach's own.
create or replace function private.check_prescription_exercise() returns trigger
language plpgsql as $$
declare v_coach uuid;
begin
  select p.coach_id into v_coach
    from public.workouts w join public.programs p on p.id = w.program_id
   where w.id = new.workout_id;
  if not exists (
    select 1 from public.exercises e
     where e.id = new.exercise_id and (e.coach_id is null or e.coach_id = v_coach)
  ) then
    raise exception 'unknown_exercise' using errcode = '23503', detail = new.exercise_id;
  end if;
  return new;
end $$;
create trigger prescriptions_exercise_allowed before insert or update of exercise_id, workout_id on public.prescriptions
  for each row execute function private.check_prescription_exercise();

-- -----------------------------------------------------------------------------
-- Row-level security
-- -----------------------------------------------------------------------------

alter table public.profiles          enable row level security;
alter table public.clients           enable row level security;
alter table public.exercises         enable row level security;
alter table public.programs          enable row level security;
alter table public.blocks            enable row level security;
alter table public.workouts          enable row level security;
alter table public.prescriptions     enable row level security;
alter table public.program_revisions enable row level security;
alter table public.workout_logs      enable row level security;
alter table public.set_logs          enable row level security;
alter table public.deviations        enable row level security;

create policy profiles_self on public.profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy clients_owner on public.clients for all to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());

create policy exercises_read on public.exercises for select to authenticated
  using (coach_id is null or coach_id = auth.uid());
create policy exercises_own_write on public.exercises for insert to authenticated
  with check (coach_id = auth.uid());
create policy exercises_own_update on public.exercises for update to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());
create policy exercises_own_delete on public.exercises for delete to authenticated
  using (coach_id = auth.uid());

create policy programs_owner on public.programs for all to authenticated
  using (coach_id = auth.uid()) with check (coach_id = auth.uid());

create policy blocks_owner on public.blocks for all to authenticated
  using (exists (select 1 from public.programs p where p.id = program_id and p.coach_id = auth.uid()))
  with check (exists (select 1 from public.programs p where p.id = program_id and p.coach_id = auth.uid()));

create policy workouts_owner on public.workouts for all to authenticated
  using (exists (select 1 from public.programs p where p.id = program_id and p.coach_id = auth.uid()))
  with check (exists (select 1 from public.programs p where p.id = program_id and p.coach_id = auth.uid()));

create policy prescriptions_owner on public.prescriptions for all to authenticated
  using (exists (select 1 from public.workouts w join public.programs p on p.id = w.program_id
                  where w.id = workout_id and p.coach_id = auth.uid()))
  with check (exists (select 1 from public.workouts w join public.programs p on p.id = w.program_id
                       where w.id = workout_id and p.coach_id = auth.uid()));

create policy revisions_owner_read on public.program_revisions for select to authenticated
  using (exists (select 1 from public.programs p where p.id = program_id and p.coach_id = auth.uid()));
create policy revisions_owner_insert on public.program_revisions for insert to authenticated
  with check (saved_by = auth.uid() and exists (select 1 from public.programs p where p.id = program_id and p.coach_id = auth.uid()));

-- Coaches may read, never write, what their athletes logged.
create policy logs_coach_read on public.workout_logs for select to authenticated
  using (exists (select 1 from public.clients c where c.id = client_id and c.coach_id = auth.uid()));
create policy set_logs_coach_read on public.set_logs for select to authenticated
  using (exists (select 1 from public.workout_logs l join public.clients c on c.id = l.client_id
                  where l.id = workout_log_id and c.coach_id = auth.uid()));
create policy deviations_coach_read on public.deviations for select to authenticated
  using (exists (select 1 from public.clients c where c.id = client_id and c.coach_id = auth.uid()));

-- Table privileges: anon gets nothing. Authenticated is fenced in by RLS above.
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select, insert, update, delete on public.profiles, public.clients, public.exercises, public.programs,
  public.blocks, public.workouts, public.prescriptions to authenticated;
grant select, insert on public.program_revisions to authenticated;
grant select on public.workout_logs, public.set_logs, public.deviations to authenticated;

-- -----------------------------------------------------------------------------
-- Shared JSON builders (private schema is not exposed through the REST API)
-- -----------------------------------------------------------------------------

create or replace function private.prescription_json(p public.prescriptions) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', p.id, 'exercise_id', p.exercise_id, 'position', p.position, 'sets', p.sets,
    'rest_seconds', p.rest_seconds, 'tempo', p.tempo, 'coach_notes', p.coach_notes,
    'progression', p.progression)
$$;

-- SECURITY INVOKER: a coach calling it only sees rows RLS lets them see.
create or replace function private.program_json(p_id uuid) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'coach_id', p.coach_id, 'client_id', p.client_id,
    'status', p.status, 'notes', p.notes, 'version', p.version,
    'created_at', p.created_at, 'updated_at', p.updated_at,
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'name', b.name, 'position', b.position, 'start_date', b.start_date,
        'end_date', b.end_date, 'notes', b.notes,
        'workouts', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', w.id, 'name', w.name, 'scheduled_date', w.scheduled_date,
            'position', w.position, 'notes', w.notes,
            'prescriptions', coalesce((
              select jsonb_agg(private.prescription_json(x) order by x.position)
                from public.prescriptions x where x.workout_id = w.id), '[]'::jsonb)
          ) order by w.position, w.scheduled_date nulls last)
            from public.workouts w where w.block_id = b.id), '[]'::jsonb)
      ) order by b.position)
        from public.blocks b where b.program_id = p.id), '[]'::jsonb)
  )
  from public.programs p where p.id = p_id
$$;

create or replace function private.log_json(l public.workout_logs) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', l.id, 'client_id', l.client_id, 'program_id', l.program_id, 'workout_id', l.workout_id,
    'workout_snapshot', l.workout_snapshot, 'status', l.status, 'skip_reason', l.skip_reason,
    'started_at', l.started_at, 'completed_at', l.completed_at, 'session_rpe', l.session_rpe,
    'pain_reported', l.pain_reported, 'notes', l.notes,
    'client_updated_at', l.client_updated_at, 'server_updated_at', l.server_updated_at,
    'sets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'prescription_id', s.prescription_id, 'exercise_id', s.exercise_id,
        'exercise_position', s.exercise_position, 'set_index', s.set_index, 'target', s.target,
        'actual_reps', s.actual_reps, 'actual_load_kg', s.actual_load_kg, 'rpe', s.rpe,
        'completed', s.completed, 'notes', s.notes)
        order by s.exercise_position, s.set_index)
        from public.set_logs s where s.workout_log_id = l.id), '[]'::jsonb))
$$;

create or replace function private.deviation_json(d public.deviations) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', d.id, 'client_id', d.client_id, 'program_id', d.program_id, 'workout_id', d.workout_id,
    'prescription_id', d.prescription_id, 'modification_type', d.modification_type,
    'reason', d.reason, 'original', d.original, 'modified', d.modified, 'status', d.status,
    'created_at', d.created_at, 'reverted_at', d.reverted_at, 'client_updated_at', d.client_updated_at)
$$;

create or replace function private.exercise_json(e public.exercises) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', e.id, 'name', e.name, 'category', e.category,
    'description', e.description, 'tips', e.tips, 'custom', e.coach_id is not null)
$$;

create or replace function private.require_coach() returns uuid
language plpgsql stable as $$
declare v uuid := auth.uid();
begin
  if v is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return v;
end $$;

-- =============================================================================
-- Coach API  (SECURITY INVOKER → protected by RLS)
-- =============================================================================

create or replace function public.coach_me(p_display_name text default null) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_coach(); r public.profiles;
begin
  insert into public.profiles (id, display_name) values (v_uid, coalesce(nullif(btrim(p_display_name), ''), 'Paul'))
  on conflict (id) do update set display_name = coalesce(nullif(btrim(p_display_name), ''), public.profiles.display_name)
  returning * into r;
  return jsonb_build_object('id', r.id, 'role', r.role, 'display_name', r.display_name);
end $$;

create or replace function public.coach_dashboard() returns jsonb
language plpgsql security invoker stable set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_coach();
begin
  return jsonb_build_object(
    'profile', (select jsonb_build_object('id', id, 'role', role, 'display_name', display_name)
                  from public.profiles where id = v_uid),
    'clients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'display_name', c.display_name, 'access_token', c.access_token,
        'archived', c.archived, 'created_at', c.created_at,
        'active_program_id', (select p.id from public.programs p where p.client_id = c.id and p.status = 'active'),
        'completed_workouts', (select count(*) from public.workout_logs l where l.client_id = c.id and l.status = 'completed'),
        'last_activity', (select max(l.client_updated_at) from public.workout_logs l where l.client_id = c.id),
        'active_deviations', (select count(*) from public.deviations d where d.client_id = c.id and d.status = 'active')
      ) order by c.archived, c.display_name)
      from public.clients c where c.coach_id = v_uid), '[]'::jsonb),
    'programs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'client_id', p.client_id, 'status', p.status,
        'version', p.version, 'updated_at', p.updated_at, 'created_at', p.created_at,
        'workout_count', (select count(*) from public.workouts w where w.program_id = p.id),
        'first_date', (select min(w.scheduled_date) from public.workouts w where w.program_id = p.id),
        'last_date', (select max(w.scheduled_date) from public.workouts w where w.program_id = p.id)
      ) order by p.updated_at desc)
      from public.programs p where p.coach_id = v_uid), '[]'::jsonb));
end $$;

create or replace function public.coach_create_client(p_display_name text) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_coach(); r public.clients;
begin
  perform public.coach_me(null);
  insert into public.clients (coach_id, display_name) values (v_uid, btrim(p_display_name)) returning * into r;
  return jsonb_build_object('id', r.id, 'display_name', r.display_name, 'access_token', r.access_token,
                            'archived', r.archived, 'created_at', r.created_at);
end $$;

create or replace function public.coach_update_client(p_client_id uuid, p_display_name text, p_archived boolean default false)
returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_coach(); r public.clients;
begin
  update public.clients set display_name = btrim(p_display_name), archived = coalesce(p_archived, false)
   where id = p_client_id and coach_id = v_uid returning * into r;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object('id', r.id, 'display_name', r.display_name, 'access_token', r.access_token, 'archived', r.archived);
end $$;

-- Invalidates the old link immediately.
create or replace function public.coach_rotate_client_link(p_client_id uuid) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_coach(); r public.clients;
begin
  update public.clients set access_token = private.new_token()
   where id = p_client_id and coach_id = v_uid returning * into r;
  if r.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object('id', r.id, 'access_token', r.access_token);
end $$;

create or replace function public.coach_list_exercises() returns jsonb
language sql security invoker stable set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(private.exercise_json(e) order by e.coach_id nulls first, e.name), '[]'::jsonb)
    from public.exercises e
$$;

-- Paul approves new exercises by adding them himself.
create or replace function public.coach_add_exercise(p_name text, p_category text, p_description text default '')
returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_coach();
  v_slug text := 'c-' || left(regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g'), 40)
                 || '-' || left(replace(gen_random_uuid()::text, '-', ''), 6);
  r public.exercises;
begin
  perform public.coach_me(null);
  v_slug := regexp_replace(v_slug, '-+', '-', 'g');
  insert into public.exercises (id, name, category, description, coach_id)
  values (v_slug, btrim(p_name), p_category, coalesce(p_description, ''), v_uid) returning * into r;
  return private.exercise_json(r);
end $$;

create or replace function public.coach_get_program(p_program_id uuid) returns jsonb
language plpgsql security invoker stable set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_coach(); v jsonb;
begin
  v := private.program_json(p_program_id);
  if v is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return v;
end $$;

-- Saves the whole program tree in one transaction.
-- p_expected_version: the version the editor loaded (null for a brand new program).
-- A mismatch means it was saved elsewhere in the meantime → 'version_conflict'.
create or replace function public.coach_save_program(p_program jsonb, p_expected_version integer default null)
returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_uid     uuid := private.require_coach();
  v_id      uuid := (p_program->>'id')::uuid;
  v_client  uuid := nullif(p_program->>'client_id', '')::uuid;
  v_status  text := coalesce(p_program->>'status', 'draft');
  v_current public.programs;
  v_version integer;
  b jsonb; w jsonb; x jsonb;
  bi integer := 0; wi integer; xi integer;
  v_block_ids uuid[] := '{}';
  v_workout_ids uuid[] := '{}';
  v_presc_ids uuid[] := '{}';
  v_snapshot jsonb;
begin
  perform public.coach_me(null);
  if v_id is null then raise exception 'invalid_program' using errcode = '22023', detail = 'missing id'; end if;
  if jsonb_typeof(p_program->'blocks') <> 'array' then
    raise exception 'invalid_program' using errcode = '22023', detail = 'blocks must be an array';
  end if;

  select * into v_current from public.programs where id = v_id for update;
  if v_current.id is null then
    if exists (select 1 from public.programs where id = v_id) then  -- not reachable under RLS, kept for clarity
      raise exception 'forbidden' using errcode = '42501';
    end if;
    insert into public.programs (id, coach_id, client_id, name, status, notes)
    -- inserted as draft; the final status is applied below, after other active programs are archived
    values (v_id, v_uid, v_client, btrim(p_program->>'name'), 'draft', coalesce(p_program->>'notes', ''));
    v_version := 1;
  else
    if p_expected_version is distinct from v_current.version then
      raise exception 'version_conflict' using errcode = 'PT409',
        detail = format('expected %s, current %s', p_expected_version, v_current.version);
    end if;
    v_version := v_current.version + 1;
  end if;

  if v_status = 'active' and v_client is not null then
    update public.programs set status = 'archived', updated_at = now()
     where client_id = v_client and status = 'active' and id <> v_id;
  end if;

  update public.programs
     set name = btrim(p_program->>'name'), client_id = v_client, status = v_status,
         notes = coalesce(p_program->>'notes', ''), version = v_version, updated_at = now()
   where id = v_id;

  -- Collect ids and make sure none of them belongs to a different program.
  for b in select * from jsonb_array_elements(p_program->'blocks') loop
    v_block_ids := v_block_ids || (b->>'id')::uuid;
    for w in select * from jsonb_array_elements(coalesce(b->'workouts', '[]')) loop
      v_workout_ids := v_workout_ids || (w->>'id')::uuid;
      for x in select * from jsonb_array_elements(coalesce(w->'prescriptions', '[]')) loop
        v_presc_ids := v_presc_ids || (x->>'id')::uuid;
      end loop;
    end loop;
  end loop;
  if exists (select 1 from public.blocks where id = any (v_block_ids) and program_id <> v_id)
     or exists (select 1 from public.workouts where id = any (v_workout_ids) and program_id <> v_id)
     or exists (select 1 from public.prescriptions x join public.workouts w on w.id = x.workout_id
                 where x.id = any (v_presc_ids) and w.program_id <> v_id) then
    raise exception 'invalid_program' using errcode = '22023', detail = 'ids belong to another program';
  end if;

  -- Remove what the editor removed. Logs keep their snapshot (workout_id → null).
  delete from public.prescriptions x using public.workouts w
   where w.id = x.workout_id and w.program_id = v_id and not (x.id = any (v_presc_ids));
  delete from public.workouts where program_id = v_id and not (id = any (v_workout_ids));
  delete from public.blocks where program_id = v_id and not (id = any (v_block_ids));

  for b in select * from jsonb_array_elements(p_program->'blocks') loop
    insert into public.blocks (id, program_id, name, position, start_date, end_date, notes)
    values ((b->>'id')::uuid, v_id, btrim(b->>'name'), bi,
            nullif(b->>'start_date', '')::date, nullif(b->>'end_date', '')::date, coalesce(b->>'notes', ''))
    on conflict (id) do update set name = excluded.name, position = excluded.position,
      start_date = excluded.start_date, end_date = excluded.end_date, notes = excluded.notes;
    wi := 0;
    for w in select * from jsonb_array_elements(coalesce(b->'workouts', '[]')) loop
      insert into public.workouts (id, program_id, block_id, name, scheduled_date, position, notes)
      values ((w->>'id')::uuid, v_id, (b->>'id')::uuid, btrim(w->>'name'),
              nullif(w->>'scheduled_date', '')::date, wi, coalesce(w->>'notes', ''))
      on conflict (id) do update set block_id = excluded.block_id, name = excluded.name,
        scheduled_date = excluded.scheduled_date, position = excluded.position, notes = excluded.notes;
      xi := 0;
      for x in select * from jsonb_array_elements(coalesce(w->'prescriptions', '[]')) loop
        insert into public.prescriptions (id, workout_id, exercise_id, position, sets, rest_seconds, tempo, coach_notes, progression)
        values ((x->>'id')::uuid, (w->>'id')::uuid, x->>'exercise_id', xi, x->'sets',
                nullif(x->>'rest_seconds', '')::integer, nullif(x->>'tempo', ''),
                coalesce(x->>'coach_notes', ''), nullif(x->'progression', 'null'::jsonb))
        on conflict (id) do update set workout_id = excluded.workout_id, exercise_id = excluded.exercise_id,
          position = excluded.position, sets = excluded.sets, rest_seconds = excluded.rest_seconds,
          tempo = excluded.tempo, coach_notes = excluded.coach_notes, progression = excluded.progression;
        xi := xi + 1;
      end loop;
      wi := wi + 1;
    end loop;
    bi := bi + 1;
  end loop;

  v_snapshot := private.program_json(v_id);
  insert into public.program_revisions (program_id, version, snapshot, saved_by)
  values (v_id, v_version, v_snapshot, v_uid);

  return jsonb_build_object('id', v_id, 'version', v_version, 'updated_at', v_snapshot->'updated_at', 'program', v_snapshot);
end $$;

-- Copies a program with fresh ids. p_shift_days moves every date (e.g. 84 for "next 12 weeks").
create or replace function public.coach_duplicate_program(p_program_id uuid, p_name text default null,
  p_client_id uuid default null, p_shift_days integer default 0) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_uid uuid := private.require_coach();
  src public.programs;
  v_new uuid := gen_random_uuid();
  b public.blocks; w public.workouts;
  nb uuid; nw uuid;
  v_shift integer := coalesce(p_shift_days, 0);
begin
  select * into src from public.programs where id = p_program_id;
  if src.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  insert into public.programs (id, coach_id, client_id, name, status, notes)
  values (v_new, v_uid, coalesce(p_client_id, src.client_id),
          coalesce(nullif(btrim(p_name), ''), left(src.name || ' (copy)', 120)), 'draft', src.notes);
  for b in select * from public.blocks where program_id = src.id order by position loop
    nb := gen_random_uuid();
    insert into public.blocks (id, program_id, name, position, start_date, end_date, notes)
    values (nb, v_new, b.name, b.position, b.start_date + v_shift, b.end_date + v_shift, b.notes);
    for w in select * from public.workouts where block_id = b.id order by position loop
      nw := gen_random_uuid();
      insert into public.workouts (id, program_id, block_id, name, scheduled_date, position, notes)
      values (nw, v_new, nb, w.name, w.scheduled_date + v_shift, w.position, w.notes);
      insert into public.prescriptions (id, workout_id, exercise_id, position, sets, rest_seconds, tempo, coach_notes, progression)
      select gen_random_uuid(), nw, x.exercise_id, x.position, x.sets, x.rest_seconds, x.tempo, x.coach_notes, x.progression
        from public.prescriptions x where x.workout_id = w.id;
    end loop;
  end loop;
  insert into public.program_revisions (program_id, version, snapshot, saved_by)
  values (v_new, 1, private.program_json(v_new), v_uid);
  return private.program_json(v_new);
end $$;

create or replace function public.coach_delete_program(p_program_id uuid) returns boolean
language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_coach(); n integer;
begin
  delete from public.programs where id = p_program_id and coach_id = v_uid;
  get diagnostics n = row_count;
  return n > 0;
end $$;

create or replace function public.coach_program_revisions(p_program_id uuid) returns jsonb
language sql security invoker stable set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('version', r.version, 'saved_at', r.saved_at) order by r.version desc), '[]'::jsonb)
    from public.program_revisions r where r.program_id = p_program_id
$$;

-- Everything Paul needs to compare prescription vs. performance for one athlete.
create or replace function public.coach_client_overview(p_client_id uuid) returns jsonb
language plpgsql security invoker stable set search_path = public, pg_temp as $$
declare v_uid uuid := private.require_coach(); c public.clients;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then raise exception 'not_found' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'client', jsonb_build_object('id', c.id, 'display_name', c.display_name, 'access_token', c.access_token, 'archived', c.archived),
    'program', (select private.program_json(p.id) from public.programs p where p.client_id = c.id and p.status = 'active'),
    'programs', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'status', p.status, 'updated_at', p.updated_at)
                            order by p.updated_at desc) from public.programs p where p.client_id = c.id), '[]'::jsonb),
    'logs', coalesce((select jsonb_agg(private.log_json(l) order by l.client_updated_at desc)
                        from public.workout_logs l where l.client_id = c.id), '[]'::jsonb),
    'deviations', coalesce((select jsonb_agg(private.deviation_json(d) order by d.created_at desc)
                              from public.deviations d where d.client_id = c.id), '[]'::jsonb),
    'exercises', public.coach_list_exercises());
end $$;

-- =============================================================================
-- Client API  (anon; SECURITY DEFINER, scoped by the secret link token)
-- =============================================================================

create or replace function private.client_by_token(p_token text) returns public.clients
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c public.clients;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_link' using errcode = '28000';
  end if;
  select * into c from public.clients where access_token = p_token and not archived;
  if c.id is null then raise exception 'invalid_link' using errcode = '28000'; end if;
  return c;
end $$;

create or replace function public.client_get_bundle(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c public.clients; v_program uuid;
begin
  c := private.client_by_token(p_token);
  select id into v_program from public.programs where client_id = c.id and status = 'active';
  return jsonb_build_object(
    'client', jsonb_build_object('id', c.id, 'display_name', c.display_name,
                                 'coach_name', (select display_name from public.profiles where id = c.coach_id)),
    'program', case when v_program is null then null else private.program_json(v_program) end,
    'exercises', coalesce((select jsonb_agg(private.exercise_json(e) order by e.name) from public.exercises e
                            where e.coach_id is null or e.coach_id = c.coach_id), '[]'::jsonb),
    'logs', coalesce((select jsonb_agg(private.log_json(l) order by l.client_updated_at desc)
                        from public.workout_logs l where l.client_id = c.id), '[]'::jsonb),
    'deviations', coalesce((select jsonb_agg(private.deviation_json(d) order by d.created_at)
                              from public.deviations d where d.client_id = c.id and d.program_id is not distinct from v_program), '[]'::jsonb),
    'server_time', now());
end $$;

-- What the athlete is currently asked to do for one workout: Paul's prescriptions
-- with the athlete's active deviations applied. Used to freeze log snapshots.
create or replace function private.effective_workout(p_client uuid, p_workout uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with base as (
    select x.id, x.position,
           private.prescription_json(x) as presc,
           (select d.modified from public.deviations d
             where d.client_id = p_client and d.prescription_id = x.id and d.status = 'active'
             order by d.created_at desc limit 1) as dev
      from public.prescriptions x where x.workout_id = p_workout
  ), added as (
    select d.modified as presc from public.deviations d
     where d.client_id = p_client and d.workout_id = p_workout and d.prescription_id is null and d.status = 'active'
  )
  select jsonb_build_object(
    'id', w.id, 'name', w.name, 'scheduled_date', w.scheduled_date, 'notes', w.notes,
    'prescriptions', coalesce((
      select jsonb_agg(q.p order by (q.p->>'position')::int) from (
        select case when dev is null then presc
                    else presc || (dev - 'id') || jsonb_build_object('deviated', true) end as p
          from base where dev is null or coalesce((dev->>'removed')::boolean, false) = false
        union all
        select presc || jsonb_build_object('deviated', true, 'added', true) from added
      ) q), '[]'::jsonb))
  from public.workouts w where w.id = p_workout
$$;

-- Batched, idempotent sync of the offline outbox.
-- Logs: newest client_updated_at wins; an older write is rejected ("stale") and
-- the server copy is returned so the device can adopt it. Nothing is silently lost.
create or replace function public.client_sync(p_token text, p_logs jsonb default '[]', p_deviations jsonb default '[]')
returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  c public.clients;
  l jsonb; d jsonb; s jsonb;
  v_workout public.workouts;
  v_existing public.workout_logs;
  v_log_id uuid;
  v_snapshot jsonb;
  v_presc public.prescriptions;
  v_existing_dev public.deviations;
  v_mod jsonb;
  v_status text;
  out_logs jsonb := '[]'; out_devs jsonb := '[]';
  v_ts timestamptz;
begin
  c := private.client_by_token(p_token);

  -- Deviations first, so a log written in the same batch snapshots them.
  for d in select * from jsonb_array_elements(coalesce(p_deviations, '[]')) loop
    v_ts := (d->>'client_updated_at')::timestamptz;
    select * into v_existing_dev from public.deviations where id = (d->>'id')::uuid;
    if v_existing_dev.id is not null then
      if v_existing_dev.client_id <> c.id then raise exception 'forbidden' using errcode = '42501'; end if;
      if v_existing_dev.client_updated_at >= v_ts then
        out_devs := out_devs || jsonb_build_object('id', v_existing_dev.id, 'result', 'stale', 'server', private.deviation_json(v_existing_dev));
        continue;
      end if;
      -- Only the status can change after creation (active ↔ reverted).
      v_status := case when d->>'status' = 'reverted' then 'reverted' else 'active' end;
      update public.deviations set status = v_status,
             reverted_at = case when v_status = 'reverted' then now() else null end,
             client_updated_at = v_ts
       where id = v_existing_dev.id returning * into v_existing_dev;
      out_devs := out_devs || jsonb_build_object('id', v_existing_dev.id, 'result', 'accepted', 'server', private.deviation_json(v_existing_dev));
      continue;
    end if;

    select w.* into v_workout from public.workouts w join public.programs p on p.id = w.program_id
     where w.id = (d->>'workout_id')::uuid and p.client_id = c.id;
    if v_workout.id is null then
      out_devs := out_devs || jsonb_build_object('id', d->>'id', 'result', 'rejected', 'error', 'unknown_workout');
      continue;
    end if;

    v_mod := d->'modified';
    if jsonb_typeof(v_mod) <> 'object' then
      out_devs := out_devs || jsonb_build_object('id', d->>'id', 'result', 'rejected', 'error', 'invalid_modification');
      continue;
    end if;
    v_presc := null;
    if nullif(d->>'prescription_id', '') is not null then
      select * into v_presc from public.prescriptions where id = (d->>'prescription_id')::uuid and workout_id = v_workout.id;
      if v_presc.id is null then
        out_devs := out_devs || jsonb_build_object('id', d->>'id', 'result', 'rejected', 'error', 'unknown_prescription');
        continue;
      end if;
    end if;
    if not coalesce((v_mod->>'removed')::boolean, false) then
      if not private.valid_sets(v_mod->'sets') or not exists (
        select 1 from public.exercises e where e.id = v_mod->>'exercise_id'
           and (e.coach_id is null or e.coach_id = c.coach_id)) then
        out_devs := out_devs || jsonb_build_object('id', d->>'id', 'result', 'rejected', 'error', 'invalid_modification');
        continue;
      end if;
    end if;

    if v_presc.id is not null then
      update public.deviations set status = 'superseded'
       where client_id = c.id and prescription_id = v_presc.id and status = 'active';
    end if;
    insert into public.deviations (id, client_id, program_id, workout_id, prescription_id, modification_type,
                                   reason, original, modified, status, client_updated_at)
    values ((d->>'id')::uuid, c.id, v_workout.program_id, v_workout.id, v_presc.id,
            d->>'modification_type', coalesce(d->>'reason', 'preference'),
            case when v_presc.id is null then null else private.prescription_json(v_presc) end,
            v_mod, case when d->>'status' = 'reverted' then 'reverted' else 'active' end, v_ts)
    returning * into v_existing_dev;
    out_devs := out_devs || jsonb_build_object('id', v_existing_dev.id, 'result', 'accepted', 'server', private.deviation_json(v_existing_dev));
  end loop;

  for l in select * from jsonb_array_elements(coalesce(p_logs, '[]')) loop
    v_ts := (l->>'client_updated_at')::timestamptz;
    select w.* into v_workout from public.workouts w join public.programs p on p.id = w.program_id
     where w.id = (l->>'workout_id')::uuid and p.client_id = c.id;
    select * into v_existing from public.workout_logs
     where client_id = c.id and (id = (l->>'id')::uuid or (workout_id is not null and workout_id = (l->>'workout_id')::uuid))
     order by (id = (l->>'id')::uuid) desc limit 1;

    if v_existing.id is null and exists (select 1 from public.workout_logs where id = (l->>'id')::uuid) then
      out_logs := out_logs || jsonb_build_object('id', l->>'id', 'workout_id', l->>'workout_id', 'result', 'rejected', 'error', 'forbidden');
      continue;
    end if;
    if v_existing.id is null and v_workout.id is null then
      out_logs := out_logs || jsonb_build_object('id', l->>'id', 'workout_id', l->>'workout_id', 'result', 'rejected', 'error', 'unknown_workout');
      continue;
    end if;
    if v_existing.id is not null and v_existing.client_updated_at >= v_ts then
      out_logs := out_logs || jsonb_build_object('id', l->>'id', 'workout_id', l->>'workout_id', 'result', 'stale', 'server', private.log_json(v_existing));
      continue;
    end if;

    -- Freeze the snapshot once a workout is completed or skipped.
    if v_existing.id is not null and v_existing.status <> 'in_progress' then
      v_snapshot := v_existing.workout_snapshot;
    elsif v_workout.id is not null then
      v_snapshot := private.effective_workout(c.id, v_workout.id);
    else
      v_snapshot := v_existing.workout_snapshot;
    end if;

    v_log_id := coalesce(v_existing.id, (l->>'id')::uuid);
    insert into public.workout_logs (id, client_id, program_id, workout_id, workout_snapshot, status, skip_reason,
                                     started_at, completed_at, session_rpe, pain_reported, notes, client_updated_at, server_updated_at)
    values (v_log_id, c.id, coalesce(v_workout.program_id, v_existing.program_id), coalesce(v_workout.id, v_existing.workout_id),
            v_snapshot, l->>'status', nullif(l->>'skip_reason', ''),
            nullif(l->>'started_at', '')::timestamptz, nullif(l->>'completed_at', '')::timestamptz,
            nullif(l->>'session_rpe', '')::numeric, coalesce((l->>'pain_reported')::boolean, false),
            coalesce(l->>'notes', ''), v_ts, now())
    on conflict (id) do update set workout_snapshot = excluded.workout_snapshot, status = excluded.status,
      skip_reason = excluded.skip_reason, started_at = excluded.started_at, completed_at = excluded.completed_at,
      session_rpe = excluded.session_rpe, pain_reported = excluded.pain_reported, notes = excluded.notes,
      client_updated_at = excluded.client_updated_at, server_updated_at = now();

    delete from public.set_logs where workout_log_id = v_log_id;
    for s in select * from jsonb_array_elements(coalesce(l->'sets', '[]')) loop
      insert into public.set_logs (workout_log_id, prescription_id, exercise_id, exercise_position, set_index, target,
                                   actual_reps, actual_load_kg, rpe, completed, notes)
      values (v_log_id, nullif(s->>'prescription_id', '')::uuid, s->>'exercise_id', (s->>'exercise_position')::int,
              (s->>'set_index')::int, s->'target', nullif(s->>'actual_reps', '')::int,
              nullif(s->>'actual_load_kg', '')::numeric, nullif(s->>'rpe', '')::numeric,
              coalesce((s->>'completed')::boolean, false), coalesce(s->>'notes', ''));
    end loop;

    select * into v_existing from public.workout_logs where id = v_log_id;
    out_logs := out_logs || jsonb_build_object('id', l->>'id', 'workout_id', l->>'workout_id', 'result', 'accepted', 'server', private.log_json(v_existing));
  end loop;

  return jsonb_build_object('logs', out_logs, 'deviations', out_devs, 'server_time', now());
end $$;

-- -----------------------------------------------------------------------------
-- Function privileges: nothing is callable unless granted here.
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema private from public;
do $$ begin
  execute 'revoke execute on all functions in schema public from anon, authenticated';
  execute 'revoke execute on all functions in schema private from anon, authenticated';
end $$;

revoke all on schema private from public;
grant usage on schema private to authenticated;
-- invoker helpers the coach API calls (still filtered by RLS)
grant execute on function private.program_json(uuid), private.prescription_json(public.prescriptions),
  private.log_json(public.workout_logs), private.deviation_json(public.deviations),
  private.exercise_json(public.exercises), private.require_coach(), private.new_token(),
  private.valid_sets(jsonb), private.valid_progression(jsonb),
  private.check_program_client(), private.check_prescription_exercise() to authenticated;

grant execute on function public.client_get_bundle(text), public.client_sync(text, jsonb, jsonb) to anon, authenticated;
grant execute on function
  public.coach_me(text), public.coach_dashboard(), public.coach_create_client(text),
  public.coach_update_client(uuid, text, boolean), public.coach_rotate_client_link(uuid),
  public.coach_list_exercises(), public.coach_add_exercise(text, text, text),
  public.coach_get_program(uuid), public.coach_save_program(jsonb, integer),
  public.coach_duplicate_program(uuid, text, uuid, integer), public.coach_delete_program(uuid),
  public.coach_program_revisions(uuid), public.coach_client_overview(uuid)
to authenticated;
