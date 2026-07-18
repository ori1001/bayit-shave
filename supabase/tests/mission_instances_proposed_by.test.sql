begin;
select plan(2);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'noa@example.com');

insert into bayit_shave.houses (id, name, invite_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'House A', 'CODEP1');

insert into bayit_shave.members (id, house_id, user_id, name, role) values
  ('c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Noa', 'admin');

insert into bayit_shave.mission_instances
  (house_id, title, category, points, due_date, created_by, status, proposed_points, proposed_by)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Wash dishes', 'dishes', 15, current_date, 'c0000000-0000-0000-0000-000000000001', 'assigned', 20, 'c0000000-0000-0000-0000-000000000001');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select proposed_points from bayit_shave.mission_instances limit 1),
  20,
  'proposed_points is stored and visible to the proposer''s house'
);

select is(
  (select proposed_by from bayit_shave.mission_instances limit 1)::text,
  'c0000000-0000-0000-0000-000000000001',
  'proposed_by correctly records who proposed the edit'
);

select * from finish();
rollback;
