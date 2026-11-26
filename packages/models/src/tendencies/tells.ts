// Tells (G8.3.1 structural tells, G8.3.2 player tells).
import { possible, type RandomStream } from '@gm/schema';
import { param } from './params.ts';
import { countsForCalls, isPressure, manZoneOf, runOrPass } from './cuts.ts';
import { wilson } from './stats.ts';
import type { ChartedPlay } from './types.ts';

// ---- G8.3.1 structural tells ----

export interface AlignmentFeature {
  readonly id: string;
  readonly side: 'offense' | 'defense';
  of(p: ChartedPlay): string | null;
}

const f = (id: string, side: 'offense' | 'defense', of: (p: ChartedPlay) => string | null): AlignmentFeature => ({ id, side, of });

/** Alignment features the play record carries. Splits and back depth wait for the play objects (CR-G66-3). */
export const ALIGNMENT_FEATURES: readonly AlignmentFeature[] = [
  f('formation', 'offense', (p) => p.formation),
  f('personnel', 'offense', (p) => p.personnel),
  f('motion', 'offense', (p) => p.motion),
  f('strength', 'offense', (p) => p.strength),
  f('formation+personnel', 'offense', (p) => (p.formation === null ? null : `${p.formation}/${p.personnel}`)),
  f('formation+motion', 'offense', (p) => (p.formation === null || p.motion === null ? null : `${p.formation}/${p.motion}`)),
  f('shotgun', 'offense', (p) => (p.shotgun ? 'shotgun' : 'under_centre')),
  f('front', 'defense', (p) => p.front),
  f('box', 'defense', (p) => (p.boxCount === null ? null : String(p.boxCount))),
  f('front+box', 'defense', (p) => (p.front === null || p.boxCount === null ? null : `${p.front}/${p.boxCount}`)),
];

/** What a tell gives away: run or pass for offense; pressure, or man or zone, for defense. */
export const TELL_KINDS: Readonly<Record<'offense' | 'defense', readonly { id: string; of: (p: ChartedPlay) => string | null }[]>> = {
  offense: [{ id: 'runPass', of: (p) => runOrPass(p.playKind) }],
  defense: [
    { id: 'pressure', of: (p) => { const x = isPressure(p.rushers); return x === null ? null : x ? 'pressure' : 'no_pressure'; } },
    { id: 'manZone', of: (p) => manZoneOf(p.coverageFamily) },
  ],
};

export interface StructuralTell {
  readonly feature: string;
  readonly value: string;
  readonly kind: string;
  readonly givesAway: string;
  readonly count: number;
  readonly snaps: number;
  readonly rate: number;
  readonly refs: readonly string[];
  /** Marked as bait for a constraint play (G8.3.1 edge case). */
  readonly kept: boolean;
  /** For a kept tell: calls of the other kind from the same look, so the user sees whether the bait was used. */
  readonly baitCalls: number;
}

/**
 * Scans every alignment feature against play kind and reports a feature value whose range lies wholly
 * above the line (85%) on at least 8 snaps (G8.3.1). The range is the same one the bands use.
 */
export function structuralTells(plays: readonly ChartedPlay[], side: 'offense' | 'defense', kept: ReadonlySet<string> = new Set()): StructuralTell[] {
  const out: StructuralTell[] = [];
  const rows = plays.filter((p) => p.side === side && countsForCalls(p));
  for (const feat of ALIGNMENT_FEATURES.filter((x) => x.side === side)) {
    for (const kind of TELL_KINDS[side]) {
      const groups = new Map<string, { by: Map<string, string[]>; n: number }>();
      for (const p of rows) {
        const v = feat.of(p); const k = kind.of(p);
        if (v === null || k === null) continue;
        let g = groups.get(v);
        if (!g) { g = { by: new Map(), n: 0 }; groups.set(v, g); }
        g.n++;
        const list = g.by.get(k) ?? []; list.push(p.ref); g.by.set(k, list);
      }
      for (const v of [...groups.keys()].sort()) {
        const g = groups.get(v)!;
        if (g.n < param('tell.minSnaps')) continue;
        for (const k of [...g.by.keys()].sort()) {
          const refs = g.by.get(k)!;
          const rate = refs.length / g.n;
          if (wilson(rate, g.n, param('band.rangeZ')).low < param('tell.rate')) continue;
          const id = `${feat.id}=${v}:${kind.id}`;
          out.push({ feature: feat.id, value: v, kind: kind.id, givesAway: k, count: refs.length, snaps: g.n, rate, refs, kept: kept.has(id), baitCalls: g.n - refs.length });
        }
      }
    }
  }
  return out.sort((a, b) => b.rate - a.rate || b.snaps - a.snaps || (a.feature + a.value < b.feature + b.value ? -1 : 1));
}

/** Id a tell is marked "kept" by. */
export const tellId = (t: Pick<StructuralTell, 'feature' | 'value' | 'kind'>): string => `${t.feature}=${t.value}:${t.kind}`;

export interface SheetCall { readonly playId: string; readonly formation: string | null; readonly personnel: string; readonly kind: string }

/** G8.3.1: before a game, a formation whose calls on this week's sheet are all one kind, even with no history. */
export function sheetTells(sheet: readonly SheetCall[]): { formation: string; kind: 'run' | 'pass'; calls: number; playIds: string[] }[] {
  const by = new Map<string, SheetCall[]>();
  for (const c of sheet) if (c.formation !== null) by.set(c.formation, [...(by.get(c.formation) ?? []), c]);
  const out: { formation: string; kind: 'run' | 'pass'; calls: number; playIds: string[] }[] = [];
  for (const fm of [...by.keys()].sort()) {
    const calls = by.get(fm)!;
    if (calls.length < param('sheet.minCalls')) continue;
    const kinds = new Set(calls.map((c) => runOrPass(c.kind)));
    if (kinds.size === 1) {
      const k = [...kinds][0];
      if (k) out.push({ formation: fm, kind: k, calls: calls.length, playIds: calls.map((c) => c.playId) });
    }
  }
  return out;
}

// ---- G8.3.2 player tells ----

export interface Habit {
  readonly habitId: string;
  readonly playerId: number;
  /** Hidden flag (D13); true habits exist, false ones are reports with no habit behind them. */
  readonly present: boolean;
}

function clampSkill(s: number): number { return Math.min(param('habit.skillMax'), Math.max(param('habit.skillMin'), s)); }

/** G8.3.2: weekly chance a position coach finds a given habit: 0.10 x skill factor x film ratio, capped at 0.5. */
export function habitFindChance(skillFactor: number, filmRatio: number): number {
  return possible(Math.min(param('habit.findCap'), param('habit.findBase') * clampSkill(skillFactor) * Math.max(0, filmRatio)));
}

/** G8.3.2: chance of a false report, 0.05 / skill factor. */
export function falseReportChance(skillFactor: number): number {
  return param('habit.falseBase') / clampSkill(skillFactor);
}

export interface HabitReport { readonly playerId: number; readonly habitId: string | null; readonly falseReport: boolean }

/**
 * One week of a position coach's search over his group. Draw order: for each unfound true habit in the
 * given order one draw; then one draw for a false report. `false` reports carry no habit id.
 */
export function weeklyHabitSearch(habits: readonly Habit[], found: ReadonlySet<string>, skillFactor: number, filmRatio: (playerId: number) => number, rng: RandomStream): HabitReport[] {
  const out: HabitReport[] = [];
  for (const h of habits) {
    if (!h.present || found.has(h.habitId)) continue;
    if (rng.uniform() < habitFindChance(skillFactor, filmRatio(h.playerId))) out.push({ playerId: h.playerId, habitId: h.habitId, falseReport: false });
  }
  const players = [...new Set(habits.map((h) => h.playerId))].sort((a, b) => a - b);
  if (players.length && rng.uniform() < falseReportChance(skillFactor)) out.push({ playerId: players[rng.int(0, players.length - 1)]!, habitId: null, falseReport: true });
  return out;
}

export interface FixState {
  /** Weeks with the full fixing dose done. */
  readonly weeksFixed: number;
  readonly cleared: boolean;
  /** Weeks since the habit cleared; relapse risk ends after the G8.3.2 six weeks. */
  readonly weeksSinceCleared: number;
}

export const NEW_FIX: FixState = { weeksFixed: 0, cleared: false, weeksSinceCleared: 0 };

/** Minutes a week the G8.3.2 fixing dose takes (two 10-minute individual periods). */
export function fixMinutesPerWeek(): number { return param('habit.fixPeriodsPerWeek') * param('habit.fixPeriodMinutes'); }

/** Advances one week. A week counts only with the full dose; clearing takes 3 such weeks. */
export function advanceFix(s: FixState, minutesThisWeek: number): FixState {
  if (s.cleared) return { ...s, weeksSinceCleared: s.weeksSinceCleared + 1 };
  const weeks = minutesThisWeek >= fixMinutesPerWeek() ? s.weeksFixed + 1 : s.weeksFixed;
  return weeks >= param('habit.fixWeeks') ? { weeksFixed: weeks, cleared: true, weeksSinceCleared: 0 } : { ...s, weeksFixed: weeks };
}

/** Whether a cleared habit shows on this snap. One draw only when the relapse window applies. */
export function habitShows(s: FixState, fatigue: number, rng: RandomStream): boolean {
  if (!s.cleared) return true;
  if (s.weeksSinceCleared >= param('habit.relapseWeeks') || fatigue <= param('habit.relapseFatigue')) return false;
  return rng.uniform() < param('habit.relapseChance');
}

/** G8.3.2: an opponent who studied the player gets the perception edge after seeing the habit on 10 snaps of film. */
export function opponentHasEdge(filmSnapsShowingHabit: number): boolean {
  return filmSnapsShowingHabit >= param('habit.filmSnapsForEdge');
}
