// J11.5.1 between plays, the bench part: steps 1 (fatigue and recovery), 2 and 3 (injuries, required
// absences, ejections) and 6 (snap counts). Rotation (step 4) is lineup.ts; sideline information (step 5)
// belongs to I7. The game flow calls `benchAfterPlay` once per resolved play in place of its own
// bookkeeping, and `benchAtBreak` at timeouts, period breaks and halftime.
import type { Contract } from '@gm/engine-core';
import { rest, restBreak, spendEnergy, type BreakKind, type FreshnessDeps } from './freshness.ts';

type GameDayState = Contract.GameDayState;
type Bench = Readonly<Record<string, GameDayState>>;
type BenchPair = readonly [Bench, Bench];
/** Long-term freshness each player started the game with, by side and player id. */
export type Ceilings = readonly [Readonly<Record<string, number>>, Readonly<Record<string, number>>];

/** An injury from the play (J10.7 delivers these once WP-22 exists). */
export interface InjuryNotice {
  readonly side: Contract.Side;
  readonly playerId: number;
  /** `stoppage`: hurt, must sit the rule set's `injury.sit_downs`. `out`: done for the game. */
  readonly kind: 'stoppage' | 'out';
}

export interface AfterPlayInput {
  readonly deltas: readonly Contract.PlayerDelta[];
  /** False for a no-play: no snap is counted and no required-absence down is used. Energy is still spent. */
  readonly counts: boolean;
  readonly disqualified: readonly number[];
  readonly injuries: readonly InjuryNotice[];
  /** Live time of the play, in seconds. Bench players rest through it. */
  readonly liveSeconds: number;
  /** Real seconds from the dead ball to the next snap (the call cycle, D10.1.1 inputs). */
  readonly deadSeconds: number;
  /** Long-term freshness each player started the game with, by side and player id. Missing reads as 1. */
  readonly ceilings: Ceilings;
  /** D10.5.1 recovery multiplier per side (environmentFactors(...).recovery). */
  readonly recovery: readonly [number, number];
}

export interface BenchDeps extends FreshnessDeps {
  readonly rules: Contract.RuleSet;
}

/** The bench after one play (J11.5.1 steps 1, 2, 3 and 6). Pure; players are visited in ascending id order. */
export function benchAfterPlay(gameDay: BenchPair, input: AfterPlayInput, deps: BenchDeps): [Bench, Bench] {
  const cost = new Map<string, number>();
  const onField = new Set<string>();
  for (const d of input.deltas) {
    const id = String(d.playerId);
    if (d.onField) onField.add(id);
    cost.set(id, (cost.get(id) ?? 0) + d.energyCost);
  }
  const ejected = new Set(input.disqualified.map(String));
  const sitDowns = deps.rules.num('injury.sit_downs');
  const side = (s: Contract.Side): Bench => {
    const bench = gameDay[s];
    const hurt = new Map(input.injuries.filter((i) => i.side === s).map((i) => [String(i.playerId), i.kind]));
    const out: Record<string, GameDayState> = {};
    for (const id of Object.keys(bench).sort(byNumericId)) {
      let p = bench[id]!;
      const ceiling = input.ceilings[s][id] ?? 1;
      const playing = onField.has(id);
      // Step 1: spend the play's cost, then rest. On the field a player rests only through the dead time;
      // on the bench through the play and the dead time, at the bench rate.
      p = spendEnergy(p, cost.get(id) ?? 0, deps.params);
      p = rest(p, playing ? input.deadSeconds : input.liveSeconds + input.deadSeconds, !playing, ceiling, input.recovery[s], deps);
      // Step 3 before step 2 for counters set on earlier plays, so a player hurt on this play still sits the next down.
      const absence = input.counts && p.requiredAbsenceDowns > 0 ? p.requiredAbsenceDowns - 1 : p.requiredAbsenceDowns;
      const kind = hurt.get(id);
      const requiredAbsenceDowns = kind === 'stoppage' ? Math.max(absence, sitDowns) : absence;
      const unavailable = p.unavailable || kind === 'out';
      const isEjected = p.ejected || ejected.has(id);
      // Step 6.
      const snapsThisGame = input.counts && playing ? p.snapsThisGame + 1 : p.snapsThisGame;
      out[id] = { ...p, requiredAbsenceDowns, unavailable, ejected: isEjected, snapsThisGame };
    }
    return out;
  };
  return [side(0), side(1)];
}

/** Timeouts, period breaks and halftime (D10.1.1). */
export function benchAtBreak(gameDay: BenchPair, kind: BreakKind, ceilings: Ceilings, params: Contract.ParamTable): [Bench, Bench] {
  const side = (s: Contract.Side): Bench => {
    const out: Record<string, GameDayState> = {};
    for (const id of Object.keys(gameDay[s]).sort(byNumericId)) out[id] = restBreak(gameDay[s][id]!, kind, ceilings[s][id] ?? 1, params);
    return out;
  };
  return [side(0), side(1)];
}

/** Ceilings for `AfterPlayInput`: each dressed player's long-term freshness at kickoff. */
export function ceilingsOf(teams: readonly [Contract.SimTeam, Contract.SimTeam]): Ceilings {
  const one = (t: Contract.SimTeam) => Object.fromEntries(t.players.map((p) => [String(p.playerId), p.gameDay.freshnessLongTerm]));
  return [one(teams[0]), one(teams[1])];
}

export function byNumericId(a: string, b: string): number {
  return Number(a) - Number(b);
}
