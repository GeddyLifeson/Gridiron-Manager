// X13.2 moving between tiers. Promotion is immediate; demotion waits for a week boundary, respects the
// hold, and never drops a person the user is tied to (that floor is part of membership).
//
// X13.2.1 describes a seeded fill-in for state a lower tier did not keep. Under A3.1.1 row 20 no tier
// drops or thins any simulated state, so there is nothing to fill in: a move changes the tier and
// nothing else. The `tier.promote` stream is therefore not opened. Sent to the bible fixes thread.
import type { TierRow, WorldDate, WorldTier } from '@gm/schema';
import type { LiveWorld } from '../loop/types.ts';
import { TIER_CHANGED } from './events.ts';
import { SHORT_REASONS, computeMembership, type Membership, type TierInputs } from './membership.ts';
import { param } from './params.ts';

const FAR: WorldTier = 3;

/** X13.1.1 rule 5: the fixed points of a recompute. Only the first two may demote (X13.2.2 rule 1). */
export type RecomputeAt = 'season_start' | 'week_boundary' | 'hiring_day' | 'job_change' | 'board_add' | 'edge_formed' | 'opponent_announced';
const BOUNDARY: ReadonlySet<RecomputeAt> = new Set<RecomputeAt>(['season_start', 'week_boundary']);

export type SubjectKind = 'team' | 'person';
const key = (kind: SubjectKind, id: number): string => `${kind}:${id}`;

/** Saved with the world. Plain data: maps of numbers and dates. */
export interface TierState {
  /** Week boundaries seen so far; the clock the hold counts in. */
  boundary: number;
  /** Person id to tier. Absent means tier 3. Team tiers live on the world (`tiers`, `pendingTiers`). */
  readonly people: Map<number, WorldTier>;
  /** Subject key to the boundary count before which it is not demoted (X13.2.2 rule 4). */
  readonly holds: Map<string, number>;
  /** Subject key to the date its present tier began. */
  readonly since: Map<string, WorldDate>;
  /** Subject key to the membership reason it holds its tier for. */
  readonly reasons: Map<string, string>;
}

export function createTierState(): TierState {
  return { boundary: 0, people: new Map(), holds: new Map(), since: new Map(), reasons: new Map() };
}

/** A team's tier as it will stand at the next pass (a change waits in `pendingTiers` until then, X12.1.1). */
export function teamTier(world: LiveWorld, teamId: number): WorldTier {
  return world.pendingTiers.get(teamId) ?? world.tiers.get(teamId) ?? FAR;
}
export function personTier(state: TierState, personId: number): WorldTier {
  return state.people.get(personId) ?? FAR;
}

export interface TierChange {
  readonly kind: SubjectKind;
  readonly id: number;
  readonly from: WorldTier;
  readonly to: WorldTier;
  /** The membership reason for a promotion; `lapsed` for a demotion. */
  readonly reason: string;
  /** The reason the subject held its old tier for, if it had one. */
  readonly was: string | null;
}
export interface RecomputeResult {
  readonly at: RecomputeAt;
  readonly changes: readonly TierChange[];
  /** Demotions wanted by membership and not made: outside a boundary, or inside a hold. */
  readonly deferred: number;
  readonly membership: Membership;
}

/** Person reasons that follow from a team's tier. Those moves are logged once, on the team's row. */
const TEAM_DERIVED: ReadonlySet<string> = new Set(['user_team', 'near_team', 'scouted']);

/**
 * Recompute every tier (X13.1.1 rule 5) and apply the moves (X13.2). Call it between passes: team
 * changes go to `pendingTiers` and take effect when the next pass starts, so a game the user chose to
 * watch is promoted before kickoff and nothing changes inside a pass.
 */
export function recomputeTiers(world: LiveWorld, state: TierState, inputs: TierInputs, at: RecomputeAt): RecomputeResult {
  const boundary = BOUNDARY.has(at);
  if (boundary) state.boundary++;
  const membership = computeMembership(world, inputs);
  const holdWeeks = param('hold.weeks');
  const changes: TierChange[] = [];
  let deferred = 0;

  const move = (kind: SubjectKind, id: number, from: WorldTier, target: WorldTier, reason: string | undefined): WorldTier => {
    const k = key(kind, id);
    const was = state.reasons.get(k) ?? null;
    if (target === from || target < from) { if (reason === undefined) state.reasons.delete(k); else state.reasons.set(k, reason); }
    if (target < from) {
      if (reason !== undefined && SHORT_REASONS.has(reason)) state.holds.set(k, state.boundary + holdWeeks);
      state.since.set(k, world.date);
      changes.push({ kind, id, from, to: target, reason: reason ?? 'promoted', was });
      return target;
    }
    if (target > from) {
      if (!boundary || state.boundary < (state.holds.get(k) ?? 0)) { deferred++; return from; }
      state.holds.delete(k);
      state.since.set(k, world.date);
      if (reason === undefined) state.reasons.delete(k); else state.reasons.set(k, reason);
      changes.push({ kind, id, from, to: target, reason: 'lapsed', was });
      return target;
    }
    // Still wanted at this tier for a short reason: the hold runs from the last week it was wanted.
    if (reason !== undefined && SHORT_REASONS.has(reason)) state.holds.set(k, state.boundary + holdWeeks);
    return from;
  };

  for (const t of [...world.teams].sort((a, b) => a.id - b.id)) {
    const from = teamTier(world, t.id);
    const p = membership.teams.get(t.id);
    const to = move('team', t.id, from, p?.tier ?? FAR, p?.reason);
    if (to !== from) world.pendingTiers.set(t.id, to);
  }
  const ids = new Set<number>([...state.people.keys(), ...membership.people.keys()]);
  for (const id of [...ids].sort((a, b) => a - b)) {
    const from = personTier(state, id);
    const p = membership.people.get(id);
    const to = move('person', id, from, p?.tier ?? FAR, p?.reason);
    if (to === FAR) state.people.delete(id); else state.people.set(id, to);
  }

  for (const c of changes) {
    if (c.kind === 'person' && TEAM_DERIVED.has(c.reason === 'lapsed' ? c.was ?? '' : c.reason)) continue;
    const r = world.log.emit({
      type: TIER_CHANGED, date: world.date, witnesses: { kind: 'none' }, tier: c.to, source: 'sim',
      subjects: [{ kind: c.kind, id: c.id }], payload: { kind: c.kind, from: c.from, to: c.to, reason: c.reason, at },
    });
    if (!r.ok) throw new Error(`tier_changed refused (${r.code}): ${r.reason}. Pass TIER_EVENT_TYPES to createWorld.`);
  }
  return { at, changes, deferred, membership };
}

/** The membership table as save rows (schema `TierRow`): every subject nearer than tier 3. */
export function tierRows(world: LiveWorld, state: TierState): TierRow[] {
  const out: TierRow[] = [];
  const since = (k: string): WorldDate => state.since.get(k) ?? world.date;
  for (const t of [...world.teams].sort((a, b) => a.id - b.id)) {
    const tier = teamTier(world, t.id);
    if (tier !== FAR) out.push({ subjectKind: 'team', subjectId: t.id, tier, since: since(key('team', t.id)) });
  }
  for (const [id, tier] of [...state.people].sort((a, b) => a[0] - b[0])) out.push({ subjectKind: 'person', subjectId: id, tier, since: since(key('person', id)) });
  return out;
}
