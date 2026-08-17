import {
  planBalanceRun,
  type BalanceInput,
  type BalanceMember,
  type LedgerRow,
} from '../../../../supabase/functions/_shared/balance-strategy';

/**
 * The design spec asks for the balancing logic to be "unit-tested standalone
 * for all three strategies: given a point total, member list (with weights),
 * eligibility subsets, and outstanding debt, assert points_based distribution
 * stays within a weighted fairness tolerance, and round_robin rotation order is
 * correct regardless of weight."
 *
 * The Edge Function's own suite covers this end to end, but only against a
 * running Supabase. These run anywhere.
 */

const member = (id: string, weight = 1): BalanceMember => ({ id, weight });
const mission = (id: string, points: number, template_id: string | null = null) => ({ id, points, template_id });
const ledger = (member_id: string, earned = 0, target = 0, debt = 0): LedgerRow => ({
  member_id,
  points_earned: earned,
  points_target: target,
  debt,
});

function input(overrides: Partial<BalanceInput> = {}): BalanceInput {
  return {
    strategy: 'points_based',
    members: [member('a'), member('b')],
    unavailableMemberIds: [],
    missions: [],
    eligibleByTemplate: {},
    ledger: [],
    roundRobinCursor: null,
    ...overrides,
  };
}

/** Points each member ends up carrying from this run's assignments. */
function pointsPerMember(result: ReturnType<typeof planBalanceRun>, missions: { id: string; points: number }[]) {
  const byId = new Map(missions.map((m) => [m.id, m.points]));
  const totals = new Map<string, number>();
  for (const a of result.assignments) {
    totals.set(a.member_id, (totals.get(a.member_id) ?? 0) + (byId.get(a.mission_id) ?? 0));
  }
  return totals;
}

describe('manual strategy', () => {
  it('assigns nothing and leaves every mission in the pool', () => {
    const missions = [mission('m1', 10), mission('m2', 20)];
    const result = planBalanceRun(input({ strategy: 'manual', missions }));

    expect(result.assignments).toEqual([]);
    expect(result.unassignedMissionIds).toEqual(['m1', 'm2']);
  });

  it('does not advance the ledger, because no pool was distributed', () => {
    const result = planBalanceRun(input({ strategy: 'manual', missions: [mission('m1', 10)] }));
    expect(result.ledgerEntries).toEqual([]);
  });
});

describe('round_robin strategy', () => {
  it('alternates between members in order', () => {
    const missions = [mission('m1', 5), mission('m2', 5), mission('m3', 5), mission('m4', 5)];
    const result = planBalanceRun(input({ strategy: 'round_robin', missions }));

    expect(result.assignments.map((a) => a.member_id)).toEqual(['a', 'b', 'a', 'b']);
  });

  it('rotates regardless of weight, unlike points_based', () => {
    // A 0.25-weight member still takes every other chore here. The spec is
    // explicit that round-robin treats everyone equally by design.
    const missions = [mission('m1', 5), mission('m2', 5), mission('m3', 5), mission('m4', 5)];
    const result = planBalanceRun(
      input({ strategy: 'round_robin', members: [member('a', 1), member('b', 0.25)], missions })
    );

    expect(result.assignments.map((a) => a.member_id)).toEqual(['a', 'b', 'a', 'b']);
  });

  it('ignores point balance entirely', () => {
    const missions = [mission('m1', 5), mission('m2', 5)];
    const result = planBalanceRun(
      input({
        strategy: 'round_robin',
        missions,
        // 'a' is massively ahead; round-robin still starts with them.
        ledger: [ledger('a', 500, 0), ledger('b', 0, 0)],
      })
    );

    expect(result.assignments[0].member_id).toBe('a');
  });

  it('continues from the stored cursor rather than restarting each run', () => {
    const missions = [mission('m1', 5), mission('m2', 5)];
    const result = planBalanceRun(input({ strategy: 'round_robin', missions, roundRobinCursor: 'a' }));

    expect(result.assignments.map((a) => a.member_id)).toEqual(['b', 'a']);
    expect(result.roundRobinCursor).toBe('a');
  });

  it('skips a member who is away, without losing the rotation', () => {
    const missions = [mission('m1', 5), mission('m2', 5)];
    const result = planBalanceRun(
      input({
        strategy: 'round_robin',
        members: [member('a'), member('b'), member('c')],
        unavailableMemberIds: ['b'],
        missions,
      })
    );

    expect(result.assignments.map((a) => a.member_id)).toEqual(['a', 'c']);
  });

  it('respects a template that restricts who may take it', () => {
    const missions = [mission('m1', 5, 'tpl-1'), mission('m2', 5)];
    const result = planBalanceRun(
      input({
        strategy: 'round_robin',
        members: [member('a'), member('b')],
        missions,
        eligibleByTemplate: { 'tpl-1': ['b'] },
      })
    );

    expect(result.assignments.find((a) => a.mission_id === 'm1')?.member_id).toBe('b');
  });
});

describe('points_based strategy', () => {
  it('gives the mission to whoever is furthest below target', () => {
    const missions = [mission('m1', 10)];
    const result = planBalanceRun(
      input({
        missions,
        // 'b' has earned nothing against the same target, so is further behind.
        ledger: [ledger('a', 40, 40), ledger('b', 0, 40)],
      })
    );

    expect(result.assignments).toEqual([{ mission_id: 'm1', member_id: 'b' }]);
  });

  it('counts debt toward the deficit', () => {
    const missions = [mission('m1', 10)];
    const result = planBalanceRun(
      input({
        missions,
        // Identical earned and target; only 'a' carries debt from time off.
        ledger: [ledger('a', 40, 40, 25), ledger('b', 40, 40, 0)],
      })
    );

    expect(result.assignments[0].member_id).toBe('a');
  });

  it('splits an even pool evenly between equal members', () => {
    const missions = [mission('m1', 10), mission('m2', 10), mission('m3', 10), mission('m4', 10)];
    const result = planBalanceRun(input({ missions }));

    const totals = pointsPerMember(result, missions);
    expect(totals.get('a')).toBe(20);
    expect(totals.get('b')).toBe(20);
  });

  it('keeps a weighted split within tolerance of each member share', () => {
    // 'a' at 1.0 and 'b' at 0.5 should land roughly 2:1.
    const missions = Array.from({ length: 12 }, (_, i) => mission(`m${i}`, 10));
    const result = planBalanceRun(input({ members: [member('a', 1), member('b', 0.5)], missions }));

    const totals = pointsPerMember(result, missions);
    const pool = 120;
    expect(totals.get('a')).toBeCloseTo((1 / 1.5) * pool, -1);
    expect(totals.get('b')).toBeCloseTo((0.5 / 1.5) * pool, -1);
  });

  it('handles uneven mission difficulty rather than counting missions', () => {
    // One 30-point chore against three 10-point ones: an even split by count
    // would be unfair, an even split by points is not.
    const missions = [mission('m1', 30), mission('m2', 10), mission('m3', 10), mission('m4', 10)];
    const result = planBalanceRun(input({ missions }));

    const totals = pointsPerMember(result, missions);
    expect(Math.abs((totals.get('a') ?? 0) - (totals.get('b') ?? 0))).toBeLessThanOrEqual(10);
  });

  it('breaks an exact tie by member order, so a run is deterministic', () => {
    const missions = [mission('m1', 10)];
    const first = planBalanceRun(input({ missions }));
    const second = planBalanceRun(input({ missions }));

    expect(first.assignments).toEqual(second.assignments);
    expect(first.assignments[0].member_id).toBe('a');
  });

  it('never assigns to a member who is away', () => {
    const missions = [mission('m1', 10), mission('m2', 10)];
    const result = planBalanceRun(
      input({ missions, unavailableMemberIds: ['b'], ledger: [ledger('a', 100, 0), ledger('b', 0, 0)] })
    );

    expect(result.assignments.every((a) => a.member_id === 'a')).toBe(true);
  });

  it("turns an away member's share into debt, and gives them no target", () => {
    const missions = [mission('m1', 10), mission('m2', 10)];
    const result = planBalanceRun(input({ missions, unavailableMemberIds: ['b'] }));

    const entries = Object.fromEntries(result.ledgerEntries.map((e) => [e.member_id, e]));
    expect(entries.b).toEqual({ member_id: 'b', target: 0, debt: 10 });
    expect(entries.a).toEqual({ member_id: 'a', target: 10, debt: 0 });
  });

  it('plans debt for everyone when the whole house is away', () => {
    const missions = [mission('m1', 10)];
    const result = planBalanceRun(input({ missions, unavailableMemberIds: ['a', 'b'] }));

    expect(result.assignments).toEqual([]);
    expect(result.unassignedMissionIds).toEqual(['m1']);
    expect(result.ledgerEntries.every((e) => e.debt > 0 && e.target === 0)).toBe(true);
    // Note this is the *plan*. apply_balance_run scales these by the share of
    // the pool the run actually claimed, so a run that assigns nothing writes
    // nothing -- the chores stay in the pool for a run that can place them.
  });

  it('leaves a restricted mission in the pool when nobody eligible is available', () => {
    const missions = [mission('m1', 10, 'tpl-1')];
    const result = planBalanceRun(
      input({ missions, unavailableMemberIds: ['b'], eligibleByTemplate: { 'tpl-1': ['b'] } })
    );

    // Better in the pool than handed to someone the template excludes.
    expect(result.assignments).toEqual([]);
    expect(result.unassignedMissionIds).toEqual(['m1']);
  });

  it('treats an empty eligibility list as "no restriction", not "nobody"', () => {
    const missions = [mission('m1', 10, 'tpl-1')];
    const result = planBalanceRun(input({ missions, eligibleByTemplate: { 'tpl-1': [] } }));

    expect(result.assignments).toHaveLength(1);
  });

  it('divides by zero weight without producing NaN', () => {
    const missions = [mission('m1', 10)];
    const result = planBalanceRun(input({ members: [member('a', 0), member('b', 0)], missions }));

    expect(result.ledgerEntries.every((e) => Number.isFinite(e.target))).toBe(true);
  });
});
