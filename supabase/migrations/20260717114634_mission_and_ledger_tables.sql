create type bayit_shave.mission_category as enum
  ('dishes', 'clean', 'laundry', 'trash', 'shop', 'pets', 'garden', 'bath', 'other');
create type bayit_shave.mission_status as enum
  ('pending_approval', 'open', 'assigned', 'done', 'rejected');
create type bayit_shave.assignment_mode as enum ('auto', 'direct');
create type bayit_shave.request_status as enum ('pending', 'approved', 'rejected');

create table bayit_shave.mission_templates (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references bayit_shave.houses(id) on delete cascade,
  title text not null,
  category bayit_shave.mission_category not null default 'other',
  points integer not null check (points > 0),
  recurrence_rule text not null, -- e.g. "weekly:fri"
  default_assignee uuid references bayit_shave.members(id) on delete set null,
  eligible_members uuid[], -- null = all house members
  last_assigned_to uuid references bayit_shave.members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table bayit_shave.mission_instances (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references bayit_shave.mission_templates(id) on delete set null,
  house_id uuid not null references bayit_shave.houses(id) on delete cascade,
  title text not null,
  category bayit_shave.mission_category not null default 'other',
  points integer not null check (points > 0),
  proposed_points integer,
  due_date date not null,
  proposed_due_date date,
  assigned_to uuid references bayit_shave.members(id) on delete set null,
  proposed_assigned_to uuid references bayit_shave.members(id) on delete set null,
  status bayit_shave.mission_status not null default 'open',
  created_by uuid not null references bayit_shave.members(id) on delete cascade,
  assignment_mode bayit_shave.assignment_mode not null default 'auto',
  approved_by uuid references bayit_shave.members(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table bayit_shave.points_ledger (
  house_id uuid not null references bayit_shave.houses(id) on delete cascade,
  member_id uuid not null references bayit_shave.members(id) on delete cascade,
  points_earned integer not null default 0,
  points_target numeric not null default 0,
  debt integer not null default 0,
  primary key (house_id, member_id)
);

create table bayit_shave.swap_requests (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references bayit_shave.houses(id) on delete cascade,
  mission_instance_id uuid not null references bayit_shave.mission_instances(id) on delete cascade,
  from_member uuid not null references bayit_shave.members(id) on delete cascade,
  to_member uuid not null references bayit_shave.members(id) on delete cascade,
  status bayit_shave.request_status not null default 'pending',
  approved_by uuid references bayit_shave.members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table bayit_shave.unavailability_requests (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references bayit_shave.houses(id) on delete cascade,
  member_id uuid not null references bayit_shave.members(id) on delete cascade,
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  reason text,
  status bayit_shave.request_status not null default 'pending',
  approved_by uuid references bayit_shave.members(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table bayit_shave.mission_templates enable row level security;
alter table bayit_shave.mission_instances enable row level security;
alter table bayit_shave.points_ledger enable row level security;
alter table bayit_shave.swap_requests enable row level security;
alter table bayit_shave.unavailability_requests enable row level security;

create policy "mission_templates select own house" on bayit_shave.mission_templates
  for select to authenticated
  using (house_id in (select bayit_shave.current_user_house_ids()));

create policy "mission_instances select own house" on bayit_shave.mission_instances
  for select to authenticated
  using (house_id in (select bayit_shave.current_user_house_ids()));

create policy "points_ledger select own house" on bayit_shave.points_ledger
  for select to authenticated
  using (house_id in (select bayit_shave.current_user_house_ids()));

create policy "swap_requests select own house" on bayit_shave.swap_requests
  for select to authenticated
  using (house_id in (select bayit_shave.current_user_house_ids()));

create policy "unavailability_requests select own house" on bayit_shave.unavailability_requests
  for select to authenticated
  using (house_id in (select bayit_shave.current_user_house_ids()));

grant select on bayit_shave.mission_templates to authenticated;
grant select, insert, update, delete on bayit_shave.mission_templates to service_role;
grant select on bayit_shave.mission_instances to authenticated;
grant select, insert, update, delete on bayit_shave.mission_instances to service_role;
grant select on bayit_shave.points_ledger to authenticated;
grant select, insert, update, delete on bayit_shave.points_ledger to service_role;
grant select on bayit_shave.swap_requests to authenticated;
grant select, insert, update, delete on bayit_shave.swap_requests to service_role;
grant select on bayit_shave.unavailability_requests to authenticated;
grant select, insert, update, delete on bayit_shave.unavailability_requests to service_role;
