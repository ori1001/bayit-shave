create schema if not exists bayit_shave;
-- custom schemas get no default grants (unlike public) — every role that
-- needs to reach this schema at all must be granted usage explicitly.
grant usage on schema bayit_shave to authenticated, service_role;

create type bayit_shave.member_role as enum ('admin', 'member');
create type bayit_shave.balance_period as enum ('weekly', 'monthly');
create type bayit_shave.assignment_strategy as enum ('round_robin', 'points_based', 'manual');

create table bayit_shave.houses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique,
  admin_id uuid,
  balance_period bayit_shave.balance_period not null default 'weekly',
  balance_day smallint not null default 5 check (balance_day between 0 and 6), -- 0=Sunday..6=Saturday
  assignment_strategy bayit_shave.assignment_strategy not null default 'points_based',
  created_at timestamptz not null default now()
);

create table bayit_shave.members (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references bayit_shave.houses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  role bayit_shave.member_role not null default 'member',
  weight numeric(4,2) not null default 1.0 check (weight > 0),
  created_at timestamptz not null default now(),
  unique (house_id, user_id)
);

alter table bayit_shave.houses
  add constraint houses_admin_id_fkey foreign key (admin_id) references bayit_shave.members(id) on delete set null;

alter table bayit_shave.houses enable row level security;
alter table bayit_shave.members enable row level security;

-- A policy on bayit_shave.members cannot subquery bayit_shave.members
-- directly (self-join in the USING clause) — Postgres re-applies the same
-- policy while evaluating the subquery and raises "infinite recursion
-- detected in policy for relation members". The standard fix (per Supabase's
-- RLS guidance) is a SECURITY DEFINER helper that reads membership rows
-- with RLS bypassed, then have policies call the helper instead of the
-- table directly.
create or replace function bayit_shave.current_user_house_ids()
returns setof uuid
language sql
security definer
stable
set search_path = ''
as $$
  select house_id from bayit_shave.members where user_id = auth.uid();
$$;

grant execute on function bayit_shave.current_user_house_ids() to authenticated;

create policy "members select own house" on bayit_shave.members
  for select
  to authenticated
  using (
    house_id in (select bayit_shave.current_user_house_ids())
  );

create policy "members update self" on bayit_shave.members
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "houses select for members" on bayit_shave.houses
  for select
  to authenticated
  using (
    id in (select bayit_shave.current_user_house_ids())
  );

-- table-level grants: RLS governs which rows, these grant reaching the
-- table at all. service_role needs full CRUD since the Edge Functions
-- (Task 5) do every write through it.
grant select on bayit_shave.houses to authenticated;
grant select, insert, update, delete on bayit_shave.houses to service_role;
grant select, update on bayit_shave.members to authenticated;
grant select, insert, update, delete on bayit_shave.members to service_role;
