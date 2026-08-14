-- Expo push token per member, so the due-date and overdue pushes have
-- somewhere to send to. Nullable: a member who declines the OS permission, or
-- who only ever uses the web build, simply never gets one.
alter table bayit_shave.members
  add column if not exists push_token text;

-- Tracks what has already been pushed for a mission instance so the morning
-- reminder is not re-sent on every run, and so overdue escalation can tell how
-- many times it has already nudged.
create table if not exists bayit_shave.mission_notifications (
  id uuid primary key default gen_random_uuid(),
  mission_instance_id uuid not null references bayit_shave.mission_instances(id) on delete cascade,
  member_id uuid not null references bayit_shave.members(id) on delete cascade,
  kind text not null check (kind in ('due', 'overdue')),
  sent_on date not null,
  created_at timestamptz not null default now(),
  -- One push per mission per kind per day: the sender is expected to run
  -- repeatedly (cron), and without this a re-run would spam the household.
  unique (mission_instance_id, kind, sent_on)
);

alter table bayit_shave.mission_notifications enable row level security;

create policy "mission_notifications select own house" on bayit_shave.mission_notifications
  for select to authenticated
  using (
    member_id in (
      select m.id from bayit_shave.members m
      where m.house_id in (select bayit_shave.current_user_house_ids())
    )
  );

grant select on bayit_shave.mission_notifications to authenticated;
grant select, insert, update, delete on bayit_shave.mission_notifications to service_role;
