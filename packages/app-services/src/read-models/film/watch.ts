// Time on screen for film (I9.2) and watching without calling (I9.4). Speeds by context: real time and
// double in games, the one sideline replay at real speed, and quarter to double speed in film review
// (N1.1.1). Stop rules halt a skip or a summarised drive before the snap; events after a play
// (turnover, score, injury to a starter) halt it after the play.
import { param } from './params.ts';
import type { FieldZone } from './library.ts';
import { fieldZone } from './library.ts';

export const SPEEDS_BY_CONTEXT = {
  game: [1, 2],
  sidelineReplay: [1],
  film: [0.25, 0.5, 1, 2],
} as const;

export type WatchMode = 'watch' | 'double' | 'summary';

/** The situation strip a stop rule reads (I9.4.1). */
export interface StripSituation {
  readonly down: number | null;
  readonly distanceYd: number | null;
  /** Yards from the user's offense's own goal line when he has the ball; from the opponent's when he defends. */
  readonly yardLine: number;
  readonly userHasBall: boolean;
  readonly scoreMargin: number;
  readonly period: number;
  readonly clockTenths: number;
  readonly personnel: string | null;
  readonly formationFamily: string | null;
  /** True once the two-minute warning (or the level's equivalent) has passed in this half. */
  readonly afterTwoMinute: boolean;
}

export interface PlayAfter { readonly turnover: boolean; readonly score: boolean; readonly starterInjured: boolean }

export type StopRule =
  | { readonly kind: 'down'; readonly downs: readonly number[] }
  | { readonly kind: 'zone'; readonly zones: readonly FieldZone[]; readonly side: 'own' | 'opponent' | 'either' }
  | { readonly kind: 'personnel'; readonly codes: readonly string[] }
  | { readonly kind: 'formation'; readonly families: readonly string[] }
  | { readonly kind: 'lateOneScore'; readonly maxMargin: number }
  | { readonly kind: 'twoMinute' }
  | { readonly kind: 'turnover' } | { readonly kind: 'score' } | { readonly kind: 'starterInjury' };

const FIELD_YD = 100;

/** The default stop rules of I9.4.1. The user edits them in the week. */
export function defaultStopRules(): StopRule[] {
  return [
    { kind: 'down', downs: [3, 4] },
    { kind: 'zone', zones: ['red_zone', 'goal_line'], side: 'either' },
    { kind: 'turnover' }, { kind: 'score' }, { kind: 'starterInjury' },
    { kind: 'twoMinute' },
    { kind: 'lateOneScore', maxMargin: param('watch.oneScoreMargin') },
  ];
}

export function checkRuleCount(rules: readonly StopRule[]): void {
  if (rules.length > param('watch.maxStopRules')) throw new Error(`at most ${param('watch.maxStopRules')} stop rules per game (I9.4.1)`);
}

/** True when a skip must halt before this snap. */
export function stopBeforeSnap(rules: readonly StopRule[], s: StripSituation): boolean {
  checkRuleCount(rules);
  return rules.some((r) => {
    switch (r.kind) {
      case 'down': return s.down !== null && r.downs.includes(s.down);
      case 'zone': {
        const inside = param('watch.insideYd');
        const inOpp = s.yardLine >= FIELD_YD - inside, inOwn = s.yardLine <= inside;
        const z = fieldZone(s.yardLine);
        const zoneHit = r.zones.includes(z) || (r.zones.includes('red_zone') && (inOpp || inOwn));
        const sideOk = r.side === 'either' || (r.side === 'opponent' ? inOpp : inOwn);
        return zoneHit && sideOk;
      }
      case 'personnel': return s.personnel !== null && r.codes.includes(s.personnel);
      case 'formation': return s.formationFamily !== null && r.families.includes(s.formationFamily);
      case 'twoMinute': return s.afterTwoMinute;
      case 'lateOneScore': return s.afterTwoMinute && Math.abs(s.scoreMargin) <= r.maxMargin;
      default: return false;
    }
  });
}

/** True when a skip must halt after a play for what happened on it. */
export function stopAfterPlay(rules: readonly StopRule[], a: PlayAfter): boolean {
  return rules.some((r) => (r.kind === 'turnover' && a.turnover) || (r.kind === 'score' && a.score) || (r.kind === 'starterInjury' && a.starterInjured));
}

export interface SummaryPlay { readonly down: number | null; readonly distanceYd: number | null; readonly publicResult: string; readonly flag: boolean }

/** One line per play: down and distance, the public result and any flag (I9.4.1 drive summary). */
export function driveSummary(plays: readonly SummaryPlay[]): string[] {
  return plays.map((p) => `${p.down === null ? '-' : `${ordinal(p.down)} and ${p.distanceYd === null ? '?' : Math.round(p.distanceYd)}`}: ${p.publicResult}${p.flag ? ' (flag)' : ''}`);
}

const ORD = ['', '1st', '2nd', '3rd', '4th'];
const ordinal = (d: number) => ORD[d] ?? `${d}th`;
