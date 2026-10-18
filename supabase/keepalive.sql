-- FitRank keep-alive. Run once in the Supabase SQL editor, after schema.sql.
-- Supabase pauses free projects that see little database activity for a week. A scheduled
-- GitHub job (.github/workflows/supabase-keepalive.yml) calls ping() once a day, and ping()
-- writes a single timestamp. It reads nothing, returns nothing and touches no user data.

create table if not exists public.keepalive (
  id integer primary key check (id = 1),
  pinged_at timestamptz not null default now()
);
alter table public.keepalive enable row level security;
-- No policies and no direct privileges: only the function below can write to it.
revoke all on public.keepalive from anon, authenticated;

-- security definer so signed-out callers can run it; search_path is pinned so it cannot be hijacked.
create or replace function public.ping()
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.keepalive (id, pinged_at) values (1, now())
  on conflict (id) do update set pinged_at = excluded.pinged_at;
$$;
revoke execute on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
