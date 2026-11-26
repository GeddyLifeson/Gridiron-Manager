// G-52 acceptance part 2: the coaching tree (E5.4.1, E5.4.2, S11.2.1).
import { describe, expect, it } from 'vitest';
import type { JobHistoryRow, PersonOrigin } from '@gm/schema';
import {
  EVENT, REPUTATION_EVENT_TYPES, buildEdges, hiredUpDraft, mentorsOf, replay, reverseHiringTerms, standing, stintFromHistory, treeFamiliarity, treeOf, type Stint,
} from '../../src/reputation/index.ts';
import { ctx } from './fixtures.ts';

const st = (personId: number, teamId: number, rung: number, side: Stint['side'], years: number[], extra: Partial<Stint> = {}): Stint => ({
  personId, teamId, competitionId: 2, rung, side, fullSeasonYears: years, wins: 0, losses: 0, ties: 0, source: 'sim', ...extra,
});
const generated = { originOf: (): PersonOrigin => 'generated' };

// Head coach 1 on team 10, 2030-2033. Coordinator 2 (offense) under him. Position coach 3 (offense), 4 (defense).
const BASE: Stint[] = [
  st(1, 10, 9, 'whole_team', [2030, 2031, 2032, 2033]),
  st(2, 10, 7, 'offense', [2030, 2031]),
  st(3, 10, 5, 'offense', [2030, 2031, 2032]),
  st(4, 10, 5, 'defense', [2031]),
];

describe('E5.4.1 the tree object', () => {
  it('makes edges for a full season under the head coach or a same-side coordinator', () => {
    const edges = buildEdges(BASE, generated);
    const pairs = edges.map((e) => `${e.mentorId}>${e.pupilId}`);
    expect(pairs).toEqual(['1>2', '1>3', '1>4', '2>3']);
    expect(pairs).not.toContain('2>4');
  });

  it('a half season (no full season) makes no edge', () => {
    const edges = buildEdges([...BASE, st(5, 10, 3, 'offense', [])], generated);
    expect(edges.some((e) => e.pupilId === 5)).toBe(false);
  });

  it('separate spells count once with seasons summed', () => {
    const edges = buildEdges([st(1, 10, 9, 'whole_team', [2030, 2031, 2035]), st(6, 10, 4, 'defense', [2030]), st(6, 10, 5, 'defense', [2035])], generated);
    const e = edges.find((x) => x.pupilId === 6)!;
    expect(e.seasons).toBe(2);
    expect(e.pupilRung).toBe(5);
  });

  it('a pupil counts only after a full season at a higher rung elsewhere', () => {
    const hired = [...BASE, st(2, 20, 9, 'whole_team', [], { wins: 0 })];
    expect(treeOf(1, hired, generated).counts.headCoaches).toBe(0);
    const season = [...BASE, st(2, 20, 9, 'whole_team', [2032], { wins: 4, losses: 8 })];
    const t = treeOf(1, season, generated);
    expect(t.counts.headCoaches).toBe(1);
    expect(t.counts.headCoachWins).toBe(4);
    expect(t.counts.headCoachLosses).toBe(8);
  });

  it('rebuilding all trees from the same records reproduces the edges', () => {
    expect(buildEdges([...BASE].reverse(), generated)).toEqual(buildEdges(BASE, generated));
  });

  it('no edge for an imported person comes from generated history before the save', () => {
    const origin = { originOf: (id: number): PersonOrigin => (id === 3 ? 'imported' : 'generated') };
    const rows = BASE.map((s) => ({ ...s, source: 'history_run' as const }));
    expect(buildEdges(rows, origin).some((e) => e.pupilId === 3 || e.mentorId === 3)).toBe(false);
    expect(buildEdges(rows, origin).some((e) => e.pupilId === 2)).toBe(true);
  });

  it('lists generation 2 and counts deeper generations', () => {
    const rows = [...BASE,
      st(2, 20, 9, 'whole_team', [2033, 2034]), st(7, 20, 5, 'offense', [2033]),
      st(7, 30, 9, 'whole_team', [2035]), st(8, 30, 4, 'defense', [2035])];
    const t = treeOf(1, rows, generated);
    expect(t.generation2).toEqual([7]);
    expect(t.deeperCount).toBe(1);
    expect(t.mentors).toEqual([]);
    expect(treeOf(2, rows, generated).mentors.map((e) => e.mentorId)).toEqual([1]);
  });

  it('adapts a contract history row', () => {
    const row: JobHistoryRow = { personId: 3, jobId: 1, teamId: 10, catalogueId: 'job:pro.position_coach.qb', started: { seasonYear: 2030, dayIndex: 0 }, ended: null, seasons: 1, wins: 0, losses: 0, ties: 0, exitReason: 'current', exitEventId: null };
    expect(stintFromHistory(row, { rung: 5, side: 'offense', competitionId: 2, fullSeasonYears: [2030], source: 'sim' }).rung).toBe(5);
  });
});

describe('E5.4.2 and S11.2.1 what the tree does', () => {
  const rows = [...BASE, st(2, 20, 9, 'whole_team', [2032]), st(3, 30, 9, 'whole_team', [2034])];
  const t = treeOf(1, rows, generated);

  it('familiarity +3 per prior hire from the tree, capped at +9', () => {
    expect(treeFamiliarity(t, [2])).toBe(3);
    expect(treeFamiliarity(t, [2, 3])).toBe(6);
    expect(treeFamiliarity(t, [99])).toBe(0);
  });

  it('two members who are head coaches both show the reverse hiring term; a fired member shows zero', () => {
    const terms = reverseHiringTerms(t, (id) => id === 2 || id === 3, (id) => id === 3, () => false);
    expect(terms.find((x) => x.memberId === 2)!.term).toBe(0.08);
    expect(terms.find((x) => x.memberId === 3)!.term).toBe(0);
    const recovered = reverseHiringTerms(t, (id) => id === 3, () => true, () => true);
    expect(recovered[0]!.term).toBe(0.15);
  });

  it('a hire up makes one public event that is both the news item and the +2 (+1 supported) reputation event', () => {
    expect(REPUTATION_EVENT_TYPES.map((x) => x.id)).toContain(EVENT.hiredUp);
    const edges = buildEdges(rows, generated);
    const d = hiredUpDraft({ date: { seasonYear: 2032, dayIndex: 20 }, competitionId: 2, tier: 1, source: 'sim' }, 3, 30, 9, mentorsOf(3, edges), [1], null);
    const s = replay([{ ...d, id: 1, notability: null }], ctx());
    const peers = (id: number) => standing(s, id, { audience: 'peers', competitionId: null, teamId: null }, 2032).regard;
    // Head coach 1: +2 at reach 0.3, then +1 damped by the known gained (0.006). Coordinator 2: +2 only.
    expect(peers(1)).toBeCloseTo(50 + 2 * 0.3 + 1 * 0.3 * (1 - 0.5 * 0.02 * 0.3), 9);
    expect(peers(2)).toBeCloseTo(50 + 2 * 0.3, 9);
  });
});
