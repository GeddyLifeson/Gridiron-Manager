// G4.4 short codes: wristbands (G4.4.1, G4.4.5), one-word and no-huddle codes (G4.4.2), sideline signals
// and their decoding (G4.4.3), and dummy calls (G4.4.4). Randomness is never drawn here: functions return
// chances, and the caller draws from its J13 stream.
import { possible } from '@gm/schema';
import { LEARNING_PROFILES, param } from './params.ts';
import { powReal, powInt } from './dmath.ts';
import type { Call, LanguageFamily } from './types.ts';
import { norm } from './words.ts';

// ---------------------------------------------------------------- wristbands (G4.4.1)

export interface BandFormat {
  readonly flaps: number;
  readonly sides: 1 | 2;
  readonly cellsPerSide: number;
  /** Cell labels: plain numbers ("38") or colour plus number ("Red 7"). */
  readonly scheme: 'number' | 'color_number';
  readonly colors: readonly string[];
  /** Who wears one: the quarterback only, or all eleven (G4.4.1). */
  readonly wearers: 'qb' | 'all';
}

export function bandCapacity(f: BandFormat): number { return f.flaps * f.sides * f.cellsPerSide; }

/** Cell labels in order. Colour scheme: cells per side are split evenly across colours ("Red 1" .. "Red n"). */
export function cellLabels(f: BandFormat): string[] {
  const n = bandCapacity(f);
  if (f.scheme === 'number') return Array.from({ length: n }, (_, i) => String(i + 1));
  if (!f.colors.length) throw new Error('colour scheme needs colours');
  const per = Math.ceil(n / f.colors.length);
  const out: string[] = [];
  for (const c of f.colors) for (let i = 1; i <= per && out.length < n; i++) out.push(`${c} ${i}`);
  return out;
}

export interface BandCell { readonly label: string; readonly call: Call; readonly playVersion: number; readonly secondVersion: number | null }
export interface Band { readonly week: number; readonly format: BandFormat; readonly cells: readonly BandCell[]; readonly dirtyDozen: readonly BandCell[] }

/**
 * Build a band (G4.4.1): calls fill cells in order. Over capacity is refused; the "dirty dozen" card holds
 * at most `band.dirtyDozen` calls. `versionOf` stamps each play's version so later edits are caught.
 */
export function buildBand(week: number, format: BandFormat, calls: readonly Call[], versionOf: (playId: string) => number, dirty: readonly Call[] = []): Band {
  const cap = Math.min(bandCapacity(format), param('band.maxCalls'));
  if (calls.length > cap) throw new Error(`band holds ${cap} calls; ${calls.length} given`);
  if (dirty.length > param('band.dirtyDozen')) throw new Error(`the dirty dozen card holds ${param('band.dirtyDozen')} calls`);
  const labels = cellLabels(format);
  const stamp = (label: string, call: Call): BandCell => ({ label, call, playVersion: versionOf(call.playId), secondVersion: call.second ? versionOf(call.second.playId) : null });
  const cells = calls.map((call, i) => stamp(labels[i]!, call));
  const dirtyDozen = dirty.map((call, i) => stamp(`D${i + 1}`, call));
  return { week, format, cells, dirtyDozen };
}

/** Cells whose play changed after the band was printed: re-code before kickoff or it stays off (G4.4.1 edge case). */
export function staleCells(band: Band, versionOf: (playId: string) => number): string[] {
  const stale = (c: BandCell) => versionOf(c.call.playId) !== c.playVersion || (c.call.second !== undefined && versionOf(c.call.second.playId) !== c.secondVersion);
  return [...band.cells, ...band.dirtyDozen].filter(stale).map((c) => c.label);
}

/** Lookup time: starting value falling with reps to a floor (G4.4.1 "less with familiarity"). */
export function lookupSeconds(reps: number): number {
  const top = param('band.lookupS');
  const low = param('band.lookupMinS');
  const t = Math.min(1, Math.max(0, reps / param('band.lookupRepsToMin')));
  return top - (top - low) * t;
}

/** Per-player chance of reading the wrong cell when all eleven wear bands, falling with reps (G4.4.1). */
export function lookupError(reps: number): number {
  const top = param('band.playerLookupError');
  const low = param('band.playerLookupErrorMin');
  const t = Math.min(1, Math.max(0, reps / param('band.lookupRepsToMin')));
  return top - (top - low) * t;
}

export interface BandTiming { readonly relayS: number; readonly huddleS: number; readonly presnapReadDelayS: number }

/**
 * Timing of a band call (G4.4.1). Relay is flat. QB-only bands: the quarterback reads the full call aloud,
 * so the huddle pays the spoken length plus lookup. All-eleven bands: he says only the number.
 */
export function bandTiming(format: BandFormat, spokenLengthS: number, numberLengthS: number, reps: number): BandTiming {
  const lookup = lookupSeconds(reps);
  const base = param('huddle.baseS');
  const huddleS = format.wearers === 'all' ? base + numberLengthS + lookup : base + spokenLengthS + lookup;
  return { relayS: param('band.relayS'), huddleS, presnapReadDelayS: lookup };
}

// ---------------------------------------------------------------- code words (G4.4.2)

export type CodeKind = 'play' | 'repeat' | 'indicator' | 'split';
export interface CodeRow {
  readonly word: string;
  readonly kind: CodeKind;
  /** For play codes: the call. For split sends: which part the word carries. */
  readonly call?: Call;
  readonly carries?: 'personnel' | 'formation' | 'snap_count' | 'play';
}

/** One week's code table (codes may be reassigned daily, weekly or in a game, G4.4.2). */
export interface CodeTable { readonly week: number; readonly rows: readonly CodeRow[]; readonly cells?: Band }

export function checkCodeTable(t: CodeTable): string[] {
  const errs: string[] = [];
  const seen = new Map<string, CodeRow>();
  for (const r of t.rows) {
    const k = norm(r.word);
    if (seen.has(k)) errs.push(`code word ${r.word} means two things`);
    seen.set(k, r);
    if (r.kind === 'play' && !r.call) errs.push(`play code ${r.word} names no call`);
  }
  return errs;
}

/** Package size check against the starting range (G4.4.2): a warning above the top, none below. */
export function packageWarning(t: CodeTable): string | null {
  const n = t.rows.filter((r) => r.kind === 'play').length;
  return n > param('codes.packageMax') ? `${n} play codes is above the starting package of ${param('codes.packageMax')}; check the week's teaching load` : null;
}

/** Teaching cost of a week's new code words: per player group per word, scaled by the family profile (G4.2.1). */
export function codeTeachingUnits(newWords: number, groups: number, family: LanguageFamily): number {
  return newWords * groups * param('codes.teachUnits') * LEARNING_PROFILES[family].codeWordCost;
}

export interface CodeHit { readonly kind: 'cell' | CodeKind; readonly label: string; readonly call: Call | null; readonly carries?: CodeRow['carries'] }
export interface CodeLookup { readonly hit: CodeHit | null; readonly older: readonly { readonly week: number; readonly hit: CodeHit }[] }

function findIn(t: CodeTable, q: string): CodeHit | null {
  const k = norm(q);
  if (t.cells) for (const c of [...t.cells.cells, ...t.cells.dirtyDozen]) if (norm(c.label) === k) return { kind: 'cell', label: c.label, call: c.call };
  for (const r of t.rows) if (norm(r.word) === k) return { kind: r.kind, label: r.word, call: r.call ?? null, carries: r.carries };
  return null;
}

/**
 * Short codes first (G4.1.3 step 2): resolve against the current week's tables; a code reused from an
 * earlier week resolves to the current meaning, and older meanings are returned greyed.
 */
export function lookupCode(tables: readonly CodeTable[], currentWeek: number, q: string): CodeLookup {
  const cur = tables.filter((t) => t.week === currentWeek);
  let hit: CodeHit | null = null;
  for (const t of cur) { hit = findIn(t, q); if (hit) break; }
  const older = tables.filter((t) => t.week < currentWeek).sort((a, b) => b.week - a.week).map((t) => ({ week: t.week, hit: findIn(t, q) })).filter((x): x is { week: number; hit: CodeHit } => !!x.hit);
  return { hit, older };
}

/** Pre-snap time after an indicator word (G4.4.2 kind c). */
export function indicatorPresnapSeconds(): number { return param('codes.indicatorPresnapS'); }

// ---------------------------------------------------------------- signals (G4.4.3)

export interface SignalExposure {
  /** Times the call was shown live in view this game. */
  readonly n: number;
  /** Opponent decoding effort 0 to 2 (K6 staff assigned). */
  readonly effort: number;
  /** Different signs for the call, 1 to 3. */
  readonly signs: number;
  /** Dummy signalers, counted up to 3. */
  readonly dummies: number;
  /** Signaler covered with sheets or towels (press box view only). */
  readonly covered?: boolean;
  /** Post-game television decoding before the next meeting (adds a share of n). */
  readonly tv?: boolean;
}

/** Per-exposure decode chance q = 0.04 x E x (1/k) x (1 - 0.15 d) (G4.4.3). */
export function decodeQ(e: Pick<SignalExposure, 'effort' | 'signs' | 'dummies'>): number {
  const E = Math.min(param('signals.effortMax'), Math.max(0, e.effort));
  const k = Math.min(param('signals.signsMax'), Math.max(1, Math.round(e.signs)));
  const d = Math.min(param('signals.dummyCap'), Math.max(0, Math.round(e.dummies)));
  return Math.max(0, param('signals.decodeBase') * E * (1 / k) * (1 - param('signals.dummyFactor') * d));
}

/** Chance the call is decoded: 1 - (1 - q)^n, n zero when never shown in a game (G4.4.3). */
export function decodeChance(e: SignalExposure): number {
  let n = e.n;
  if (n <= 0) return possible(0);
  if (e.covered) n = n * (1 - param('signals.coverReduction'));
  if (e.tv) n = n * (1 + param('signals.tvShare'));
  const q = decodeQ(e);
  const keep = Number.isInteger(n) ? powInt(1 - q, n) : powReal(1 - q, n);
  return possible(1 - keep);
}

/** Value K3 gets from a call: full when decoded, a timing leak when only its signalling moment is known. */
export function leakValue(decoded: boolean, timingKnown: boolean): number {
  return decoded ? 1 : timingKnown ? param('signals.timingLeakShare') : 0;
}

/** Re-teaching cost of a signal change: units per reader (G4.4.3; readers from roster size keys). */
export function signalChangeUnits(changedSignals: number, readers: number): number {
  return changedSignals * readers * param('signals.teachUnits');
}

/**
 * Pro-rule-set equipment equity (G4.4.3): on a total coach-to-player failure on one side, the other side's
 * equipment is taken until the failed system is restored. Temporary dropouts do not count. The rule set
 * says whether the equity rule applies (key comm.c2p_equity_on_failure).
 */
export function radioState(equityRule: boolean, failure: { readonly side: 'home' | 'away'; readonly total: boolean; readonly restored: boolean } | null): { readonly home: boolean; readonly away: boolean } {
  if (!failure || !failure.total || failure.restored) return { home: true, away: true };
  const failed = { home: failure.side !== 'home', away: failure.side !== 'away' };
  if (!equityRule) return failed;
  return { home: false, away: false };
}

// ---------------------------------------------------------------- dummy calls (G4.4.4)

/** Defense's confidence that word w means adjustment a after k paired observations: 1 - 0.7^(k(1 - r)). */
export function dummyConfidence(k: number, dummyRate: number): number {
  const kEff = Math.max(0, k) * (1 - Math.min(1, Math.max(0, dummyRate)));
  return 1 - powReal(param('dummy.learnBase'), kEff);
}

/** Whether the defense acts on the read (confidence above its threshold; K4 profiles shift it). */
export function defenseActs(k: number, dummyRate: number, thresholdShift = 0): boolean {
  return dummyConfidence(k, dummyRate) > param('dummy.actConfidence') + thresholdShift;
}

/** Exposures the defense needs to reach the act threshold. */
export function exposuresToAct(dummyRate: number, thresholdShift = 0): number {
  for (let k = 1; k < 10000; k++) if (defenseActs(k, dummyRate, thresholdShift)) return k;
  return Infinity;
}

/** Chance one of the offense's own players takes a dummy as live: 2% x (1 - label knowledge). */
export function dummyOwnMistake(labelKnowledge: number): number {
  return param('dummy.ownMistake') * (1 - Math.min(1, Math.max(0, labelKnowledge)));
}

export type LiveWordRule = 'after_indicator' | 'first_after_number' | 'after_kill';
export interface DummySettings { readonly rate: number; readonly liveRule: LiveWordRule }
export function defaultDummies(): DummySettings { return { rate: param('dummy.defaultRate'), liveRule: 'after_indicator' }; }

/** Hurry-up drops dummies automatically (G4.4.4 edge case). Returns the rate in force and its time cost per dummy. */
export function dummyInForce(s: DummySettings, hurryUp: boolean): { readonly rate: number; readonly costS: number } {
  return hurryUp ? { rate: 0, costS: 0 } : { rate: s.rate, costS: param('dummy.costS') };
}
