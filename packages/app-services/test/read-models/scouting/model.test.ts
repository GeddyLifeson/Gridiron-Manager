// The scouting builders: tendency tables for both directions (O3.6.1, G8.1.1, H2.2.1) and the personnel
// report (H2.3.1). Counts are checked against direct counts of the records (O3.6.1 acceptance); opponent
// tables read only charted rows; grades are estimates with bands that narrow with more film.
import { describe, expect, it } from 'vitest';
import { predictability as pr, tendencies as td } from '@gm/models';
import { scouting as sc } from '@gm/people';
import { ObservedWorld, observerFor, tablesOf } from '../../../src/observer/index.ts';
import { buildPersonnelReport, buildTendencyView, allowedRows } from '../../../src/read-models/scouting/index.ts';
import { USER } from '../../observer/fixture-world.ts';
import { AWAY, AWAY_BOOK, HOME, SEASON, awayCharted, estimate, homeLog, play, store, tables } from './fixture.ts';

const self = (o: Partial<Parameters<typeof buildTendencyView>[0]> = {}) => buildTendencyView({
  subject: 'self', teamId: HOME, teamName: 'Home', plays: homeLog(), window: 'career', season: SEASON, cuts: ['downDistance'], measure: 'runPass', ...o,
});

describe('tendency table (O3.6.1, G8.1.1, H2.2.1)', () => {
  it('cell counts equal a direct count of the call records', () => {
    const v = self();
    const log = homeLog();
    for (const c of v.cells) {
      const bucket = log.filter((p) => td.downDistance(p) === c.cuts.downDistance);
      expect(c.calls).toBe(bucket.length);
      for (const o of c.outcomes) expect(o.count).toBe(bucket.filter((p) => td.runOrPass(p.playKind) === o.outcome).length);
      expect(c.refs).toHaveLength(c.calls);
    }
    expect(v.windowGames).toBe(5);
    expect(v.cells.reduce((s, c) => s + c.calls, 0)).toBe(log.length);
  });
  it('self-scout reads only the club\'s own call log', () => {
    const v = self({ plays: [...homeLog(), ...awayCharted(), play({ gameId: 3, source: 'charted', playKind: 'dropback_pass', runDirection: null })] });
    expect(v.cells.reduce((s, c) => s + c.calls, 0)).toBe(homeLog().length);
  });
  it('an opponent table reads only charted rows: an own-source row is never reachable', () => {
    const rows = allowedRows('opponent', AWAY, awayCharted());
    expect(rows.some((p) => p.source === 'own')).toBe(false);
    const v = buildTendencyView({ subject: 'opponent', teamId: AWAY, teamName: 'Away', plays: awayCharted(), window: 'career', season: SEASON, cuts: ['formation'], measure: 'runPass', taggerLine: 'Coach Last21, 4 of 5 tags held up' });
    expect(JSON.stringify(v)).not.toContain('secret_truth_formation');
    expect(v.cells.map((c) => c.cuts.formation)).toEqual(['ace']);
    expect(v.cells[0]!.calls).toBe(32);
    expect(v.taggerLine).toBe('Coach Last21, 4 of 5 tags held up');
    expect(v.exposure).toEqual([]);
  });
  it('windows: the last three games by default, a season, the career', () => {
    expect(self({ window: 'last3' }).windowGames).toBe(3);
    expect(self({ window: 'last4' }).windowGames).toBe(4);
    expect(self({ window: 'season', plays: [...homeLog(), play({ gameId: 9, season: SEASON - 1 })] }).windowGames).toBe(5);
    expect(self({ window: 'last3' }).windowLabel).toBe('last 3 games');
  });
  it('self-scout ranks what the next opponent probably knows (G8.1.2); the tagger line is the opponent report\'s', () => {
    const games = [1, 2, 3, 4, 5].map((g) => ({ gameId: g, season: SEASON, gameOrder: g }));
    const v = self({ exposure: { games, chartingQuality: 0.8 }, taggerLine: 'not for self-scout' });
    expect(v.exposure.length).toBeGreaterThan(0);
    expect(v.exposure[0]!.label).toContain('pass');
    expect(v.taggerLine).toBeNull();
  });
  it('shows the predictability index with a league baseline (G8.2.1)', () => {
    const calls = homeLog().map((p) => td.toCallRecord(p, 900, 4)!).filter(Boolean);
    const baseline = pr.buildBaseline(calls, pr.OFFENSE_CATEGORIES);
    const v = self({ baseline: { baseline, periodSeconds: 900, periods: 4 } });
    expect(v.predictability?.calls).toBe(homeLog().length);
    expect(v.predictability?.words).toMatch(/right \d+% of the time/);
    expect(self().predictability).toBeNull();
  });
  it('refuses an unknown measure or cut', () => {
    expect(() => self({ measure: 'nope' })).toThrow(/unknown measure/);
    expect(() => self({ cuts: ['nope'] })).toThrow(/unknown cut/);
  });
});

const world = (t = tables()) => { const s = tablesOf(t); return new ObservedWorld(s, observerFor(s, USER)); };

describe('personnel report (H2.3.1)', () => {
  it('lists the depth chart with a graded card per player and names the weak links', () => {
    const r = buildPersonnelReport(world(), { subject: 'opponent', clubId: HOME, teamId: AWAY, estimates: store() })!;
    expect(r.teamName).toBe('Town 5 Testers');
    expect(r.depth.map((u) => u.unitId)).toEqual(['def:base', 'off:base', 'st:punt']);
    expect(r.summary).toEqual({ bestOffense: 111, bestDefense: 109, weakestPassProtector: 108, weakestCoverageDefender: 110 });
    const lt = r.cards.find((c) => c.personId === 107)!;
    expect(lt.starter).toBe(true);
    expect(lt.roles).toEqual(['off:base/LT']);
    expect(lt.groups.map((g) => g.group)).toEqual(['ol_pass']);
    expect(lt.strengths[0]).toBe('pass_set');
    expect(lt.grades.filter((g) => g.state === 'graded')).toHaveLength(5);
    expect(r.cards.find((c) => c.personId === 108)!.roles).toEqual(['off:base/LG', 'st:punt/PP']);
  });
  it('no true attribute appears: grades are the staff\'s estimates in the display scale', () => {
    const r = buildPersonnelReport(world(), { subject: 'opponent', clubId: HOME, teamId: AWAY, estimates: store() })!;
    const qb = r.cards.find((c) => c.personId === 111)!;
    expect(qb.overall!.label).toBe(sc.grade(sc.DECIMAL_SCALE, 75).text);
    const t = tables();
    const truth = (t.people as { id: number; playing?: { attributes: Record<string, number> } }[]).find((p) => p.id === 111)!.playing!.attributes;
    const text = JSON.stringify(r);
    for (const v of Object.values(truth)) expect(text).not.toContain(String(v));
  });
  it('bands narrow as more games are broken down', () => {
    const thin = { ...AWAY_BOOK, 111: { arm_strength: estimate(75, 100, 30) } };
    const wide = buildPersonnelReport(world(), { subject: 'opponent', clubId: HOME, teamId: AWAY, estimates: store(thin) })!.cards.find((c) => c.personId === 111)!;
    let e = thin[111].arm_strength!;
    const ctx = { attribute: 'arm_strength', source: 'game_film' as const, units: 60, date: { seasonYear: SEASON, dayIndex: 10 }, evaluator: { id: 21, line: 'own_staff' }, skill: sc.p('skill.userTerm'), estimateMean: 75, opponent: null };
    for (let g = 0; g < 6; g++) e = sc.update(e, sc.evidenceItem(ctx, 75), 26, () => sc.p('skill.userTerm'));
    const narrow = buildPersonnelReport(world(), { subject: 'opponent', clubId: HOME, teamId: AWAY, estimates: store({ ...thin, 111: { arm_strength: e } }) })!.cards.find((c) => c.personId === 111)!;
    const width = (b: { bandText: string }) => { const [lo, hi] = b.bandText.split(' to ').map(Number); return (hi ?? lo!) - lo!; };
    expect(e.variance).toBeLessThan(100);
    expect(width(narrow.overall!)).toBeLessThan(width(wide.overall!));
  });
  it('a player nobody on staff has graded is shown as unscouted, with no grade', () => {
    const r = buildPersonnelReport(world(), { subject: 'opponent', clubId: HOME, teamId: AWAY })!;
    expect(r.cards.every((c) => c.unscouted && c.overall === null)).toBe(true);
    expect(r.summary.weakestPassProtector).toBeNull();
  });
  it('the staff\'s eye on its own players reads the club\'s PersonView rows', () => {
    const r = buildPersonnelReport(world(), { subject: 'self', clubId: HOME, teamId: HOME })!;
    const qb = r.cards.find((c) => c.personId === 101)!;
    expect(qb.starter).toBe(true);
    expect(qb.unscouted).toBe(false);
    expect(qb.grades.find((g) => g.attribute === 'arm_strength')!.state).toBe('graded');
    expect(r.cards.find((c) => c.personId === 104)!.starter).toBe(false);
  });
});
