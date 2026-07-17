begin;
select plan(3);

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'noa@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'itai@example.com');

insert into bayit_shave.houses (id, name, invite_code) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'House A', 'CODEA1'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'House B', 'CODEB1');

insert into bayit_shave.members (house_id, user_id, name, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Noa', 'admin'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Itai', 'admin');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*)::int from bayit_shave.houses),
  1,
  'Noa sees only her own house via RLS'
);

select is(
  (select name from bayit_shave.houses limit 1),
  'House A',
  'the house Noa sees is House A, not House B'
);

select is(
  (select count(*)::int from bayit_shave.members),
  1,
  'Noa sees only members of her own house'
);

select * from finish();
rollback;
