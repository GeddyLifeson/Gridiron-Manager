// The head coach card (G7.5.3). The charts are the staff analyst's: the fourth-down and two-point grids
// come from the decision chart the models package builds (N2.4.1, models/strength chart.ts) with the
// inputs the staff believes, passed in here as cells. This module assembles the blocks, logs every edit,
// marks values stale when conditions change, and does the kneel-down arithmetic and the field goal line
// as the staff's numbers (the engine's clock and kick physics decide what really happens).
import type { RuleSet } from '@gm/schema';
import { param } from './params.ts';

export type FourthCall = 'go' | 'field_goal' | 'punt';
export interface FourthCell { readonly distanceYd: number; readonly yardsToGoalYd: number; readonly call: FourthCall; readonly trace: string }
export interface TwoPointRow { readonly scoreDiff: number; readonly goForTwo: boolean; readonly trace: string }
export interface CardEdit { readonly block: string; readonly cell: string; readonly from: string; readonly to: string; readonly at: number }

export interface HeadCoachCard {
  readonly fourth: readonly FourthCell[];
  readonly twoPoint: readonly TwoPointRow[];
  readonly timeoutRules: readonly string[];
  /** The in-bounds play time the staff believes (a starting value from the engine's clock data). */
  readonly inBoundsPlayS: number;
  readonly kneel: readonly KneelRow[];
  /** Field goal line in each direction, as yards to goal (null when no kick reaches the make line). */
  readonly fieldGoalLine: { readonly withWind: number | null; readonly intoWind: number | null };
  readonly crewTendencies: readonly string[];
  readonly trickHistory: readonly string[];
  readonly depthCard: readonly string[];
  readonly standingInstructions: readonly string[];
  readonly edits: readonly CardEdit[];
  /** Blocks whose inputs changed since the staff built them (wind shift, kicker hurt). */
  readonly stale: readonly string[];
}

export interface KneelRow { readonly opponentTimeouts: number; readonly kneels: number; readonly secondsKilled: number }

/**
 * Kneel-down arithmetic: each kneel takes the staff's believed snap time, and before each kneel the play
 * clock runs down unless the opponent stops it with a timeout (snapping a second before it expires).
 */
export function kneelSeconds(kneels: number, opponentTimeouts: number, playClockS: number, kneelPlayS = param('card.kneelPlayS'), marginS = param('card.snapMarginS')): number {
  const runoffs = Math.max(0, kneels - opponentTimeouts);
  return kneels * kneelPlayS + runoffs * Math.max(0, playClockS - marginS);
}

export function kneelTable(rules: Pick<RuleSet, 'num'>, downsLeft = 3): KneelRow[] {
  const pc = rules.num('clock.play_clock_s');
  const tos = rules.num('timeout.per_half');
  const rows: KneelRow[] = [];
  for (let t = 0; t <= tos; t++) rows.push({ opponentTimeouts: t, kneels: downsLeft, secondsKilled: kneelSeconds(downsLeft, t, pc) });
  return rows;
}

/** Field goal line: the longest kick (most yards to goal) whose staff make chance reaches the line. */
export function fieldGoalLine(makeChance: (yardsToGoal: number) => number, maxYardsToGoal = 50): number | null {
  let best: number | null = null;
  for (let y = 1; y <= maxYardsToGoal; y++) if (makeChance(y) >= param('card.fieldGoalLineMake')) best = y;
  return best;
}

/** Edit a fourth-down cell: the change is logged and the cell flagged as edited (compared later with the real decision, N3). */
export function editFourth(card: HeadCoachCard, distanceYd: number, yardsToGoalYd: number, call: FourthCall, at: number): HeadCoachCard {
  const cell = `${distanceYd}@${yardsToGoalYd}`;
  const old = card.fourth.find((c) => c.distanceYd === distanceYd && c.yardsToGoalYd === yardsToGoalYd);
  if (!old || old.call === call) return card;
  return {
    ...card,
    fourth: card.fourth.map((c) => (c === old ? { ...c, call } : c)),
    edits: [...card.edits, { block: 'fourth', cell, from: old.call, to: call, at }],
  };
}

export function editTwoPoint(card: HeadCoachCard, scoreDiff: number, goForTwo: boolean, at: number): HeadCoachCard {
  const old = card.twoPoint.find((r) => r.scoreDiff === scoreDiff);
  if (!old || old.goForTwo === goForTwo) return card;
  return {
    ...card,
    twoPoint: card.twoPoint.map((r) => (r === old ? { ...r, goForTwo } : r)),
    edits: [...card.edits, { block: 'two_point', cell: String(scoreDiff), from: String(old.goForTwo), to: String(goForTwo), at }],
  };
}

export function isEdited(card: HeadCoachCard, block: string, cell: string): boolean {
  return card.edits.some((e) => e.block === block && e.cell === cell);
}

/** Mark blocks stale when their inputs change; the staff clears them after a delay set by staff skill (K6). */
export function markStale(card: HeadCoachCard, blocks: readonly string[]): HeadCoachCard {
  return { ...card, stale: [...new Set([...card.stale, ...blocks])] };
}
export function refreshed(card: HeadCoachCard, block: string): HeadCoachCard {
  return { ...card, stale: card.stale.filter((b) => b !== block) };
}

/** Seconds of the head coach's own attention to read a cell: none with a game-management assistant speaking it. */
export function readCost(hasAssistant: boolean): number { return hasAssistant ? 0 : param('card.readS'); }
