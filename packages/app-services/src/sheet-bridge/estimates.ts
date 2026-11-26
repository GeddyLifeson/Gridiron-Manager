// The staff's payoff estimates for the user's sheet (K3.3.1 for the user's own staff, K6: "his opinion is only
// as good as his estimates"). What the staff know is what they have seen: the team's own charted film
// (G-66 rows with source 'own', the same rows the self-scout screens read, G8). Every number here is an
// observed grade: an average of charted results, shrunk toward the broader group when the film is thin, with
// the staff's own error on top. Nothing reads a true rating, a player attribute or the engine's odds.
//
// Levels (empirical-Bayes shrinkage, each toward the level above it, by `shrinkPlays` plays of weight):
//   all plays of the unit -> the call's family (G1.1.1 kind or coverage family) -> the call
//   the call -> the call against a look (K3.3.2 matrix cell)
//   the call -> the call in a catalogue situation (G7.2.2), which ranks the calls inside a sheet box
// Skill enters twice: estimate noise with SD by `preparation` (K3.3.1 rule 4, 0.20 to 0.05 expected points,
// through coach-ai `prepDepth`), and how much of the film the staff could chart (the caller passes the rows
// they charted). Payoffs are from the unit's side: expected points added for offense, saved for defense.
import { preparation } from '@gm/coach-ai';
import { DMATH } from '@gm/engine-core';
import { gameplan as gp } from '@gm/football-content';
import { ep, tendencies } from '@gm/models';

type ChartedPlay = tendencies.ChartedPlay;
type CallOption = preparation.CallOption;
type Estimate = preparation.Estimate;

/** Starting values, all Assumptions of this module (no bible value names them). */
export const ESTIMATE_PARAMS = {
  /** Weight, in plays, of the level above when a level's own film is thin. */
  shrinkPlays: 12,
  /** Per-play SD of the payoff used until the film has two plays (expected points). */
  playSdStart: 1.4,
  /** Timeouts each side assumed in the yardage EPA (charted rows do not carry them). */
  timeoutsAssumed: 3,
  /** Seconds in a quarter, for the half clock of a charted row (pro and college both play 15-minute quarters). */
  quarterSeconds: 900,
} as const;

export type EstimateUnit = 'offense' | 'defense';

export interface EstimateInput {
  readonly unit: EstimateUnit;
  /** The plan's calls as the staff list them (callId = plan entry id), in plan order. */
  readonly calls: readonly CallOption[];
  /** Which calls a charted row is evidence for. */
  readonly callsOf: (p: ChartedPlay) => readonly string[];
  /** The staff's charted film of the own team, this unit's side. Rows of other teams or sides are ignored. */
  readonly film: readonly ChartedPlay[];
  readonly teamId: number;
  /** The look a row's call met (the class the scouting report uses); null puts the row in 'other'. */
  readonly lookOf: (p: ChartedPlay) => string | null;
  /** Looks to estimate against (the scouting report's classes). 'other' is always added. */
  readonly looks: readonly string[];
  /** Catalogue situations to estimate per call (sheet boxes). */
  readonly situationIds: readonly string[];
  /** K2.1.4 preparation of the coach who owns the plan, as a z value. */
  readonly preparationZ: number;
  /** Stream for the staff's estimate error (coach-ai `payoffNoise`, scoped by season, week and team). */
  readonly noise: preparation.PrepStream;
  /** Payoff of one charted play from the unit's side. Default: yardage EPA on the baseline model. */
  readonly payoffOf?: (p: ChartedPlay) => number | null;
}

export interface StaffEstimates {
  readonly table: preparation.PayoffTable;
  /** Situation id -> call id -> the staff's estimate there. */
  readonly bySituation: ReadonlyMap<string, ReadonlyMap<string, Estimate>>;
  /** Charted plays behind each call, for the screen ("seen 14 times"). */
  readonly seen: ReadonlyMap<string, number>;
  readonly playsUsed: number;
}

// ---- the yardage EPA of a charted row ----

let epModel: ep.EpModel | null = null;
const model = (): ep.EpModel => (epModel ??= ep.loadEpModel(ep.BASELINE_EP_MODEL));

/** Seconds left in the half from a charted row's quarter and clock (overtime counts as its own half). */
export function halfSecondsOf(p: Pick<ChartedPlay, 'quarter' | 'clockTenths'>): number {
  const clock = p.clockTenths / 10;
  return p.quarter === 1 || p.quarter === 3 ? clock + ESTIMATE_PARAMS.quarterSeconds : clock;
}

/**
 * EPA for the offense from what a chart records (down, distance, yards to goal, yards gained), on the
 * N2.2.1 baseline model. Charted rows carry no turnover or timeout, so a turnover counts only its yards and
 * both sides hold the assumed timeouts (Assumption). Null for rows that are not a play's result.
 */
export function yardageEpa(p: ChartedPlay): number | null {
  if (p.forced || p.lookOnly) return null;
  const half = halfSecondsOf(p);
  const to = ESTIMATE_PARAMS.timeoutsAssumed;
  const st = (down: number, distanceYd: number, yardsToGoalYd: number): ep.EpState =>
    ({ kind: 'scrimmage', down, distanceYd, yardsToGoalYd, halfSecondsLeft: half, timeoutsOffense: to, timeoutsDefense: to, home: false });
  const before = st(p.down, Math.max(1, p.distanceYd), Math.min(99, Math.max(1, p.yardsToGoalYd)));
  const left = p.yardsToGoalYd - p.yards;
  let end: ep.PlayEnd;
  if (half <= 0) end = { kind: 'half_over' };
  else if (left <= 0) end = { kind: 'score', scorer: 'offense', score: 'touchdown' };
  else if (left >= 100) end = { kind: 'score', scorer: 'defense', score: 'safety' };
  else if (p.yards >= p.distanceYd) end = { kind: 'state', after: st(1, Math.min(10, left), left), possessionChanged: false };
  else if (p.down < 4) end = { kind: 'state', after: st(p.down + 1, p.distanceYd - p.yards, left), possessionChanged: false };
  else end = { kind: 'state', after: st(1, Math.min(10, 100 - left), 100 - left), possessionChanged: true };
  return ep.epa(model(), before, end, DMATH);
}

// ---- situation of a charted row ----

const AFTER: Readonly<Record<tendencies.AfterEvent, gp.AfterEvent>> = {
  none: 'none', sack: 'sack', turnover: 'turnover', timeout: 'none', penalty_first_down: 'penalty', first_play: 'first_play',
};

/** The G7.2.1 state of a charted row (timeouts and formation family are not charted: neutral values). */
export function stateOf(p: ChartedPlay): gp.SituationState {
  const half = halfSecondsOf(p);
  const game = p.quarter <= 2 ? half + 2 * ESTIMATE_PARAMS.quarterSeconds : p.quarter <= 4 ? half : 0;
  return {
    ...gp.NEUTRAL_STATE, down: p.down, distanceYd: p.distanceYd, yardsToGoalYd: p.yardsToGoalYd, halfSecondsLeft: half, gameSecondsLeft: game,
    scoreDiff: p.scoreDiff, tempo: p.tempo, personnel: p.personnel, hash: p.hash, afterEvent: AFTER[p.afterEvent] ?? 'none',
  };
}

// ---- the estimates ----

interface Acc { w: number; sum: number; sq: number }
const acc = (): Acc => ({ w: 0, sum: 0, sq: 0 });
const add = (a: Acc, v: number, w: number) => { a.w += w; a.sum += w * v; a.sq += w * v * v; };
const meanOf = (a: Acc | undefined, fallback: number): number => (a && a.w > 0 ? a.sum / a.w : fallback);

/** A level's mean shrunk toward its parent, and the SD of that estimate from the plays behind it. */
function shrink(a: Acc | undefined, parent: number, playSd: number): { mean: number; se: number; w: number } {
  const k = ESTIMATE_PARAMS.shrinkPlays;
  const w = a?.w ?? 0;
  return { mean: (w * meanOf(a, 0) + k * parent) / (w + k), se: playSd / Math.sqrt(w + k), w };
}

export function staffEstimates(inp: EstimateInput): StaffEstimates {
  const valueOf = inp.payoffOf ?? ((p: ChartedPlay) => { const v = yardageEpa(p); return v === null ? null : inp.unit === 'defense' ? -v : v; });
  const looks = [...new Set([...inp.looks, preparation.OTHER_LOOK])];
  const lookSet = new Set(looks);
  const rules = inp.situationIds.map((id) => ({ id, rule: gp.CATALOGUE_BY_ID.get(id)?.situation ?? null })).filter((r) => r.rule !== null);
  const familyOf = new Map(inp.calls.map((c) => [c.callId, c.conceptFamily]));
  const known = new Set(inp.calls.map((c) => c.callId));

  const all = acc();
  const fam = new Map<string, Acc>();
  const call = new Map<string, Acc>();
  const cell = new Map<string, Acc>();
  const sit = new Map<string, Acc>();
  const get = (m: Map<string, Acc>, k: string) => { let a = m.get(k); if (!a) { a = acc(); m.set(k, a); } return a; };
  let used = 0;
  for (const p of inp.film) {
    if (p.teamId !== inp.teamId || p.side !== inp.unit || !tendencies.countsForCalls(p)) continue;
    const v = valueOf(p);
    if (v === null || !Number.isFinite(v)) continue;
    const ids = inp.callsOf(p).filter((id) => known.has(id));
    if (!ids.length) continue;
    used++;
    const w = (p.weight ?? 1) / ids.length;
    const raw = inp.lookOf(p);
    const look = raw !== null && lookSet.has(raw) ? raw : preparation.OTHER_LOOK;
    const state = stateOf(p);
    const sits = rules.filter((r) => gp.situationMatches(r.rule!, state)).map((r) => r.id);
    add(all, v, w * ids.length);
    for (const id of ids) {
      add(get(fam, familyOf.get(id)!), v, w);
      add(get(call, id), v, w);
      add(get(cell, preparation.cellKey(id, look)), v, w);
      for (const s of sits) add(get(sit, `${s}|${id}`), v, w);
    }
  }

  const grand = meanOf(all, 0);
  const variance = all.w > 1 ? Math.max(0, all.sq / all.w - grand * grand) : 0;
  const playSd = all.w > 1 && variance > 0 ? Math.sqrt(variance) : ESTIMATE_PARAMS.playSdStart;
  // With no film at all the staff have no opinion to be wrong about: no noise, so the plan's order stands.
  const noiseSd = used === 0 ? 0 : preparation.prepDepth({ preparationZ: inp.preparationZ, evaluationZ: inp.preparationZ, tellHours: 0 }).noiseSd;
  // Plan order breaks exact ties (a call never seen, in a family never seen), so an empty film gives the plan's order.
  const tie = (i: number) => -i * 1e-9;
  const callLevel = new Map<string, { mean: number; se: number; w: number }>();
  inp.calls.forEach((c) => {
    const f = shrink(fam.get(c.conceptFamily), grand, playSd);
    callLevel.set(c.callId, shrink(call.get(c.callId), f.mean, playSd));
  });

  // Noise is drawn per cell in call-id then look order, then per situation in situation then call-id order.
  const sorted = [...inp.calls].map((c, i) => ({ c, i })).sort((a, b) => (a.c.callId < b.c.callId ? -1 : a.c.callId > b.c.callId ? 1 : 0));
  const cells = new Map<string, preparation.PayoffCell>();
  for (const { c, i } of sorted) for (const look of looks) {
    const base = callLevel.get(c.callId)!;
    const e = shrink(cell.get(preparation.cellKey(c.callId, look)), base.mean, playSd);
    const n = inp.noise.normal() * noiseSd;
    cells.set(preparation.cellKey(c.callId, look), { callId: c.callId, look, mean: e.mean + n + tie(i), sd: Math.sqrt(e.se * e.se + noiseSd * noiseSd), reps: Math.round(e.w) });
  }
  const bySituation = new Map<string, Map<string, Estimate>>();
  for (const r of [...rules].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const m = new Map<string, Estimate>();
    for (const { c, i } of sorted) {
      const e = shrink(sit.get(`${r.id}|${c.callId}`), callLevel.get(c.callId)!.mean, playSd);
      const n = inp.noise.normal() * noiseSd;
      m.set(c.callId, { mean: e.mean + n + tie(i), sd: Math.sqrt(e.se * e.se + noiseSd * noiseSd) });
    }
    bySituation.set(r.id, m);
  }
  const seen = new Map(inp.calls.map((c) => [c.callId, Math.round(call.get(c.callId)?.w ?? 0)]));
  return { table: { unit: inp.unit, looks, cells, repsUsed: 0 }, bySituation, seen, playsUsed: used };
}
