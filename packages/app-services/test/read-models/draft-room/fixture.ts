// A four-club draft for the draft room tests. Rule values are the league rule file's (packages/rules-data/
// data/league/proleague_2026.json, G-10), copied here with their fact ids since a test may not reach into
// another package's files; draft-room.test.ts checks the copy against the file.
import type { RuleSet } from '@gm/schema';
import { draft } from '@gm/league';
import type { gm } from '@gm/front-office';
import type { scouting } from '@gm/people';
import type { DraftProspect } from '../../../src/read-models/draft-room/index.ts';

export const FILE_VALUES: readonly { key: string; value: number; factId: string }[] = [
  { key: 'league_rules.draft.rounds', value: 7, factId: 'F-league-0045' },
  { key: 'league_rules.draft.clock.r1_min', value: 8, factId: 'F-league-0046' },
  { key: 'league_rules.draft.clock.r2_min', value: 7, factId: 'F-league-0047' },
  { key: 'league_rules.draft.clock.r3_6_min', value: 5, factId: 'F-league-0048' },
  { key: 'league_rules.draft.clock.r7_min', value: 4, factId: 'F-league-0049' },
  { key: 'league_rules.draft.day2_first_round', value: 2, factId: 'F-league-0115' },
  { key: 'league_rules.draft.day3_first_round', value: 4, factId: 'F-league-0116' },
];

export function rules(): RuleSet {
  const v = new Map(FILE_VALUES.map((r) => [r.key, r.value]));
  const get = (k: string) => { if (!v.has(k)) throw new Error(`missing ${k}`); return v.get(k)!; };
  return { id: 'proleague_2026', level: 'pro', seasonYear: 2027, num: get, bool: () => { throw new Error('no bool'); }, opt: () => { throw new Error('no opt'); }, keys: () => [...v.keys()].sort() };
}

export const R = rules();
export const CLUBS = [1, 2, 3, 4];
export const USER = 2;
export const POOL = Array.from({ length: 40 }, (_, i) => 1000 + i);
export const NAMES: Record<string, string> = { 1: 'Ashford', 2: 'Bellport', 3: 'Carver', 4: 'Dunmore' };

export function fresh(userClubId: number | null = USER): draft.DraftState {
  const ledger = draft.createLedger(2027, CLUBS, R);
  const slots = CLUBS.map((teamId, i) => ({ pick: i + 1, teamId, tier: 0 }));
  const order = draft.selectionOrder(slots, new Map(CLUBS.map((c) => [c, c])), ledger, R);
  return draft.openDraft({ ledger, order, pool: POOL, userClubId, startSec: 0 }, R);
}

export const CHART: draft.PickValueChart = { values: Array.from({ length: 28 }, (_, i) => 3000 - i * 100) };

/** A graded cell as G-19 gives it (MA-48): text, grader, looks, date. */
export function graded(personId: number): scouting.GradeCell {
  return {
    state: 'graded', attribute: 'role', text: `6.${personId % 10} (fair look), area scout, graded 12 looks, last updated day 40`, value: 6, label: '6.0',
    confidence: 'fair look', bandText: '5.6 to 6.4', low: '5.6', high: '6.4', cutLow: false, cutHigh: false, n: 12, grader: 'area scout',
    watched: [{ count: 12, what: 'looks' }], source: { kind: 'evidence', units: 12, evaluators: 1 }, as_of: { seasonYear: 2027, dayIndex: 40 } as never,
    legend: null, relative: null,
  } as scouting.GradeCell;
}

export function prospects(): DraftProspect[] {
  return POOL.map((personId, i) => ({
    personId, name: `Prospect ${personId}`, position: i % 3 === 0 ? 'OT' : i % 3 === 1 ? 'CB' : 'WR', school: 'State',
    grade: i % 5 === 4 ? { state: 'unwatched', attribute: 'role', text: 'not watched', source: { kind: 'public' } } : graded(personId),
    potential: i < 3 ? 'potential.starter' : null, consensusRank: i + 1,
  }));
}

/** The club's board: pool order with 1003 moved to the top, a general manager's own view. */
export const BOARD = [1003, ...POOL.filter((p) => p !== 1003)];

export const boardRows = (available: readonly number[]): gm.BoardRow[] =>
  BOARD.filter((p) => available.includes(p)).map((personId, i) => ({ personId, score: 100 - i, value: 100 - i, rank: i + 1 }));

export function power(holder: gm.Holder, delegated: readonly gm.PowerField[] = []): gm.Power {
  return {
    holders: { final_say_roster: holder, final_say_draft: holder, final_say_contracts: holder },
    userIsHeadCoach: true, delegated: new Set(delegated),
  };
}

export const NEEDS: gm.Need[] = [
  { position: 'OT', need: 0.8, gmNeed: 0.7, coachNeed: 1, frame: 'now' },
  { position: 'CB', need: 0.4, gmNeed: 0.4, coachNeed: null, frame: 'this_offseason' },
  { position: 'WR', need: 0.1, gmNeed: 0.1, coachNeed: null, frame: 'next_year' },
];
