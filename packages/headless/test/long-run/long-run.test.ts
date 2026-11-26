import { describe, expect, it } from 'vitest';
import {
  INVARIANTS, NOT_CHECKED, PARAMS, UNAVAILABLE, driftReport, fitLine, loopTarget, measureAdvance, param, runLongRun, runStabilitySuite,
  testRecords, testSeries, type LongRunTarget, type SeasonPoint,
} from '../../src/long-run/index.ts';
import { REAL_TOLERANCES } from '../../src/long-run/tolerances.ts';
import { doubleTarget, type DoubleWorld } from './double.ts';

/** A clock that moves `step` ms each read, so run times are steady in tests. */
const fakeClock = (step: number) => { let t = 0; return () => (t += step); };
const ageSeries = (r: ReturnType<typeof runLongRun>) => r.drift.series.filter((s) => s.series.startsWith('age.'));

describe('Q1.6.1 30-season run', () => {
  const r = runLongRun({ target: doubleTarget(), now: fakeClock(1) });

  it('completes 30 seasons with zero invariant failures', () => {
    expect(param('run.seasons')).toBe(30);
    expect(r.completed).toBe(true);
    expect(r.seasonsRun).toBe(30);
    expect(r.error).toBeNull();
    expect(r.failures).toEqual([]);
  });

  it('reports save size and time per season, and the yearly series', () => {
    expect(r.perSeason).toHaveLength(30);
    for (const s of r.perSeason) { expect(s.saveBytes).toBeGreaterThan(0); expect(s.ms).toBeGreaterThan(0); }
    expect(r.series).toHaveLength(30);
    expect(r.series[0]!.season).toBe(2000);
    expect(r.series[29]!.season).toBe(2029);
  });

  it('says what it could not check and which steps were unbound, never passes them silently', () => {
    expect(r.unboundSteps.map((u) => u.step)).toEqual(['moves']);
    expect(r.notChecked.map((n) => n.invariant)).toEqual(NOT_CHECKED.map((n) => n.invariant));
    expect(r.unavailableSeries.map((u) => u.series)).toContain('money.salary_vs_cap');
  });

  it('replays: the same seed gives the same series', () => {
    const again = runLongRun({ target: doubleTarget(), now: fakeClock(1) });
    expect(again.series).toEqual(r.series);
    const other = runLongRun({ target: doubleTarget({ seedHex: '00000000000000b2' }), seasons: 3, now: fakeClock(1) });
    expect(other.series[2]).not.toEqual(r.series[2]);
  });

  it('an exception inside a season stops the run and is reported, not thrown', () => {
    const t = doubleTarget({ afterWeek: (w) => { if (w.date.seasonYear === 2003 && w.week === 2) throw new Error('step exploded'); } });
    const x = runLongRun({ target: t, now: fakeClock(1) });
    expect(x.completed).toBe(false);
    expect(x.seasonsRun).toBe(3);
    expect(x.error).toBe('step exploded');
  });
});

describe('Q1.2.2 invariants at every week boundary', () => {
  const planted = (bug: (w: DoubleWorld) => void, stopOnFailure = true) =>
    runLongRun({ target: doubleTarget({ afterWeek: (w) => { if (w.date.seasonYear === 2002 && w.week === 3) bug(w); } }), now: fakeClock(1), stopOnFailure, seasons: 5 });

  it('names the invariant, the command and the state hash before it', () => {
    const r = planted((w) => { const a = w.rosters.get(1)!; w.rosters.get(2)!.push(a[0]!); });
    expect(r.failures.length).toBeGreaterThan(0);
    const f = r.failures[0]!;
    expect(f.invariant).toBe('one_current_team');
    expect(f.command).toBe('weekly pass 2002 week 2');
    expect(f.at).toEqual({ kind: 'week', season: 2002, week: 2 });
    expect(f.hashBefore.startsWith('2002:2:20:')).toBe(true);
    expect(r.completed).toBe(false);
    expect(r.seasonsRun).toBe(2);
  });

  it('catches two jobs held at once', () => {
    const r = planted((w) => { w.jobs.set(99, { id: 99, teamId: 2, positionId: 'pos:oc', holderPersonId: w.jobs.get(1)!.holderPersonId }); });
    expect(r.failures.map((f) => f.invariant)).toContain('one_current_job');
  });

  it('catches a dead person on a roster, and a dead person coming back', () => {
    const r = planted((w) => { const pid = w.rosters.get(3)![0]!; w.status.set(pid, 'deceased'); w.people.get(pid)!.diedYear = 2002; }, false);
    expect(r.failures.map((f) => f.invariant)).toContain('no_dead_or_inactive_plays');
    const back = runLongRun({
      target: doubleTarget({ afterWeek: (w) => {
        const pid = w.rosters.get(4)![0]!;
        if (w.date.seasonYear === 2001 && w.week === 1) { w.status.set(pid, 'deceased'); w.people.get(pid)!.diedYear = 2001; }
        if (w.date.seasonYear === 2001 && w.week === 2) { w.status.set(pid, 'active'); w.people.get(pid)!.diedYear = null; }
      } }), seasons: 2, now: fakeClock(1),
    });
    expect(back.failures.map((f) => f.invariant)).toContain('dead_stays_dead');
  });

  it('catches an age that goes down, a lost person, and a game against itself', () => {
    expect(planted((w) => { const p = w.people.get(w.rosters.get(1)![0]!)!; p.birthDate = { seasonYear: p.birthDate.seasonYear + 3, dayIndex: 100 }; }).failures[0]!.invariant).toBe('age_never_decreases');
    expect(planted((w) => { w.people.delete(5000); w.people.delete([...w.people.keys()][0]!); }).failures.map((f) => f.invariant)).toContain('person_never_lost');
    expect(planted((w) => { const g = w.results[0]!; w.results.push({ ...g, gameId: 999_999, awayTeamId: g.homeTeamId }); }).failures[0]!.invariant).toBe('game_two_teams_one_rule_set');
  });

  it('checks roster limits when the composition root gives them', () => {
    const r = runLongRun({ target: doubleTarget(), seasons: 1, now: fakeClock(1), limits: { maxFor: () => 40 } });
    expect(r.failures[0]!.invariant).toBe('roster_limits');
    expect(runLongRun({ target: doubleTarget(), seasons: 1, now: fakeClock(1), limits: { maxFor: () => 53 } }).failures).toEqual([]);
  });

  it('lists every invariant it checks', () => {
    expect(INVARIANTS).toContain('imported_protected_event');
    expect(new Set(INVARIANTS).size).toBe(INVARIANTS.length);
  });
});

describe('Q1.6.2 imported-people protection', () => {
  it('30 seasons with every person imported produce zero protected events', () => {
    const r = runLongRun({ target: doubleTarget({ origin: 'imported' }), now: fakeClock(1), text: () => ['F1 L1 retired after the season.'] });
    expect(r.completed).toBe(true);
    expect(r.protection).toEqual([]);
    expect(r.failures).toEqual([]);
  });

  it('catches a protected event when the emit guard is off (mayReceiveEvent forced to true at emit)', () => {
    const t = doubleTarget({ origin: 'imported', afterWeek: (w) => { if (w.date.seasonYear === 2004 && w.week === 1) w.emit('arrest', w.rosters.get(1)![0]!); } });
    const r = runLongRun({ target: t, seasons: 6, now: fakeClock(1) });
    expect(r.protection.some((h) => h.kind === 'event' && h.detail.includes('arrest'))).toBe(true);
    expect(r.failures.map((f) => f.invariant)).toContain('imported_protected_event');
  });

  it('an unknown event type counts as protected (A6.3.1 rule 6)', () => {
    const t = doubleTarget({ origin: 'imported', afterWeek: (w) => { if (w.date.seasonYear === 2000 && w.week === 1) w.emit('mod_new_type', w.rosters.get(1)![0]!); } });
    expect(runLongRun({ target: t, seasons: 1, now: fakeClock(1) }).protection).toHaveLength(1);
  });

  it('scans generated text near an imported name, and finds invented family', () => {
    const t = doubleTarget({ origin: 'imported' });
    const r = runLongRun({ target: t, seasons: 1, now: fakeClock(1), text: (w) => [`${w.people.get(1)!.name.first} ${w.people.get(1)!.name.last} was arrested after a gambling debt.`] });
    expect(r.protection.some((h) => h.kind === 'text' && h.personId === 1)).toBe(true);

    const f = doubleTarget({ origin: 'imported', afterWeek: (w) => {
      if (w.date.seasonYear !== 2000 || w.week !== 1) return;
      w.people.get(1)!.life = { householdId: 7 };
      w.people.set(90_000, { id: 90_000, origin: 'generated', name: { first: 'Kin', last: 'Made' }, birthDate: { seasonYear: 1970, dayIndex: 1 }, diedYear: null, roles: ['family'], life: { householdId: 7 } });
      w.status.set(90_000, 'active');
    } });
    expect(runLongRun({ target: f, seasons: 1, now: fakeClock(1) }).protection.map((h) => h.kind)).toEqual(['family']);
  });

  it('the history run writes nothing onto imported people (X14.4.2)', () => {
    const r = runLongRun({ target: doubleTarget({ origin: 'imported' }), seasons: 2, now: fakeClock(1), careerStart: { seasonYear: 2001, dayIndex: 0 } });
    expect(r.protection.every((h) => h.kind === 'history_run')).toBe(true);
    expect(r.protection.length).toBeGreaterThan(0);
  });
});

describe('Q1.6.4 drift', () => {
  it('the steady world keeps its age series flat and its records falling off', () => {
    // The toy double has few players and whole-year ages, so it takes a wider age band than the real league's 1.7%.
    const r = runLongRun({ target: doubleTarget(), now: fakeClock(1), drift: { bandShares: { 'age.rostered.mean.pro.all': 0.05 } } });
    const ages = ageSeries(r);
    expect(ages.length).toBeGreaterThan(10);
    expect(ages.filter((s) => !s.pass)).toEqual([]);
    expect(r.drift.records.pass).toBe(true);
  });

  it('a parameter set with aging decline removed fails on the age series', () => {
    const r = runLongRun({ target: doubleTarget({ agingDecline: false }), now: fakeClock(1) });
    expect(r.drift.pass).toBe(false);
    const all = r.drift.series.find((s) => s.series === 'age.rostered.mean.pro.all')!;
    expect(all.pass).toBe(false);
    expect(all.slope).toBeGreaterThan(all.slopeLimit);
  });

  it('the pro league-wide series use the real NFL tolerances, other series the assumption defaults', () => {
    const flat: SeasonPoint[] = Array.from({ length: 30 }, (_, i) => ({ season: 2000 + i, values: { 'age.rostered.mean.pro.all': 26, 'age.rostered.mean.college.all': 26 } }));
    expect(testSeries('age.rostered.mean.pro.all', flat)!.slopeLimit).toBeCloseTo(0.0011 * 26, 6);
    expect(testSeries('age.rostered.mean.college.all', flat)!.slopeLimit).toBeCloseTo(0.005 * 26, 6);
    expect(REAL_TOLERANCES['stats.points_per_game']!.factIds.length).toBe(2);
  });

  it('fits a line and tests slope and band from season 5', () => {
    expect(fitLine([1, 2, 3, 4], [2, 4, 6, 8])).toEqual({ slope: 2, intercept: 0 });
    const flat: SeasonPoint[] = Array.from({ length: 30 }, (_, i) => ({ season: 2000 + i, values: { x: 50 + (i % 2 ? 0.1 : -0.1), early: i < 4 ? 900 : 50 } }));
    expect(testSeries('x', flat)!.pass).toBe(true);
    expect(testSeries('x', flat)!.n).toBe(26);
    expect(testSeries('early', flat)!.pass).toBe(true);
    const rising = flat.map((p, i) => ({ season: p.season, values: { x: 50 + i } }));
    expect(testSeries('x', rising)!.pass).toBe(false);
    const spike = flat.map((p, i) => ({ season: p.season, values: { x: i === 20 ? 90 : 50 } }));
    const s = testSeries('x', spike)!;
    expect(s.outside).toEqual([21]);
    expect(testSeries('x', spike, { bands: { 'x': { min: 0, max: 100 } }, slopeShares: { x: 1 } })!.pass).toBe(true);
    expect(testSeries('x', flat.slice(0, 6))).toBeNull();
  });

  it('records must fall less often after season 10 and never more often', () => {
    const falls = (seasons: number[]) => seasons.map((season) => ({ season, record: 'r', value: 1, previous: 0 }));
    expect(testRecords(falls([2001, 2002, 2011, 2012, 2017]), 1, 2000, 30).pass).toBe(true);
    const rising = testRecords(falls([2011, 2016, 2017, 2018]), 1, 2000, 30);
    expect(rising.pass).toBe(false);
    expect(rising.reason).toContain('rose');
    expect(testRecords(falls([2026, 2027, 2028, 2029, 2025]), 1, 2000, 30).pass).toBe(false);
  });

  it('ignored series are reported but do not fail the verdict', () => {
    const pts: SeasonPoint[] = Array.from({ length: 30 }, (_, i) => ({ season: 2000 + i, values: { up: i, flat: 5 } }));
    expect(driftReport(pts, [], 0).pass).toBe(false);
    const ok = driftReport(pts, [], 0, { ignore: ['up'] });
    expect(ok.pass).toBe(true);
    expect(ok.series.find((s) => s.series === 'up')!.ignored).toBe(true);
  });

  it('every tolerance is a named Assumption until Q1.6.4 research lands', () => {
    for (const p of PARAMS.params.filter((x) => /slopeShare|bandShare|recordSteadyRate|minSample|recordWindow/.test(x.name))) expect(p.basis).toBe('assumption');
    expect(UNAVAILABLE.length).toBeGreaterThan(0);
  });
});

describe('suite verdict and the 20-season advance', () => {
  // The toy double's class, turnover, talent and career series wobble (it is not the game); the real run reads them all.
  it('runs every seed and checks completion, invariants, time, size, protection and drift', () => {
    const v = runStabilitySuite({ seeds: ['00000000000000a1', '00000000000000a2'], makeTarget: (seedHex) => doubleTarget({ seedHex }), cores: 4, now: fakeClock(1), seasons: 30, drift: { ignore: ['class.', 'turnover.', 'talent.', 'career.'], bandShares: { 'age.rostered.mean.pro.all': 0.05 } } });
    expect(v.seeds).toHaveLength(2);
    expect(v.checks.filter((c) => !c.pass)).toEqual([]);
    expect(v.pass).toBe(true);
  });

  it('fails the run-time budget when the run is slower than 90 minutes', () => {
    const v = runStabilitySuite({ seeds: ['00000000000000a1'], makeTarget: (seedHex) => doubleTarget({ seedHex }), cores: 16, now: fakeClock(30 * 60_000), seasons: 2 });
    const time = v.checks.find((c) => c.check.endsWith('run time'))!;
    expect(time.pass).toBe(false);
    expect(v.pass).toBe(false);
  });

  it('fails the save budget at 1 GB', () => {
    const v = runStabilitySuite({ seeds: ['00000000000000a1'], makeTarget: (seedHex) => doubleTarget({ seedHex }), cores: 16, now: fakeClock(1), seasons: 1, sizeOf: () => 1_000_000_000 });
    expect(v.checks.find((c) => c.check.endsWith('save size'))!.pass).toBe(false);
  });

  it('measures or projects the 20-season advance against 60 minutes', () => {
    const m = measureAdvance(doubleTarget(), 2, fakeClock(1000), 'test double');
    expect(m.seasonsMeasured).toBe(2);
    expect(m.targetSeasons).toBe(20);
    expect(m.projectedMinutes).toBeGreaterThan(0);
    expect(m.withinBudget).toBe(true);
    expect(m.note).toContain('projected from 2 seasons with test double');
    expect(measureAdvance(doubleTarget(), 1, fakeClock(200 * 60_000)).withinBudget).toBe(false);
  });

  it('loopTarget drives the G-81 loop functions it is given', () => {
    const d = doubleTarget();
    const calls: string[] = [];
    const t: LongRunTarget = loopTarget(d.world, { sys: true }, { weeksInSeason: () => 2 }, {
      runWeek: () => { calls.push('week'); d.runWeek(); },
      runSeasonPoint: () => { calls.push('season'); d.runSeasonPoint(); },
      worldHash: (_w, deep) => `h${deep}`,
      unboundSteps: () => [{ step: 'health', reason: 'x' }],
    }, d.eventType);
    const r = runLongRun({ target: t, seasons: 2, now: fakeClock(1) });
    expect(calls).toEqual(['week', 'week', 'season', 'week', 'week', 'season']);
    expect(r.failures).toEqual([]);
    expect(r.unboundSteps).toEqual([{ step: 'health', reason: 'x' }]);
    expect(t.hash()).toBe('hfalse');
  });
});
