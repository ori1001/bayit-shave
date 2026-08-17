-- The "members update self" policy scopes updates to your own row, but a
-- policy decides *which rows*, never which columns. Combined with the
-- table-wide `grant update on members to authenticated`, any member could run
--
--   update bayit_shave.members set role = 'admin' where user_id = auth.uid();
--
-- and hand themselves the admin's powers: house settings, recurring chores,
-- approving their own suggestions, running the balance. A WITH CHECK clause
-- cannot fix this, since it cannot see the row's previous role. Column-level
-- grants can, so the privilege is removed at the grant rather than the policy.
--
-- Only the two columns a member legitimately writes about themselves remain:
-- their display name, and the push token their own device mints. Everything
-- else on the row -- role, weight, house_id, user_id -- is now writable only by
-- service_role, i.e. only through an Edge Function that has re-checked who is
-- asking.
revoke update on bayit_shave.members from authenticated;
grant update (name, push_token) on bayit_shave.members to authenticated;

-- Exactly one admin per house, which houses.admin_id already assumes. Enforced
-- here so a partial failure mid-transfer cannot leave a house with two admins
-- or none.
create or replace function bayit_shave.transfer_house_admin(
  target_house_id uuid,
  new_admin_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from bayit_shave.members
    where id = new_admin_member_id and house_id = target_house_id
  ) then
    raise exception 'member_not_in_house';
  end if;

  update bayit_shave.members
    set role = case when id = new_admin_member_id then 'admin'::bayit_shave.member_role
                    else 'member'::bayit_shave.member_role end
    where house_id = target_house_id;

  update bayit_shave.houses set admin_id = new_admin_member_id where id = target_house_id;
end;
$$;

-- Callable only by the Edge Function, which checks that the caller is the
-- house's current admin first. Never exposed to authenticated clients.
revoke all on function bayit_shave.transfer_house_admin(uuid, uuid) from public;
grant execute on function bayit_shave.transfer_house_admin(uuid, uuid) to service_role;
