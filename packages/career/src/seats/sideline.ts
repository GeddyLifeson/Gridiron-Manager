// S5.2 sideline roles. S5.2.1: the substitution assistant sends the right players from his position and counts
// eleven before the huddle breaks; an error gives 12 (a foul or a burned timeout), 10 men, or the wrong player in
// a package. S5.2.2: the position coach between series picks up to two corrections from a list built from what
// really happened; a right one, given the way the player learns, lowers the repeat chance of that failure for the
// rest of the game. The user has no stored teaching value (E9.1.3 case 2): the same correction given the same way
// to the same player has the same effect in any season. An AI position coach uses his K6 teaching parameter there.
import { chance, clamp, lerp, type Draw } from '../gameday/math.ts';
import { sp, type SeatRules } from './params.ts';

// ---------- S5.2.1 substitution ----------

export interface SubTask {
  /** Players the personnel call needs from this coach's position group. */
  readonly required: readonly number[];
  /** Players of his group on the field now. */
  readonly onFieldGroup: readonly number[];
  /** Players on the field from every other group after their own substitutions. */
  readonly othersOnField: number;
  readonly calledAtS: number;
  readonly side: 'offense' | 'defense' | 'special_teams';
  readonly tempo: boolean;
  /** The personnel call came late (I2.2). */
  readonly lateCall: boolean;
  readonly afterTwoMinuteTimeout: boolean;
  readonly timeoutsLeft: number;
}

export interface SubEntry { readonly sendIn: readonly number[]; readonly takeOut: readonly number[]; readonly atS: number | null }

export type SubConsequence = 'none' | 'foul_too_many' | 'timeout_burned' | 'ten_men' | 'wrong_player';

export interface SubResult {
  readonly correct: boolean;
  readonly onTime: boolean;
  readonly onField: readonly number[];
  readonly count: number;
  readonly consequence: SubConsequence;
  /** College late-half addition: the defense with 12 that plays the down also gives a clock reset. */
  readonly clockReset: boolean;
}

/** Grade a substitution (S5.2.1). A late entry is not applied: the group stays as it was. */
export function resolveSub(t: SubTask, e: SubEntry, rules: SeatRules, draw: Draw): SubResult {
  const onTime = e.atS !== null && e.atS - t.calledAtS <= sp('sub.windowS');
  const group = new Set(t.onFieldGroup);
  if (onTime) {
    for (const p of e.takeOut) group.delete(p);
    for (const p of e.sendIn) group.add(p);
  }
  const onField = [...group].sort((a, b) => a - b);
  const count = t.othersOnField + onField.length;
  const req = new Set(t.required);
  const correct = onField.length === req.size && onField.every((p) => req.has(p));
  let consequence: SubConsequence = 'none';
  let clockReset = false;
  if (count > 11) {
    if (t.timeoutsLeft > 0 && chance(sp('sub.timeoutCatch'), draw)) consequence = 'timeout_burned';
    else {
      consequence = 'foul_too_many';
      clockReset = t.side === 'defense' && t.afterTwoMinuteTimeout && rules.lateHalfTwelveClockReset === true;
    }
  } else if (count < 11) consequence = 'ten_men';
  else if (!correct) consequence = 'wrong_player';
  return { correct, onTime, onField, count, consequence, clockReset };
}

/** The chance an AI substitution assistant gets it wrong (S5.2.1 AI use). */
export function aiSubErrorChance(tempo: boolean, lateCall: boolean): number {
  return clamp(sp('sub.aiErrorBase') + (tempo ? sp('sub.aiErrorTempo') : 0) + (lateCall ? sp('sub.aiErrorLateCall') : 0), 0, 1);
}

/** An AI assistant's entry: right and on time, or one player short and late. */
export function aiSub(t: SubTask, draw: Draw): SubEntry {
  const sendIn = t.required.filter((p) => !t.onFieldGroup.includes(p));
  const takeOut = t.onFieldGroup.filter((p) => !t.required.includes(p));
  if (chance(aiSubErrorChance(t.tempo, t.lateCall), draw)) return { sendIn: sendIn.slice(1), takeOut, atS: t.calledAtS + sp('sub.windowS') - 1 };
  return { sendIn, takeOut, atS: t.calledAtS + 2 };
}

/** An injured player waved off late (S5.2.1 edge case): the next man on the depth chart who is not already in. */
export function nextMan(injured: number, depth: readonly number[], unavailable: readonly number[]): number | null {
  const out = new Set([injured, ...unavailable]);
  return depth.find((p) => !out.has(p)) ?? null;
}

// ---------- S5.2.2 position coach between series ----------

/** One true cause of a failed play at his position (J6 contest results, J4 errors). */
export interface TrueCause { readonly id: string; readonly playerId: number; readonly kind: string; readonly playIds: readonly number[] }

export interface CorrectionOption { readonly id: string; readonly playerId: number; readonly kind: string; /** null when the option names no real cause. */ readonly causeId: string | null }

/**
 * The correction list (S5.2.2): every true cause, plus options from the position's catalogue of failures that
 * did not happen today (ordered by the draw), so the list does not give the answer away.
 */
export function correctionList(causes: readonly TrueCause[], catalogue: readonly { playerId: number; kind: string }[], decoys: number, draw: Draw): CorrectionOption[] {
  const real = causes.map((c) => ({ id: `c:${c.id}`, playerId: c.playerId, kind: c.kind, causeId: c.id }));
  const seen = new Set(causes.map((c) => `${c.playerId}:${c.kind}`));
  const pool = catalogue.filter((x) => !seen.has(`${x.playerId}:${x.kind}`)).map((x) => ({ x, k: draw() })).sort((a, b) => a.k - b.k).slice(0, decoys);
  const fake = pool.map(({ x }, i) => ({ id: `d:${i}`, playerId: x.playerId, kind: x.kind, causeId: null }));
  return [...real, ...fake].map((o) => ({ o, k: draw() })).sort((a, b) => a.k - b.k).map(({ o }) => o);
}

export type TeachWay = 'words' | 'picture' | 'walkthrough';

export interface PlayerState { readonly playerId: number; /** 0 to 1. */ readonly composure: number; readonly learns: TeachWay }

export interface CorrectionGiven { readonly optionId: string; readonly way: TeachWay }

/** How the coach delivers: the user's choice of way against the learning style, or the AI coach's K6 parameter. */
export type Teacher = { readonly kind: 'user' } | { readonly kind: 'ai'; /** hidden K6 teaching, 0 to 1. */ readonly teaching: number };

/** Effect on one failure kind of one player for the rest of the game: multiply its chance by `factor`, then add `add`. */
export interface RepeatEffect { readonly playerId: number; readonly kind: string; readonly factor: number; readonly add: number; readonly correctionId: string; readonly right: boolean }

export interface WindowState { readonly opensS: number; /** When the unit must go back out; a quick turnover moves it earlier. */ readonly closesS: number }

/**
 * Apply the corrections given in the window (S5.2.2 rules 2 to 4). Only corrections given before the window closes
 * apply (edge case: a quick turnover). At most `corr.maxPerSeries` count; more lower the effect of each.
 */
export function applyCorrections(options: readonly CorrectionOption[], given: readonly (CorrectionGiven & { atS: number })[], players: readonly PlayerState[], teacher: Teacher, win: WindowState, draw: Draw): RepeatEffect[] {
  const inTime = given.filter((g) => g.atS >= win.opensS && g.atS <= win.closesS).slice(0, sp('corr.maxPerSeries'));
  const n = inTime.length;
  const crowd = 1 / (1 + sp('corr.crowding') * Math.max(0, n - 1));
  const byId = new Map(options.map((o) => [o.id, o]));
  const byPlayer = new Map(players.map((p) => [p.playerId, p]));
  const out: RepeatEffect[] = [];
  for (const g of inTime) {
    const o = byId.get(g.optionId);
    if (!o) continue;
    const p = byPlayer.get(o.playerId);
    const composure = p ? clamp(p.composure, 0, 1) : 0.5;
    if (o.causeId !== null) {
      const fit = teacher.kind === 'ai' ? clamp(teacher.teaching, 0, 1) : (p && p.learns === g.way ? sp('corr.styleMatch') : sp('corr.styleMiss'));
      const cut = sp('corr.baseCut') * lerp(sp('corr.composureFloor'), 1, composure) * fit * crowd;
      out.push({ playerId: o.playerId, kind: o.kind, factor: 1 - clamp(cut, 0, 1), add: 0, correctionId: o.id, right: true });
    } else {
      const hesitant = chance(sp('corr.hesitantChance'), draw);
      out.push({ playerId: o.playerId, kind: o.kind, factor: 1, add: hesitant ? sp('corr.hesitantAdd') : 0, correctionId: o.id, right: false });
    }
  }
  return out;
}

/** The chance of a failure after the game's corrections so far (repeat rate for the rest of the game). */
export function failureChance(base: number, playerId: number, kind: string, effects: readonly RepeatEffect[]): number {
  let p = base;
  for (const e of effects) if (e.playerId === playerId && e.kind === kind) p = p * e.factor + e.add;
  for (const e of effects) if (e.playerId === playerId && e.kind !== kind && e.add > 0) p += e.add;
  return clamp(p, 0, 1);
}

/** The one-line report up the channel, graded for accuracy against the claims the truth supports (rule 5). */
export function gradeReport(claim: string | null, trueClaims: readonly string[]): { accurate: boolean; score: number } {
  const accurate = claim !== null && trueClaims.includes(claim);
  return { accurate, score: accurate ? 1 : 0 };
}

/** An AI position coach's diagnosis: each real cause found with his K6 hit rate, at most the series limit. */
export function aiCorrections(options: readonly CorrectionOption[], players: readonly PlayerState[], hitRate: number, atS: number, draw: Draw): (CorrectionGiven & { atS: number })[] {
  const ways = new Map(players.map((p) => [p.playerId, p.learns]));
  const out: (CorrectionGiven & { atS: number })[] = [];
  for (const o of options) {
    if (out.length >= sp('corr.maxPerSeries')) break;
    if (o.causeId !== null && chance(hitRate, draw)) out.push({ optionId: o.id, way: ways.get(o.playerId) ?? 'words', atS });
  }
  return out;
}
