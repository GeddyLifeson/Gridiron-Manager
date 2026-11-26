// The opening script (G7.4.1) and second-half openers (G7.4.2). The script is an order of suggestion and
// never forces a call (I2.3.4): skipping and returning are one key each, position advances by snap (a
// penalty replay does not use an entry), and an entry whose "only if" fails is skipped.
import type { Call, Playbook } from '../playbook/index.ts';
import { param } from './params.ts';
import type { PlanWarning } from './plan.ts';
import { runPassOf } from './plan.ts';
import type { ScriptEntry } from './sheet.ts';
import { conditionHolds, type SituationState } from './situations.ts';

export interface Variety {
  readonly personnel: Readonly<Record<string, number>>;
  readonly formation: Readonly<Record<string, number>>;
  readonly runPass: Readonly<Record<string, number>>;
  readonly direction: Readonly<Record<string, number>>;
  /** Defensive answers the script would reveal: how they align to each formation and motion shown. */
  readonly reveals: readonly string[];
}

const DIRECTIONS = ['left', 'right'] as const;
function directionOf(c: Call): string {
  const t = c.tags.find((x) => (DIRECTIONS as readonly string[]).includes(x));
  return t ?? 'none';
}

/** G7.4.1 variety counts (acceptance: equal a hand count). Direction comes from a "left"/"right" tag. */
export function scriptVariety(script: readonly ScriptEntry[], book: Playbook): Variety {
  const inc = (o: Record<string, number>, k: string): void => { o[k] = (o[k] ?? 0) + 1; };
  const personnel: Record<string, number> = {}, formation: Record<string, number> = {}, runPass: Record<string, number> = {}, direction: Record<string, number> = {};
  const reveals = new Set<string>();
  for (const e of script) {
    const p = book.plays.get(e.call.playId);
    inc(personnel, p?.parts.personnel ?? 'none');
    inc(formation, p?.parts.formation ?? 'none');
    inc(runPass, runPassOf(p));
    inc(direction, directionOf(e.call));
    if (p?.parts.formation) reveals.add(`alignment to ${p.parts.formation}`);
    if (p?.parts.motion) reveals.add(`reaction to ${p.parts.motion}`);
  }
  return { personnel, formation, runPass, direction, reveals: [...reveals].sort() };
}

export function checkScript(script: readonly ScriptEntry[]): PlanWarning[] {
  const n = script.length, w: PlanWarning[] = [];
  if (n > 0 && n < param('script.warnBelow')) w.push({ leaf: 'G7.4.1', code: 'script.short', subject: 'script', text: `script of ${n} calls (target ${param('script.target')})`, severity: 'note' });
  if (n > param('script.warnAbove')) w.push({ leaf: 'G7.4.1', code: 'script.long', subject: 'script', text: `script of ${n} calls (target ${param('script.target')})`, severity: 'note' });
  const ids = new Set(script.map((e) => e.id));
  for (const e of script) if (e.setsUp && !ids.has(e.setsUp)) w.push({ leaf: 'G7.4.1', code: 'script.link', subject: e.id, text: `${e.id} sets up ${e.setsUp}, which is not on the script`, severity: 'warning' });
  return w;
}

export interface ScriptCursor { readonly index: number; readonly ran: ReadonlySet<string>; readonly skipped: ReadonlySet<string> }
export const START: ScriptCursor = { index: 0, ran: new Set(), skipped: new Set() };

/** The entry the console offers now: the first from the cursor not run, not skipped, whose condition holds. */
export function currentEntry(script: readonly ScriptEntry[], c: ScriptCursor, s: SituationState): ScriptEntry | null {
  for (let i = c.index; i < script.length; i++) {
    const e = script[i]!;
    if (c.ran.has(e.id) || c.skipped.has(e.id)) continue;
    if (e.onlyIf && !e.onlyIf.every((k) => conditionHolds(k, s))) continue;
    return e;
  }
  return null;
}

/** A snap was run with this call. A snap cancelled by a penalty does not count (counted = false). */
export function afterSnap(script: readonly ScriptEntry[], c: ScriptCursor, calledEntryId: string | null, counted: boolean): ScriptCursor {
  if (!counted || calledEntryId === null) return c;
  const i = script.findIndex((e) => e.id === calledEntryId);
  if (i < 0) return c;
  const ran = new Set(c.ran).add(calledEntryId);
  let index = c.index;
  while (index < script.length && (ran.has(script[index]!.id) || c.skipped.has(script[index]!.id))) index++;
  return { index, ran, skipped: c.skipped };
}

export function skip(c: ScriptCursor, entryId: string): ScriptCursor { return { ...c, skipped: new Set(c.skipped).add(entryId) }; }
export function unskip(c: ScriptCursor, entryId: string): ScriptCursor { const s = new Set(c.skipped); s.delete(entryId); return { ...c, skipped: s, index: 0 }; }

/** The "set up" reminder for an entry shows once the entry that sets it up has run. */
export function setUpReady(script: readonly ScriptEntry[], c: ScriptCursor, entryId: string): boolean {
  return script.some((e) => e.setsUp === entryId && c.ran.has(e.id));
}

// ---- G7.4.2 second-half openers --------------------------------------------------------------------------

/** The second script is active only after halftime, for the first offensive series of the half whenever it comes. */
export function secondScriptActive(quarter: number, ownSeriesThisHalf: number): boolean {
  return quarter >= 3 && ownSeriesThisHalf <= 1;
}

export interface HalftimeCandidate { readonly call: Call; readonly why: 'starred' | 'positive_result' | 'no_answer' | 'set_up_ready'; readonly source: string }
export interface FirstHalfMark { readonly call: Call; readonly starred: boolean; readonly yards: readonly number[]; readonly noAnswerNote: boolean; readonly ref: string }

/** Candidates the halftime screen offers, each traced to a first-half mark, result or link (G7.4.2 acceptance). */
export function halftimeCandidates(marks: readonly FirstHalfMark[], readySetUps: readonly { call: Call; ref: string }[]): HalftimeCandidate[] {
  const out: HalftimeCandidate[] = [];
  for (const m of marks) {
    if (m.starred) out.push({ call: m.call, why: 'starred', source: m.ref });
    else if (m.noAnswerNote) out.push({ call: m.call, why: 'no_answer', source: m.ref });
    else if (m.yards.length > 0 && m.yards.reduce((a, b) => a + b, 0) / m.yards.length > 0) out.push({ call: m.call, why: 'positive_result', source: m.ref });
  }
  for (const s of readySetUps) out.push({ call: s.call, why: 'set_up_ready', source: s.ref });
  return out;
}

/** Halftime seconds the openers cost (I8 sets the per-entry cost). */
export function halftimeCost(entries: number, secondsPerEntry: number): number { return entries * secondsPerEntry; }
export function secondHalfLengthNote(n: number): PlanWarning | null {
  return n > param('script.secondHalfMax') ? { leaf: 'G7.4.2', code: 'script.second_half_long', subject: 'second_half', text: `${n} openers (3 to 5 usual)`, severity: 'note' } : null;
}
