// The Hall of Fame in the world's past (Marlon 2026-11-26; C9.3.1, E5.6.3): one election per hall each
// season point, fed by the world's own records.
import { describe, expect, it } from 'vitest';
import { awards } from '@gm/league';
import { COLLEGE_LOOKUP, NAMES, PRO_LOOKUP, generation, loop, setup, testGamePort, testSchedule, trimmed } from '../fixtures.ts';
import * as turnover from '../../src/turnover/index.ts';

const content = trimmed();
const rule: turnover.RuleRead = (lvl, k) => (lvl === 'pro' ? PRO_LOOKUP : COLLEGE_LOOKUP)(k);

/** Halls opening after `open` seasons, so a short run reaches several ballots. */
function halls(open: number): loop.HallSpec[] {
  return loop.defaultHalls({ pro: 'pro', college: 'college' }, 0.5).map((h) => ({ ...h, opensAfterSeasons: open }));
}

function build(seasons: number, open: number, seedHex = '00000000000000a7') {
  const binding: turnover.TurnoverBinding = { content, rule, policy: turnover.gmPolicy() };
  const w = loop.createWorld({ setup: setup({ seedHex, firstSeasonYear: 2026 - seasons, historySeasons: seasons }), content, names: NAMES, eventTypes: turnover.TURNOVER_EVENT_TYPES });
  const pro = w.teams.filter((t) => turnover.levelOfTeam(w, t.id) === 'pro').length;
  const col = w.teams.length - pro;
  const sys = loop.systemsFrom({
    games: loop.gamesStep(testSchedule, testGamePort()), leaving: loop.leavingStep(),
    cohorts: loop.cohortStep({
      scale: () => ({ topCollegeTeams: col, draftedCount: pro * (PRO_LOOKUP(turnover.RULE_KEY.draftRounds) ?? 0), openEntryChairs: 0, retiredWouldBeCoaches: 0 }),
      names: NAMES, positionMix: content.levels.pro.rosterMix, homeRegion: () => 'region', kinds: ['recruit_class', 'college_walk_on', 'pro_entry_pool'],
    }),
    development: turnover.developmentStep(binding), moves: turnover.rosterMovesStep(binding),
    hall: loop.hallStep({ halls: halls(open) }),
  }, 'hall test: not bound');
  return { w, sys };
}

describe('hall of fame', () => {
  it('opens a set number of seasons after its league\'s first season', () => {
    const w = loop.createWorld({ setup: setup({ firstSeasonYear: 1869, historySeasons: 157 }), content, names: NAMES, foundingCurves: generation.defaultFoundingCurves() });
    const [pro] = loop.defaultHalls({ pro: 'pro', college: 'college' }, 0.5);
    const first = loop.leagueFirstSeason(w, 'pro')!;
    expect(first).toBeGreaterThanOrEqual(1920);
    expect(loop.hallOpens(w, pro!)).toBe(first + 43);
    expect(loop.leagueFirstSeason(w, 'no such level')).toBeNull();
  });

  // The turnover steps make each season slow (about 3 s on the trimmed world), so the runs are short.
  const run = build(14, 4);
  loop.runHistory(run.w, run.sys, { seasons: 14, schedule: testSchedule });
  const w = run.w;

  it('holds one ballot per open hall each season, classes inside the rules, nobody elected twice', () => {
    const proBallots = w.hall.ballots.filter((b) => b.hallId === 'hall.pro');
    const opens = loop.hallOpens(w, halls(4)[0]!)!;
    expect(proBallots.map((b) => b.ballotSeason)).toEqual(Array.from({ length: 2025 - opens + 1 }, (_, i) => opens + i));
    const rules = awards.proposedRules('pro_2027');
    for (const b of proBallots.slice(1)) {
      expect(b.elected).toBeLessThanOrEqual(Number(rules['hall.class_max']));
      if (b.finalists >= Number(rules['hall.class_min'])) expect(b.elected).toBeGreaterThanOrEqual(Number(rules['hall.class_min']));
    }
    expect(proBallots[0]!.elected).toBeLessThanOrEqual(17);
    const keys = w.hall.members.map((m) => `${m.hallId}:${m.personId}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(w.hall.members.filter((m) => m.hallId === 'hall.pro').length).toBeGreaterThan(0);
  });

  it('members waited out their seasons, and the ballot is logged as honour events', () => {
    for (const m of w.hall.members.filter((x) => x.hallId === 'hall.pro')) {
      if (m.kind === 'player') {
        const line = w.hall.players.get(m.personId)!;
        expect(m.ballotSeason - line.lastSeason).toBeGreaterThanOrEqual(5);
      } else {
        const last = Math.max(...w.hall.coachRows.filter((r) => r.personId === m.personId).map((r) => r.season));
        expect(m.ballotSeason - last).toBeGreaterThanOrEqual(1);
      }
    }
    const elected = w.log.rows().filter((e) => e.type === awards.HONOUR.elected);
    expect(elected.length).toBe(w.hall.members.length);
    for (const e of elected) expect(['hall.pro', 'hall.college']).toContain(e.payload['hall']);
  });

  it('the college hall holds no ballot until its committee rules are sourced', () => {
    const [, college] = halls(4);
    expect(loop.hallRuleGaps(college!).length).toBeGreaterThan(0);
    expect(w.hall.ballots.filter((b) => b.hallId === 'hall.college')).toEqual([]);
  });

  it('coach records add up to the games played', () => {
    const games = new Map<number, number>();
    for (const r of w.hall.coachRows) games.set(r.season, (games.get(r.season) ?? 0) + r.wins + r.losses + r.ties);
    for (const s of w.seasons) {
      const played = Object.values(s.records).reduce((n, l) => n + l.wins + l.losses + l.ties, 0);
      expect(games.get(s.seasonYear) ?? 0).toBeLessThanOrEqual(played);
    }
  });

  it('the same seed elects the same people', () => {
    const a = build(7, 1), b = build(7, 1);
    loop.runHistory(a.w, a.sys, { seasons: 7, schedule: testSchedule });
    loop.runHistory(b.w, b.sys, { seasons: 7, schedule: testSchedule });
    expect(a.w.hall.members.length).toBeGreaterThan(0);
    expect(b.w.hall.members).toEqual(a.w.hall.members);
    expect(loop.worldHash(b.w, false)).toBe(loop.worldHash(a.w, false));
  }, 300_000);
});
