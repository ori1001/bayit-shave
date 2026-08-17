/**
 * Who gets which mission, as a pure function.
 *
 * Extracted from run-balance so the design spec's requirement -- "balancing
 * logic is unit-tested standalone for all three strategies: given a point
 * total, member list (with weights), eligibility subsets, and outstanding debt"
 * -- can actually be met. Previously the only coverage was an integration test
 * that needs a running Supabase, so the weighting, eligibility and debt rules
 * went unverified on any machine without Docker.
 *
 * Deliberately free of imports, Deno globals and I/O: the Edge Function reads
 * the rows and writes the results, this decides. It is imported by both the
 * function (Deno) and the Jest suite (Node).
 */

export type AssignmentStrategy = 'round_robin' | 'points_based' | 'manual';

export interface BalanceMember {
  id: string;
  weight: number;
}

export interface BalanceMission {
  id: string;
  points: number;
  template_id?: string | null;
}

export interface LedgerRow {
  member_id: string;
  points_earned: number;
  points_target: number;
  debt: number;
}

export interface BalanceInput {
  strategy: AssignmentStrategy;
  /** Every member of the house, including any who are unavailable. */
  members: BalanceMember[];
  /** Members excluded from this run by an approved unavailability. */
  unavailableMemberIds: string[];
  /** Open, unassigned missions, in a stable order. */
  missions: BalanceMission[];
  /** template_id -> the member ids allowed to take it. Absent or empty = everyone. */
  eligibleByTemplate: Record<string, string[] | null | undefined>;
  ledger: LedgerRow[];
  /** Member who took the last round-robin assignment, to continue the rotation. */
  roundRobinCursor?: string | null;
}

export interface LedgerEntry {
  member_id: string;
  /** Points added to points_target this run. Zero for an unavailable member. */
  target: number;
  /** Points added to debt this run. Zero unless the member was unavailable. */
  debt: number;
}

export interface BalanceResult {
  assignments: { mission_id: string; member_id: string }[];
  /** Missions nobody eligible was available for; they stay in the pool. */
  unassignedMissionIds: string[];
  ledgerEntries: LedgerEntry[];
  roundRobinCursor: string | null;
}

function candidatesFor(
  mission: BalanceMission,
  available: BalanceMember[],
  eligibleByTemplate: BalanceInput['eligibleByTemplate']
): BalanceMember[] {
  const eligible = mission.template_id ? eligibleByTemplate[mission.template_id] : null;
  // Null or empty means the template puts no restriction on who can take it,
  // which is not the same as "nobody can".
  if (!eligible || eligible.length === 0) {
    return available;
  }
  return available.filter((m) => eligible.includes(m.id));
}

/**
 * The share of this run's pool each member is targeted with.
 *
 * The denominator is every member's weight, not just the available ones: an
 * unavailable member's share still has to be computed, because that share is
 * exactly what becomes their debt.
 */
function shareOfPool(member: BalanceMember, members: BalanceMember[], poolPoints: number): number {
  const totalWeight = members.reduce((sum, m) => sum + Number(m.weight), 0);
  if (totalWeight <= 0) {
    return 0;
  }
  return (Number(member.weight) / totalWeight) * poolPoints;
}

function ledgerEntriesFor(input: BalanceInput, poolPoints: number): LedgerEntry[] {
  const unavailable = new Set(input.unavailableMemberIds);
  return input.members.map((member) => {
    const share = shareOfPool(member, input.members, poolPoints);
    return unavailable.has(member.id)
      ? { member_id: member.id, target: 0, debt: Math.round(share) }
      : { member_id: member.id, target: share, debt: 0 };
  });
}

function assignRoundRobin(
  input: BalanceInput,
  available: BalanceMember[]
): { assignments: BalanceResult['assignments']; cursor: string | null } {
  const assignments: BalanceResult['assignments'] = [];
  let cursor = 0;
  if (input.roundRobinCursor) {
    const at = available.findIndex((m) => m.id === input.roundRobinCursor);
    cursor = at >= 0 ? (at + 1) % available.length : 0;
  }

  for (const mission of input.missions) {
    const candidates = candidatesFor(mission, available, input.eligibleByTemplate);
    if (candidates.length === 0) {
      continue;
    }
    // Walk forward from the cursor to the next member this mission allows, so a
    // restricted chore does not reset the house-wide rotation.
    let picked = candidates[0];
    for (let step = 0; step < available.length; step++) {
      const candidate = available[(cursor + step) % available.length];
      if (candidates.some((c) => c.id === candidate.id)) {
        picked = candidate;
        cursor = (cursor + step) % available.length;
        break;
      }
    }
    assignments.push({ mission_id: mission.id, member_id: picked.id });
    cursor = (cursor + 1) % available.length;
  }

  return {
    assignments,
    cursor: assignments.length > 0 ? assignments[assignments.length - 1].member_id : (input.roundRobinCursor ?? null),
  };
}

function assignPointsBased(input: BalanceInput, available: BalanceMember[], poolPoints: number) {
  const ledgerByMember = new Map(input.ledger.map((row) => [row.member_id, row]));

  // How far below target each member would be once this run's share lands.
  // Debt counts toward the deficit but is never merged into points_target.
  const deficit = new Map<string, number>();
  for (const member of available) {
    const row = ledgerByMember.get(member.id);
    const target = Number(row?.points_target ?? 0) + shareOfPool(member, input.members, poolPoints);
    deficit.set(member.id, target + Number(row?.debt ?? 0) - Number(row?.points_earned ?? 0));
  }

  const assignments: BalanceResult['assignments'] = [];
  for (const mission of input.missions) {
    const candidates = candidatesFor(mission, available, input.eligibleByTemplate);
    if (candidates.length === 0) {
      continue;
    }
    let picked = candidates[0];
    let highest = -Infinity;
    for (const member of candidates) {
      const value = deficit.get(member.id) ?? 0;
      // Strictly greater, so an exact tie keeps the earlier member -- and the
      // caller passes members in a stable order, which is the round-robin
      // tie-break the spec asks for.
      if (value > highest) {
        highest = value;
        picked = member;
      }
    }
    assignments.push({ mission_id: mission.id, member_id: picked.id });
    deficit.set(picked.id, (deficit.get(picked.id) ?? 0) - mission.points);
  }
  return assignments;
}

export function planBalanceRun(input: BalanceInput): BalanceResult {
  const poolPoints = input.missions.reduce((sum, m) => sum + m.points, 0);

  // Manual means the admin assigns by hand; the ledger is not advanced either,
  // because no pool was distributed.
  if (input.strategy === 'manual') {
    return {
      assignments: [],
      unassignedMissionIds: input.missions.map((m) => m.id),
      ledgerEntries: [],
      roundRobinCursor: input.roundRobinCursor ?? null,
    };
  }

  const unavailable = new Set(input.unavailableMemberIds);
  const available = input.members.filter((m) => !unavailable.has(m.id));

  let assignments: BalanceResult['assignments'] = [];
  let cursor = input.roundRobinCursor ?? null;

  if (available.length > 0) {
    if (input.strategy === 'round_robin') {
      const result = assignRoundRobin(input, available);
      assignments = result.assignments;
      cursor = result.cursor;
    } else {
      assignments = assignPointsBased(input, available, poolPoints);
    }
  }

  const assignedIds = new Set(assignments.map((a) => a.mission_id));

  return {
    assignments,
    unassignedMissionIds: input.missions.filter((m) => !assignedIds.has(m.id)).map((m) => m.id),
    // Targets advance for the whole house even when nothing could be assigned:
    // the period still happened, and the debt accounting depends on it.
    ledgerEntries: input.strategy === 'points_based' ? ledgerEntriesFor(input, poolPoints) : [],
    roundRobinCursor: cursor,
  };
}
