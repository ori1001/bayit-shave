begin;
select plan(1);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'noa@example.com');

insert into bayit_shave.houses (id, name, invite_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'House A', 'CODERR1');

insert into bayit_shave.members (id, house_id, user_id, name, role) values
  ('c0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Noa', 'admin');

update bayit_shave.houses set round_robin_cursor = 'c0000000-0000-0000-0000-000000000001' where id = 'aaaaaaaa-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select round_robin_cursor from bayit_shave.houses limit 1)::text,
  'c0000000-0000-0000-0000-000000000001',
  'round_robin_cursor is stored and visible to the house''s own member'
);

select * from finish();
rollback;
