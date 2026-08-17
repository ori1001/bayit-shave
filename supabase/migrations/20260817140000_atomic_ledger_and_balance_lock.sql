-- The points ledger was being updated read-modify-write across two separate
-- HTTP round trips from the Edge Functions:
--
--   select points_earned from points_ledger where ...   -- request 1
--   update points_ledger set points_earned = <read> + n -- request 2
--
-- Two completions that overlap both read the same value and both write it back,
-- so one member's points silently vanish. The same shape appears in run-balance
-- for points_target and debt. The design spec calls for these updates to happen
-- "inside a single transaction with SELECT ... FOR UPDATE" and for the balance
-- run to "take a Postgres advisory lock on the house for its duration"; neither
-- existed. A function body is one transaction, so moving the read and the write
-- into these gives both properties.

-- Credits a completed mission's points. The increment happens inside the
-- statement, so two concurrent completions serialise on the row rather than
-- racing through a value either of them read earlier.
create or replace function bayit_shave.credit_points_earned(
  target_house_id uuid,
  target_member_id uuid,
  earned integer
)
returns bayit_shave.points_ledger
language sql
security definer
set search_path = ''
as $$
  -- Aliased because search_path is empty: inside ON CONFLICT DO UPDATE the
  -- existing row is referenced by the table's own name, which cannot be
  -- schema-qualified there. The alias makes it unambiguous either way.
  insert into bayit_shave.points_ledger as ledger (house_id, member_id, points_earned)
  values (target_house_id, target_member_id, earned)
  on conflict (house_id, member_id)
  do update set points_earned = ledger.points_earned + excluded.points_earned
  returning ledger.*;
$$;

/*
 * Applies one balance run: claims its missions and advances the ledger, as a
 * single locked transaction.
 *
 * `assignments` is [{ "mission_id": uuid, "member_id": uuid }, ...] -- the plan
 * the Edge Function computed. `entries` is
 * [{ "member_id": uuid, "target": numeric, "debt": integer }, ...] for the full
 * pool the plan was computed against, and `pool_points` is that pool's total.
 *
 * Both halves have to be in here together. Claiming alone stops two overlapping
 * runs assigning one chore twice, but each would still credit a full pool's
 * worth of targets, doubling everyone's target for the period. So the ledger is
 * scaled to the pool this run actually claimed: a run that arrives second finds
 * the missions taken, claims nothing, and correctly advances nobody.
 *
 * The advisory lock is transaction-scoped -- released when this returns,
 * whether it succeeded or threw -- and keyed on the house, so runs for
 * different houses never block each other.
 */
create or replace function bayit_shave.apply_balance_run(
  target_house_id uuid,
  assignments jsonb,
  entries jsonb,
  pool_points numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  assignment jsonb;
  entry jsonb;
  claimed jsonb := '[]'::jsonb;
  claimed_points numeric := 0;
  claimed_share numeric;
  mission_points integer;
begin
  perform pg_advisory_xact_lock(hashtext(target_house_id::text));

  for assignment in select * from jsonb_array_elements(assignments)
  loop
    update bayit_shave.mission_instances
       set assigned_to = (assignment ->> 'member_id')::uuid,
           status = 'assigned'
     where id = (assignment ->> 'mission_id')::uuid
       and house_id = target_house_id
       -- Only while still unclaimed: this is what makes a re-trigger safe, and
       -- what the design spec means by the run being idempotent.
       and assigned_to is null
       and status = 'open'
    returning points into mission_points;

    if mission_points is not null then
      claimed := claimed || jsonb_build_array(assignment);
      claimed_points := claimed_points + mission_points;
      mission_points := null;
    end if;
  end loop;

  -- Nothing claimed and nothing was on offer: no pool, so no accounting.
  if pool_points is null or pool_points <= 0 then
    return claimed;
  end if;

  claimed_share := claimed_points / pool_points;
  if claimed_share <= 0 then
    return claimed;
  end if;

  for entry in select * from jsonb_array_elements(entries)
  loop
    insert into bayit_shave.points_ledger as ledger (house_id, member_id, points_earned, points_target, debt)
    values (
      target_house_id,
      (entry ->> 'member_id')::uuid,
      0,
      coalesce((entry ->> 'target')::numeric, 0) * claimed_share,
      round(coalesce((entry ->> 'debt')::numeric, 0) * claimed_share)::integer
    )
    on conflict (house_id, member_id)
    do update set
      points_target = ledger.points_target + excluded.points_target,
      debt = ledger.debt + excluded.debt;
  end loop;

  return claimed;
end;
$$;

-- Edge Functions only. Nothing here is safe to expose to a client: each writes
-- ledger or assignment state that the functions authorise first.
revoke all on function bayit_shave.credit_points_earned(uuid, uuid, integer) from public;
revoke all on function bayit_shave.apply_balance_run(uuid, jsonb, jsonb, numeric) from public;
grant execute on function bayit_shave.credit_points_earned(uuid, uuid, integer) to service_role;
grant execute on function bayit_shave.apply_balance_run(uuid, jsonb, jsonb, numeric) to service_role;
