// T4.8.1 signing numbers by position against the roster limit; T4.8.2 the high school, transfer and
// junior college split; T4.8.3 walk-ons. The board counts; it never forbids. Over-signing is allowed, and
// staying over the limit on the binding date is a violation only when the coach chose to stay over.
import type { RecruitingContext } from './context.ts';
import { KEY, num } from './keys.ts';
import { P } from './params.ts';
import { ROSTER_SHAPE } from './pool.ts';
import { breach } from './limits.ts';
import { logBreaches, type ComplianceHook } from './actions.ts';
import { POSITION_GROUPS, type ClassPlanRow, type PositionGroup, type RecruitingState } from './types.ts';

/** Default class plan: the T4.8.1 shape less returning players, split by the AI default mix (T4.8.2, Assumption). */
export function defaultPlan(ctx: RecruitingContext, teamId: number, mix: { highSchool: number; transfer: number; juco: number } = {
  highSchool: P('mix.highSchool'), transfer: P('mix.transfer'), juco: P('mix.juco'),
}): ClassPlanRow[] {
  return POSITION_GROUPS.map((position) => {
    const target = Math.max(0, ROSTER_SHAPE[position] - ctx.programs.returning(teamId, position));
    const hs = Math.round(target * mix.highSchool);
    const juco = Math.round(target * mix.juco);
    const transfer = Math.max(0, target - hs - juco);
    return { position, target, split: { highSchool: hs, transfer, juco }, heldForTransfer: transfer };
  });
}

export interface NumbersRow {
  readonly position: PositionGroup;
  readonly returning: number;
  readonly target: number;
  readonly committed: number;
  readonly signed: number;
  readonly offersOut: number;
  /** Places still open for high school and junior college players at this position (negative = over target). */
  readonly open: number;
  readonly heldForTransfer: number;
}

export interface NumbersBoard {
  readonly rows: readonly NumbersRow[];
  readonly returning: number;
  readonly incoming: number;
  /** Returning plus committed and signed plus walk-ons: the roster count T5.1.1 uses on that date. */
  readonly total: number;
  readonly limit: number | undefined;
  readonly walkOns: number;
  readonly signeeCap: number | undefined;
}

/** The numbers board (T4.8.1 "What the user sees"). Counts only; a commitment past the target is shown, never refused. */
export function numbersBoard(state: RecruitingState, ctx: RecruitingContext, teamId: number, classYear: number, day: number, walkOns = 0): NumbersBoard {
  const plan = state.plans[teamId] ?? defaultPlan(ctx, teamId);
  const rows: NumbersRow[] = [];
  let returning = 0; let incoming = 0;
  for (const row of plan) {
    let committed = 0; let signed = 0; let offersOut = 0;
    for (const p of Object.values(state.prospects)) {
      if (p.classYear !== classYear || p.position !== row.position) continue;
      const st = state.status[p.personId]!;
      if (st.teamId === teamId && st.status === 'committed') committed += 1;
      if (st.teamId === teamId && (st.status === 'signed' || st.status === 'enrolled')) signed += 1;
    }
    for (const o of state.offers) {
      if (o.teamId !== teamId || o.withdrawn) continue;
      const p = state.prospects[o.prospectId];
      if (p && p.classYear === classYear && p.position === row.position) offersOut += 1;
    }
    const ret = ctx.programs.returning(teamId, row.position);
    returning += ret; incoming += committed + signed;
    rows.push({ position: row.position, returning: ret, target: row.target, committed, signed, offersOut, open: row.target - row.heldForTransfer - committed - signed, heldForTransfer: row.heldForTransfer });
  }
  const rules = ctx.rulesOn(day);
  return { rows, returning, incoming, total: returning + incoming + walkOns, limit: num(rules, KEY.rosterLimit), walkOns, signeeCap: num(rules, KEY.signeeCap) };
}

/** Places open overall = roster limit - returning - places held for transfers and walk-ons (T4.8.1 rule 1). */
export function placesOpen(board: NumbersBoard): number | undefined {
  if (board.limit === undefined) return undefined;
  const held = board.rows.reduce((a, r) => a + r.heldForTransfer, 0);
  return board.limit - board.returning - held - board.walkOns - board.incoming;
}

/**
 * Walk-on places (T4.8.3): with a roster limit, aid players plus walk-ons may not pass it; without one,
 * walk-ons are bounded only by the program's budget and locker space.
 */
export function walkOnPlaces(ctx: RecruitingContext, day: number, aidPlayers: number, lockerSpace: number): number {
  const limit = num(ctx.rulesOn(day), KEY.rosterLimit);
  return limit === undefined ? Math.max(0, lockerSpace - aidPlayers) : Math.max(0, Math.min(lockerSpace, limit) - aidPlayers);
}

/**
 * The date the roster limit binds (T4.8.1 rule 3; acceptance 3). Over the limit, the coach is warned; a
 * row is written only when he chose to stay over. Returns the log id or null.
 */
export function rosterLimitCheck(
  state: RecruitingState, ctx: RecruitingContext, hook: ComplianceHook, teamId: number, staffId: number, day: number, rosterCount: number, stayOver: boolean,
): { over: number; logId: number | null } {
  const limit = num(ctx.rulesOn(day), KEY.rosterLimit);
  if (limit === undefined || rosterCount <= limit) return { over: 0, logId: null };
  const over = rosterCount - limit;
  if (!stayOver) return { over, logId: null };
  return { over, logId: logBreaches(state, ctx, hook, [breach('roster_over_limit')], { staffId, teamId, prospectId: null, day, knew: [], gain: P('roster.overLimitGain') }) };
}
