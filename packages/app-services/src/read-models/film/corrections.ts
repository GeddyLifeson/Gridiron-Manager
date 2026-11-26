// From film to the correction list (N1.5.1). Items come from the responsibility lines (staff or user)
// and minus grades of one game; each names the concept, the players, the cause and a suggested fix.
// Priority = times the error happened x mean expected points lost on those snaps, plus a weight for
// each repeat of the same error in the previous games. Scheme causes are items for the coach.
import { param } from './params.ts';
import type { CauseType } from './types.ts';
import type { Correction, GradeSheet, Responsibility } from './views.ts';

export type Unit = Correction['unit'];

/** One attributed error on one snap, with what the list needs to know about the play. */
export interface ErrorSnap {
  readonly line: Responsibility;
  readonly unit: Unit;
  readonly concept: string;
  /** Expected points added on the snap; a loss is a negative number. */
  readonly epa: number;
}

/** Times a mental error on one concept must happen in a game before the list suggests a simpler rule. Assumption. */
const SIMPLER_RULE_COUNT = 3;

function fixFor(cause: CauseType, count: number): Correction['fix'] {
  switch (cause) {
    case 'scheme': return 'change_call';
    case 'mental': return count >= SIMPLER_RULE_COUNT ? 'simpler_rule' : 'meeting_cutup';
    case 'communication': case 'alignment': return 'walkthrough';
    case 'physical': case 'technique': return 'individual_drill';
    default: return 'meeting_cutup';
  }
}

const keyOf = (unit: Unit, concept: string, cause: CauseType) => `${unit}|${concept}|${cause}`;

/**
 * Builds the ranked list. `previous` holds the error snaps of the earlier games, newest first; only
 * the configured number of games is read for repeats.
 */
export function buildCorrections(errors: readonly ErrorSnap[], previous: readonly (readonly ErrorSnap[])[] = []): Correction[] {
  const groups = new Map<string, ErrorSnap[]>();
  for (const e of errors) groups.set(keyOf(e.unit, e.concept, e.line.cause), [...(groups.get(keyOf(e.unit, e.concept, e.line.cause)) ?? []), e]);
  const earlier = previous.slice(0, param('correction.repeatGames'));
  const items: Correction[] = [];
  for (const [key, list] of groups) {
    const [unit, concept, cause] = key.split('|') as [Unit, string, CauseType];
    const repeats = earlier.reduce((n, g) => n + g.filter((e) => keyOf(e.unit, e.concept, e.line.cause) === key).length, 0);
    const meanEpLost = list.reduce((a, e) => a + Math.max(0, -e.epa), 0) / list.length;
    const persons = [...new Set(list.map((e) => e.line.personId).filter((p): p is number => p !== null))].sort((a, b) => a - b);
    items.push({
      id: key, unit, concept, personIds: persons, cause, count: list.length, meanEpLost, repeats,
      priority: list.length * meanEpLost + param('correction.repeatBonusEp') * repeats,
      fix: fixFor(cause, list.length), forCoach: cause === 'scheme', state: 'open',
      playIds: list.map((e) => e.line.playId),
    });
  }
  return items.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

/** The default view: the top items per unit, with the rest one click away (N1.5.1). */
export function topPerUnit(items: readonly Correction[]): { shown: Correction[]; more: Correction[] } {
  const n = param('correction.topPerUnit');
  const shown: Correction[] = [], more: Correction[] = [];
  const seen = new Map<Unit, number>();
  for (const it of items) { const k = seen.get(it.unit) ?? 0; (k < n ? shown : more).push(it); seen.set(it.unit, k + 1); }
  return { shown, more };
}

export function setState(items: readonly Correction[], id: string, state: Correction['state']): Correction[] {
  if (!items.some((i) => i.id === id)) throw new Error(`no correction ${id}`);
  return items.map((i) => (i.id === id ? { ...i, state } : i));
}

/** Plays that beat their expectation by the line, for teaching tape (N1.5.1 "what went right"). */
export function wentRight<T extends { playId: string; epa: number | null }>(plays: readonly T[]): string[] {
  return plays.filter((p) => p.epa !== null && p.epa >= param('correction.wentRightEp')).map((p) => p.playId);
}

/** Minus-graded snaps as error snaps the list can rank, when no responsibility line names them. */
export function minusGradeErrors(sheet: GradeSheet, unit: Unit, conceptOf: (playId: string) => string, epaOf: (playId: string) => number, by: string): ErrorSnap[] {
  return sheet.rows.filter((r) => r.technique === 'minus' || r.loaf).map((r) => ({
    line: { playId: r.playId, personId: sheet.personId, cause: r.loaf ? 'effort' : 'technique', by },
    unit, concept: conceptOf(r.playId), epa: epaOf(r.playId),
  }));
}

/** The "This week you need to work on" line of one player's sheet: his accepted items (N1.5.1). */
export function workOnLine(items: readonly Correction[], personId: number): string {
  return items.filter((i) => i.state === 'accepted' && i.personIds.includes(personId)).map((i) => `${i.concept}: ${i.cause} (${i.fix.replace(/_/g, ' ')})`).join('; ');
}
