import { describe, expect, it } from 'vitest';
import type { PersonRecord } from '@gm/schema';
import { COLLEGE_LOOKUP, NAMES, PRO_LOOKUP, loop, setup, testGamePort, testSchedule, trimmed } from '../fixtures.ts';
import * as turnover from '../../src/turnover/index.ts';

const content = trimmed();
const rule: turnover.RuleRead = (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k);

function build() {
  const binding: turnover.TurnoverBinding = { content, rule, policy: turnover.gmPolicy() };
  const w = loop.createWorld({ setup: setup({}), content, names: NAMES, eventTypes: [...turnover.TURNOVER_EVENT_TYPES, ...turnover.COACH_EVENT_TYPES] });
  const pro = w.teams.filter((t) => turnover.levelOfTeam(w, t.id) === 'pro').length;
  const col = w.teams.length - pro;
  const sys = loop.systemsFrom({
    games: loop.gamesStep(testSchedule, testGamePort()), leaving: loop.leavingStep(),
    cohorts: loop.cohortStep({
      scale: (x) => ({ topCollegeTeams: col, draftedCount: pro * (PRO_LOOKUP(turnover.RULE_KEY.draftRounds) ?? 0), openEntryChairs: turnover.coachEntrants(x), retiredWouldBeCoaches: 0 }),
      names: NAMES, positionMix: content.levels.pro.rosterMix, homeRegion: () => 'region',
    }),
    development: turnover.developmentStep(binding), moves: turnover.movesStep(binding, turnover.rosterMovesStep(binding)),
  }, 'test: not bound');
  return { w, sys };
}

/** A player record with the fields the pipeline reads, everything else from a real world person. */
function player(base: PersonRecord, o: { position?: string; proSeasons?: number; collegeSeasons?: number; iq?: number; leadership?: number; love?: number; goal?: boolean }): PersonRecord {
  const pl = base.playing!;
  return {
    ...base,
    playing: {
      ...pl, position: o.position ?? 'WR', attributes: { ...pl.attributes, football_intelligence: o.iq ?? 50 },
      eligibility: { ...pl.eligibility, pro: { ...pl.eligibility.pro, seasonsOnRoster: o.proSeasons ?? 0 }, college: { ...pl.eligibility.college, seasonsOfCompetitionUsed: o.collegeSeasons ?? 4 } },
    },
    traitBlock: {
      ...base.traitBlock, facets: { ...base.traitBlock.facets, leadership: o.leadership ?? 50, love_of_football: o.love ?? 50 },
      goals: o.goal ? [{ goalId: 'coach_after_playing', target: 'core:role_coach', byYear: null, intensity: 60, status: 'active' }] : [],
    },
  };
}

describe('player-to-coach pipeline: who wants to coach (D13.3.5 rule 3a)', () => {
  const { w } = build();
  const base = [...w.people.values()].find((p) => p.playing && p.traitBlock.source === 'generated')!;

  it('starts from the level base for a middle player of a middle position', () => {
    expect(turnover.wantsToCoachChance(player(base, { position: 'XX', proSeasons: turnover.param('pipeline.proSeasonsMean') }))).toBeCloseTo(turnover.param('pipeline.proBase'), 6);
    expect(turnover.wantsToCoachChance(player(base, { position: 'XX' }))).toBeCloseTo(turnover.param('pipeline.collegeBase'), 6);
  });

  it('is shaped by position (F-pipeline-0002), intelligence, leadership, love of the game, the goal and career length', () => {
    const at = (o: Parameters<typeof player>[1]) => turnover.wantsToCoachChance(player(base, { proSeasons: 4, ...o }));
    expect(at({ position: 'QB' })).toBeGreaterThan(at({ position: 'LB' }));
    expect(at({ position: 'LB' })).toBeGreaterThan(at({ position: 'OL' }));
    expect(at({ position: 'OL' })).toBeGreaterThan(at({ position: 'DT' }));
    expect(at({ position: 'DT' })).toBeGreaterThan(at({ position: 'K' }));
    expect(at({ iq: 80 })).toBeGreaterThan(at({ iq: 40 }));
    expect(at({ leadership: 80 })).toBeGreaterThan(at({ leadership: 40 }));
    expect(at({ love: 80 })).toBeGreaterThan(at({ love: 40 }));
    expect(at({ goal: true })).toBeGreaterThan(at({}));
    expect(at({ proSeasons: 12 })).toBeGreaterThan(at({ proSeasons: 1 }));
  });

  it('gives no chance to a person who never played, and the same answer every time it is asked', () => {
    expect(turnover.wantsToCoachChance(player(base, { proSeasons: 0, collegeSeasons: 0 }))).toBe(0);
    const p = player(base, { position: 'QB', iq: 90, leadership: 90, goal: true, proSeasons: 10 });
    expect(turnover.wantsToCoach(w, p)).toBe(turnover.wantsToCoach(w, p));
  });

  it('starts college players as graduate assistants, pro players at quality control, long pro careers at assistant position coach', () => {
    expect(turnover.entryRungMax(player(base, {}))).toBe(2);
    expect(turnover.entryRungMax(player(base, { proSeasons: 3 }))).toBe(3);
    expect(turnover.entryRungMax(player(base, { proSeasons: 9 }))).toBe(4);
  });

  it('averages near the level base over the generated pro population', () => {
    const pros = [...w.people.values()].filter((p) => p.playing && turnover.levelOfTeam(w, [...w.rosters].find(([, ids]) => ids.includes(p.id))?.[0] ?? -1) === 'pro');
    const mean = pros.reduce((a, p) => a + turnover.wantsToCoachChance(player(p, { position: p.playing!.position, proSeasons: 4, iq: p.playing!.attributes['football_intelligence'], leadership: p.traitBlock.facets['leadership'], love: p.traitBlock.facets['love_of_football'], goal: p.traitBlock.goals.some((g) => g.goalId === 'coach_after_playing') })), 0) / pros.length;
    process.stderr.write(`\n${['mean pro wants-to-coach chance', mean.toFixed(4), 'over', pros.length, 'players'].join(' ')}\n`);
    expect(mean).toBeGreaterThan(turnover.param('pipeline.proBase') * 0.6);
    expect(mean).toBeLessThan(turnover.param('pipeline.proBase') * 2.5);
  });
});

describe('player-to-coach pipeline: who hears of a former player (D13.3.5 rule 4)', () => {
  const { w } = build();
  const noTie = () => 0;
  it('a staff knows its own former players, a coach tied to the head coach recommends his, others are rare cold applications', () => {
    const coached = new Map([[901, 3], [902, 1]]);
    expect(turnover.routeTo(w, 1, 2000, 5, coached, new Set([902, 50]), 50, noTie)).toEqual({ route: 'own', via: 902 });
    expect(turnover.routeTo(w, 1, 2000, 5, coached, new Set([50]), 50, (a, b) => (a === 50 && b === 901 ? 25 : 0))).toEqual({ route: 'recommended', via: 901 });
    let cold = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) if (turnover.routeTo(w, i, 2000, 5, coached, new Set([50]), 50, noTie) !== null) cold++;
    const p5 = w.people.get(5);
    const expected = turnover.param(p5 && turnover.playedPro(p5) ? 'pipeline.coldConsideredPro' : 'pipeline.coldConsidered');
    expect(cold / n).toBeGreaterThan(expected * 0.5);
    expect(cold / n).toBeLessThan(expected * 1.6);
  });
});

describe('player-to-coach pipeline in the world loop (D13.3.5, S11.2.1)', () => {
  const SEASONS = 8;
  const g = build();
  for (let i = 0; i < SEASONS; i++) loop.runSeason(g.w, g.sys, testSchedule);
  const formerPlayersCoaching = [...g.w.jobs.values()].map((j) => j.holderPersonId).filter((id): id is number => id !== null)
    .filter((id, i, a) => a.indexOf(id) === i).filter((id) => turnover.levelPlayed(g.w.people.get(id)!) !== null);

  it('hires former world players into coaching chairs', () => {
    process.stderr.write(`\n${['former players holding chairs after', SEASONS, 'seasons:', formerPlayersCoaching.length,
      'pro-played:', formerPlayersCoaching.filter((id) => turnover.levelPlayed(g.w.people.get(id)!) === 'pro').length].join(' ')}\n`);
    expect(formerPlayersCoaching.length).toBeGreaterThan(0);
    for (const id of formerPlayersCoaching) expect(g.w.people.get(id)!.roles).toContain('coach');
  });

  it('only former players who wanted to coach are hired', () => {
    for (const id of formerPlayersCoaching) expect(turnover.wantsToCoach(g.w, g.w.people.get(id)!)).toBe(true);
  });

  it('records players who coach under the coaches they played for, as a query (S11.2.1)', () => {
    const coaches = new Set(g.w.staffSeasons.flatMap((s) => [s.headCoachId, ...s.staffIds]).filter((x): x is number => x !== null));
    const withTree = [...coaches].filter((c) => turnover.playersWhoCoach(g.w, c).length > 0);
    process.stderr.write(`\n${['coaches with at least one former player now coaching:', withTree.length, 'of', coaches.size].join(' ')}\n`);
    for (const c of withTree) for (const p of turnover.playersWhoCoach(g.w, c)) expect(formerPlayersCoaching).toContain(p);
  });
});
