// What the sheet does during the game: must-calls and touch targets (G7.5.1), pinned notes (G7.5.2), the
// defensive stress highlight (G7.7.1) and marks (G7.9.3). Reminders and highlights never force or change a
// call. Automatic marks record facts only; judgments are the user's marks, each a key press while the play
// clock runs (O5.4.1).
import { param } from './params.ts';
import { callKey, type MustCall, type PinnedNote, type Sheet, type TouchTarget } from './sheet.ts';

/** One call record as the console logs it (I2.7.1). */
export interface CallLogLine {
  readonly callKey: string;
  readonly quarter: number;
  readonly yards: number;
  /** Ball carrier or intended target (touches count only these, G7.5.1). */
  readonly touchedBy: string | null;
  /** The look the booth reported, once it does (I7). */
  readonly shownLook: string | null;
}

export type Brightness = 'normal' | 'bright' | 'brightest';
export interface MustCallState { readonly id: string; readonly done: number; readonly outstanding: boolean; readonly missed: boolean; readonly dismissed: boolean; readonly brightness: Brightness }

/** Alert brightness: from the start of the second quarter, and again inside the last 8 minutes of the fourth. */
export function brightness(quarter: number, quarterSecondsLeft: number): Brightness {
  if (quarter >= 4 && quarterSecondsLeft <= param('must.lateFourthS')) return 'brightest';
  return quarter >= 2 ? 'bright' : 'normal';
}

/** Must-call state from the call log. A "by halftime" target is missed once the half ends uncalled. Dismissed = logged as dismissed, not missed. */
export function mustCallStates(calls: readonly MustCall[], log: readonly CallLogLine[], quarter: number, quarterSecondsLeft: number, dismissed: ReadonlySet<string> = new Set()): MustCallState[] {
  return calls.map((m) => {
    const k = callKey(m.call);
    const lines = log.filter((l) => l.callKey === k);
    const isDismissed = dismissed.has(m.id);
    let met: boolean, missed: boolean, done: number;
    if (m.target.kind === 'by_half') { done = lines.filter((l) => l.quarter <= 2).length; met = done >= 1; missed = !met && quarter >= 3; }
    else { done = lines.length; met = done >= m.target.times; missed = false; }
    return { id: m.id, done, outstanding: !met && !missed && !isDismissed, missed: missed && !isDismissed, dismissed: isDismissed, brightness: brightness(quarter, quarterSecondsLeft) };
  });
}

export interface TouchState { readonly playerId: string; readonly touches: number; readonly min: number; readonly outstanding: boolean; readonly cleared: string | null }

/** Touch targets: count carries and intended targets; a player inactive at kickoff or injured in the game clears with a log line. */
export function touchStates(targets: readonly TouchTarget[], log: readonly CallLogLine[], inactive: ReadonlySet<string>, injured: ReadonlySet<string>): TouchState[] {
  return targets.map((t) => {
    const touches = log.filter((l) => l.touchedBy === t.playerId).length;
    const cleared = inactive.has(t.playerId) ? `${t.playerId} not active at kickoff: touch target cleared` : injured.has(t.playerId) ? `${t.playerId} injured: touch target cleared` : null;
    return { playerId: t.playerId, touches, min: t.min, outstanding: cleared === null && touches < t.min, cleared };
  });
}

/** Touch promises made to players in the week (L1) join the sheet's targets automatically. */
export function withPromises(sheet: Sheet, promises: readonly { playerId: string; touches: number }[]): Sheet {
  const have = new Set(sheet.touchTargets.map((t) => t.playerId));
  return { ...sheet, touchTargets: [...sheet.touchTargets, ...promises.filter((p) => !have.has(p.playerId)).map((p) => ({ playerId: p.playerId, min: p.touches, promised: true }))] };
}

/** A tendency note's line: rate and sample together, never the rate alone, with the in-game count beside it. */
export function noteLine(n: PinnedNote, liveCount?: { readonly count: number; readonly n: number }): string {
  if (n.kind !== 'tendency' || !n.tendency) return n.text;
  const t = n.tendency;
  const live = liveCount ? ` (today ${liveCount.count} of ${liveCount.n})` : '';
  return `${n.text}: ${t.count} of ${t.n}${live}`;
}

/** G7.7.1: highlight the stress call once the offense's success rate against the set call passes the line, never before 4 snaps. */
export function stressHighlight(successes: number, snapsAgainstSet: number): boolean {
  return snapsAgainstSet >= param('dsheet.stressMinSnaps') && successes / snapsAgainstSet > param('dsheet.stressLine');
}

// ---- G7.9.3 marks ----------------------------------------------------------------------------------------

export type UserMark = { readonly kind: 'cross' } | { readonly kind: 'star' } | { readonly kind: 'note'; readonly text: string };
export interface EntryMarks { readonly tally: number; readonly yards: readonly number[]; readonly looks: readonly string[]; readonly user: readonly UserMark[] }
/** Marks keyed by call key, so a version switch keeps marks on entries the versions share. */
export type SheetMarks = ReadonlyMap<string, EntryMarks>;

const EMPTY: EntryMarks = { tally: 0, yards: [], looks: [], user: [] };

/** Automatic mark after a play: tally, yards, and the look once the booth reports it. */
export function recordCall(m: SheetMarks, line: CallLogLine): Map<string, EntryMarks> {
  const out = new Map(m);
  const e = out.get(line.callKey) ?? EMPTY;
  out.set(line.callKey, { ...e, tally: e.tally + 1, yards: [...e.yards, line.yards], looks: line.shownLook ? [...e.looks, line.shownLook] : e.looks });
  return out;
}

/** A user mark; returns the key presses it cost (one), which the console charges against the running play clock. */
export function addMark(m: SheetMarks, key: string, mark: UserMark): { marks: Map<string, EntryMarks>; keyPresses: number } {
  const out = new Map(m);
  const e = out.get(key) ?? EMPTY;
  out.set(key, { ...e, user: [...e.user, mark] });
  return { marks: out, keyPresses: 1 };
}

/** Marks rebuilt from the whole log: the tally always equals the log count (G7.9.3 acceptance). */
export function marksFromLog(log: readonly CallLogLine[]): Map<string, EntryMarks> {
  return log.reduce<Map<string, EntryMarks>>((m, l) => recordCall(m, l), new Map());
}

export function isCrossed(m: SheetMarks, key: string): boolean {
  return (m.get(key)?.user ?? []).some((u) => u.kind === 'cross');
}
