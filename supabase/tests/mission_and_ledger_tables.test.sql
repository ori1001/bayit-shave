begin;
select plan(2);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'noa@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'itai@example.com');

insert into bayit_shave.houses (id, name, invite_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'House A', 'CODEA2'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'House B', 'CODEB2');

insert into bayit_shave.members (id, house_id, user_id, name, role) values
  ('c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Noa', 'admin'),
  ('c0000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Itai', 'admin');

insert into bayit_shave.mission_instances
  (house_id, title, category, points, due_date, created_by, status)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Wash dishes', 'dishes', 15, current_date, 'c0000000-0000-0000-0000-000000000001', 'open'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Take out trash', 'trash', 10, current_date, 'c0000000-0000-0000-0000-000000000002', 'open');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from bayit_shave.mission_instances),
  1,
  'Noa sees only her own house''s missions'
);

select is(
  (select title from bayit_shave.mission_instances limit 1),
  'Wash dishes',
  'the mission Noa sees belongs to House A'
);

select * from finish();
rollback;
