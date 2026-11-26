// The cuts and measures of the tendency tables (G8.1.1, H2.1.3, N2.3.1). Self-scout and opponent
// scouting use the same definitions, so the user sees what a staff with perfect charting would see.
import { param } from './params.ts';
import type { ChartedPlay, ManZone, Shell } from './types.ts';

export interface CutDef {
  readonly id: string;
  /** Value of the cut for a play; null leaves the play out of any cell of this cut. */
  of(p: ChartedPlay): string | null;
}

export interface MeasureDef {
  readonly id: string;
  /** Two-way choices get the G8.1.1 strong, watch and lean bands; others the multi-outcome strong line. */
  readonly twoWay: boolean;
  readonly side: 'offense' | 'defense';
  /** Outcome for a play; null when the measure does not apply (a pass for a run-direction measure). */
  of(p: ChartedPlay): string | null;
}

/** H2.1.3 situation buckets. Editable edges are params so scouting and the call sheet share boxes (G7). */
export function downDistance(p: Pick<ChartedPlay, 'down' | 'distanceYd'>): string {
  if (p.down >= 4) return '4th';
  const d = p.distanceYd;
  if (p.down === 1) return d === 10 ? '1st_10' : '1st_other';
  const b = d <= param('bucket.shortMaxYd') ? 'short' : d <= param('bucket.mediumMaxYd') ? 'medium' : 'long';
  return `${p.down === 2 ? '2nd' : '3rd'}_${b}`;
}

export function fieldZone(p: Pick<ChartedPlay, 'yardsToGoalYd'>): string {
  const y = p.yardsToGoalYd;
  if (y <= param('zone.goalLineYd')) return 'goal_line';
  if (y <= param('zone.redZoneYd')) return 'red_zone';
  if (y >= param('zone.backedUpYd')) return 'backed_up';
  return 'open_field';
}

export function scoreState(p: Pick<ChartedPlay, 'scoreDiff'>): string {
  const c = param('score.closePoints');
  const d = p.scoreDiff;
  return d < -c ? 'trail_big' : d < 0 ? 'trail' : d === 0 ? 'tied' : d <= c ? 'lead' : 'lead_big';
}

export function timeState(p: Pick<ChartedPlay, 'quarter' | 'clockTenths'>): string {
  const halfEnd = p.quarter === 2 || p.quarter === 4;
  return halfEnd && p.clockTenths <= param('time.lateHalfTenths') ? 'two_minute' : p.quarter > 4 ? 'overtime' : 'normal';
}

const RUN_KINDS = new Set(['run', 'draw', 'qb_run']);
const PASS_KINDS = new Set(['dropback_pass', 'quick_pass', 'play_action', 'movement_pass', 'screen']);

/**
 * Run or pass by the called kind. An RPO and a trick play are neither (null): the charted result of an
 * RPO depends on the read, so it is left to the play-kind measure rather than guessed.
 */
export function runOrPass(kind: string | null): 'run' | 'pass' | null {
  if (kind === null) return null;
  if (RUN_KINDS.has(kind)) return 'run';
  if (PASS_KINDS.has(kind)) return 'pass';
  return null;
}

/** Coverage shell by family (F10): Cover 0 has no deep safety, Cover 1 and 3 one, the rest two. */
export function shellOf(family: string | null): Shell | null {
  switch (family) {
    case 'cover0': return 'zero_high';
    case 'cover1': case 'cover3': return 'one_high';
    case 'cover2': case 'cover4': case 'cover6': case 'two_man': return 'two_high';
    default: return null;
  }
}

/** Man or zone by family (F10). */
export function manZoneOf(family: string | null): ManZone | null {
  switch (family) {
    case 'cover0': case 'cover1': case 'two_man': return 'man';
    case 'cover2': case 'cover3': case 'cover4': case 'cover6': return 'zone';
    default: return null;
  }
}

export function isPressure(rushers: number | null): boolean | null {
  return rushers === null ? null : rushers >= param('chart.pressureRushers');
}

const cut = (id: string, of: (p: ChartedPlay) => string | null): CutDef => ({ id, of });

/** Every cut of G8.1.1 the play record carries. Backfield set waits for a field in the call (CR-G66-3). */
export const CUTS: Readonly<Record<string, CutDef>> = {
  downDistance: cut('downDistance', downDistance),
  down: cut('down', (p) => String(p.down)),
  fieldZone: cut('fieldZone', fieldZone),
  personnel: cut('personnel', (p) => p.personnel),
  formation: cut('formation', (p) => p.formation ?? 'unknown'),
  strength: cut('strength', (p) => p.strength ?? 'none'),
  motion: cut('motion', (p) => p.motion ?? 'none'),
  shotgun: cut('shotgun', (p) => (p.shotgun ? 'shotgun' : 'under_centre')),
  tempo: cut('tempo', (p) => p.tempo),
  hash: cut('hash', (p) => p.hash),
  scoreState: cut('scoreState', scoreState),
  timeState: cut('timeState', timeState),
  quarter: cut('quarter', (p) => (p.quarter > 4 ? 'OT' : String(p.quarter))),
  afterEvent: cut('afterEvent', (p) => p.afterEvent),
  caller: cut('caller', (p) => (p.callerId === null ? 'unknown' : String(p.callerId))),
  front: cut('front', (p) => p.front ?? 'unknown'),
  box: cut('box', (p) => (p.boxCount === null ? null : String(p.boxCount))),
};

const measure = (id: string, side: 'offense' | 'defense', twoWay: boolean, of: (p: ChartedPlay) => string | null): MeasureDef => ({ id, side, twoWay, of });

export const MEASURES: Readonly<Record<string, MeasureDef>> = {
  runPass: measure('runPass', 'offense', true, (p) => runOrPass(p.playKind)),
  playKind: measure('playKind', 'offense', false, (p) => p.playKind),
  runDirection: measure('runDirection', 'offense', false, (p) => (runOrPass(p.playKind) === 'run' ? p.runDirection : null)),
  concept: measure('concept', 'offense', false, (p) => p.concept),
  protection: measure('protection', 'offense', false, (p) => (runOrPass(p.playKind) === 'pass' ? p.protection : null)),
  pressure: measure('pressure', 'defense', true, (p) => { const x = isPressure(p.rushers); return x === null ? null : x ? 'pressure' : 'no_pressure'; }),
  rushers: measure('rushers', 'defense', false, (p) => (p.rushers === null ? null : String(p.rushers))),
  pressureDesign: measure('pressureDesign', 'defense', false, (p) => (isPressure(p.rushers) ? p.pressureDesign : null)),
  coverage: measure('coverage', 'defense', false, (p) => p.coverageFamily),
  shell: measure('shell', 'defense', false, (p) => shellOf(p.coverageFamily)),
  manZone: measure('manZone', 'defense', true, (p) => manZoneOf(p.coverageFamily)),
  front: measure('front', 'defense', false, (p) => p.front),
};

/** A play counts toward call tendencies unless it is a kneel or spike or was cancelled before the snap. */
export function countsForCalls(p: ChartedPlay): boolean {
  return !p.forced && !p.lookOnly;
}
