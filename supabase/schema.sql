-- FitRank cloud schema. Run once in the Supabase SQL editor.
-- Before applying, run scripts/check-local-data.js in the browser console on the live
-- site and confirm your existing data is under every limit below.

-- ---------------------------------------------------------------------------
-- workouts: immutable. Clients can read and insert their own rows, nothing else.
-- earned <= 620: the most one workout can earn today is 170 from SCORING (all at x1.0)
-- plus 3 active goals at 150 each = 450. Update this if SCORING or GOAL_RULES change
-- (tests/cloud.test.mjs checks that this number still matches the code).
-- ---------------------------------------------------------------------------
create table public.workouts (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  completed_at timestamptz not null,
  earned integer not null check (earned between 0 and 620),
  data jsonb not null check (octet_length(data::text) < 20000),
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.workouts enable row level security;
revoke all on public.workouts from anon;
revoke update, delete on public.workouts from authenticated;

create policy workouts_select on public.workouts for select to authenticated
  using (user_id = (select auth.uid()));
create policy workouts_insert on public.workouts for insert to authenticated
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- goals: soft delete (deleted_at) so a delete on one device reaches the others.
-- ---------------------------------------------------------------------------
create table public.goals (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  data jsonb not null check (octet_length(data::text) < 20000),
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.goals enable row level security;
revoke all on public.goals from anon;
revoke delete on public.goals from authenticated;

create policy goals_select on public.goals for select to authenticated
  using (user_id = (select auth.uid()));
create policy goals_insert on public.goals for insert to authenticated
  with check (user_id = (select auth.uid()));
-- USING picks which rows can be updated; WITH CHECK stops a row being reassigned to another user.
create policy goals_update on public.goals for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Account deletion. The cascade above removes the user's workouts and goals.
-- ---------------------------------------------------------------------------
create or replace function public.delete_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = (select auth.uid());
$$;
revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
