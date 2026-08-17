-- The design spec requires RLS to be tested "to confirm one house's data never
-- leaks into another's queries". houses, members and mission_instances were
-- covered; points_ledger, swap_requests, unavailability_requests and
-- mission_templates had policies but no test proving they hold.
--
-- Also covers the column-level grant that stops a member promoting themselves
-- to admin, and the atomicity of the ledger credit.

begin;
select plan(12);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'noa@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'itai@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'dana@example.com');

insert into bayit_shave.houses (id, name, invite_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'House A', 'CODEA1'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'House B', 'CODEB1');

insert into bayit_shave.members (id, house_id, user_id, name, role) values
  ('eeeeeeee-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Noa', 'admin'),
  ('eeeeeeee-0000-0000-0000-00000000000c', 'aaaaaaaa-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'Dana', 'member'),
  ('eeeeeeee-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Itai', 'admin');

insert into bayit_shave.mission_templates (id, house_id, title, points, recurrence_rule) values
  ('ffffffff-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'A dishes', 5, 'weekly:fri'),
  ('ffffffff-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', 'B dishes', 5, 'weekly:fri');

insert into bayit_shave.mission_instances (id, house_id, title, points, due_date, created_by) values
  ('c0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000001', 'A chore', 5, '2026-08-20', 'eeeeeeee-0000-0000-0000-00000000000a'),
  ('c0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000002', 'B chore', 5, '2026-08-20', 'eeeeeeee-0000-0000-0000-00000000000b');

insert into bayit_shave.points_ledger (house_id, member_id, points_earned) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-00000000000a', 10),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-00000000000b', 99);

insert into bayit_shave.swap_requests (house_id, mission_instance_id, from_member, to_member) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-00000000000a', 'eeeeeeee-0000-0000-0000-00000000000c'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-00000000000b', 'eeeeeeee-0000-0000-0000-00000000000b', 'eeeeeeee-0000-0000-0000-00000000000b');

insert into bayit_shave.unavailability_requests (house_id, member_id, period_start, period_end) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-00000000000a', '2026-08-20', '2026-08-25'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'eeeeeeee-0000-0000-0000-00000000000b', '2026-08-20', '2026-08-25');

-- ---------------------------------------------------------------- isolation
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is((select count(*)::int from bayit_shave.points_ledger), 1, 'ledger: Noa sees only her own house');
select is(
  (select points_earned from bayit_shave.points_ledger limit 1),
  10,
  'ledger: the row Noa sees is her house''s, not House B''s 99'
);

select is((select count(*)::int from bayit_shave.swap_requests), 1, 'swaps: Noa sees only her own house');
select is(
  (select count(*)::int from bayit_shave.unavailability_requests),
  1,
  'time off: Noa sees only her own house'
);
select is((select count(*)::int from bayit_shave.mission_templates), 1, 'templates: Noa sees only her own house');
select is(
  (select title from bayit_shave.mission_templates limit 1),
  'A dishes',
  'templates: the one Noa sees belongs to House A'
);

-- --------------------------------------------------------------- privileges
-- A member could previously grant themselves admin: the policy scoped updates
-- to their own row, but the table-wide UPDATE grant left every column writable.
set local request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select throws_ok(
  $$update bayit_shave.members set role = 'admin' where user_id = '33333333-3333-3333-3333-333333333333'$$,
  '42501',
  null,
  'a member cannot promote themselves to admin'
);

select throws_ok(
  $$update bayit_shave.members set weight = 0.1 where user_id = '33333333-3333-3333-3333-333333333333'$$,
  '42501',
  null,
  'a member cannot lower their own weight to dodge chores'
);

select lives_ok(
  $$update bayit_shave.members set name = 'Dana R' where user_id = '33333333-3333-3333-3333-333333333333'$$,
  'a member can still rename themselves'
);

select is(
  (select role::text from bayit_shave.members where user_id = '33333333-3333-3333-3333-333333333333'),
  'member',
  'the role is unchanged after the attempts'
);

-- ------------------------------------------------------------ ledger atomics
reset role;

select bayit_shave.credit_points_earned(
  'aaaaaaaa-0000-0000-0000-000000000001',
  'eeeeeeee-0000-0000-0000-00000000000a',
  7
);
select bayit_shave.credit_points_earned(
  'aaaaaaaa-0000-0000-0000-000000000001',
  'eeeeeeee-0000-0000-0000-00000000000a',
  3
);

select is(
  (select points_earned from bayit_shave.points_ledger
     where member_id = 'eeeeeeee-0000-0000-0000-00000000000a'),
  20,
  'credit_points_earned adds to the stored value rather than overwriting it'
);

select bayit_shave.credit_points_earned(
  'aaaaaaaa-0000-0000-0000-000000000001',
  'eeeeeeee-0000-0000-0000-00000000000c',
  4
);
select is(
  (select points_earned from bayit_shave.points_ledger
     where member_id = 'eeeeeeee-0000-0000-0000-00000000000c'),
  4,
  'credit_points_earned creates the row when a member has no ledger yet'
);

select * from finish();
rollback;
