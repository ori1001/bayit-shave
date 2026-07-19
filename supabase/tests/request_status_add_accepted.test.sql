begin;
select plan(1);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'noa@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'itai@example.com');

insert into bayit_shave.houses (id, name, invite_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'House A', 'CODEACC');

insert into bayit_shave.members (id, house_id, user_id, name, role) values
  ('c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Noa', 'admin'),
  ('c0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Itai', 'member');

insert into bayit_shave.mission_instances
  (house_id, title, category, points, due_date, created_by, status, assignment_mode, assigned_to)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Wash dishes', 'dishes', 15, current_date, 'c0000000-0000-0000-0000-000000000001', 'assigned', 'direct', 'c0000000-0000-0000-0000-000000000001');

insert into bayit_shave.swap_requests (house_id, mission_instance_id, from_member, to_member, status)
select 'aaaaaaaa-0000-0000-0000-000000000001', id, 'c0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'accepted'
from bayit_shave.mission_instances limit 1;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select status::text from bayit_shave.swap_requests limit 1),
  'accepted',
  'the new accepted status value is a valid swap_requests.status'
);

select * from finish();
rollback;
