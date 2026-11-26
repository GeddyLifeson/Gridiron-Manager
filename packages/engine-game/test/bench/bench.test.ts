// WP-18 acceptance tests (plans/engine-build-plan.md: D10 acceptance cases; Q1.2.2 never more than
// `substitution.max_players`, read by key). Each D10 acceptance criterion the module can answer alone is a
// named test; the ones that need other modules are listed in the PR body.
import { describe, expect, it } from 'vitest';
import { Contract } from '@gm/engine-core';
import {
  PARAMS, RULE_KEYS, benchAfterPlay, benchAtBreak, chooseLineup, conditioningAfterWeek, debtAfterDay, debtBand, defenseMaySubstitute,
  environmentFactors, gameDayFatigue, ledgerAfterPlay, seasonWear, shareOf, shortTermRecoveredShare, staffReads, startingLongTerm,
  weeklyTolerance, chronicLoad, dayLoad, ageFactor, EMPTY_LEDGER, DEFAULT_PLAN, type AfterPlayInput, type BenchLedger, type LineupRequest,
} from '../../src/bench/index.ts';
import { COLLEGE, DEFENSE_ROLES, DEPS, PARAMS_TABLE as P, PRO, STREAMS, benchOf, day, exactRead, fixtureTeam } from './fixtures.ts';

type Bench = Record<string, Contract.GameDayState>;
const NO_CEIL: AfterPlayInput['ceilings'] = [{}, {}];

function play(o: Partial<AfterPlayInput> & { deltas: AfterPlayInput['deltas'] }): AfterPlayInput {
  return { counts: true, disqualified: [], injuries: [], liveSeconds: 6, deadSeconds: 30, ceilings: NO_CEIL, recovery: [1, 1], ...o };
}
const delta = (playerId: number, energyCost: number, onField = true): Contract.PlayerDelta => ({ playerId, energyCost, hitLoad: 0, onField });

describe('module files', () => {
  it('parameters parse, are unique, and sit inside their ranges', () => {
    Contract.ParamFile.parse(PARAMS);
    const names = PARAMS.params.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
    for (const p of PARAMS.params) expect(p.value >= p.min && p.value <= p.max, p.name).toBe(true);
  });
  it('every rule key it reads exists in both real rule sets', () => {
    for (const k of RULE_KEYS) for (const rs of [PRO, COLLEGE]) expect(rs.keys()).toContain(k.key);
  });
});

describe('D10.1.1 freshness between plays', () => {
  it('recovery fractions: about 45 percent in a 20 s gap and 68 percent in a 40 s gap at full conditioning', () => {
    expect(shortTermRecoveredShare(20, 100, 1, DEPS)).toBeCloseTo(0.435, 2);
    expect(shortTermRecoveredShare(40, 100, 1, DEPS)).toBeCloseTo(0.68, 2);
  });
  it('conditioning speeds recovery', () => {
    expect(shortTermRecoveredShare(30, 60, 1, DEPS)).toBeLessThan(shortTermRecoveredShare(30, 90, 1, DEPS));
  });
  it('long drive: a lineman ends a 12-play no-huddle drive less fresh than a 12-play huddle drive', () => {
    const drive = (dead: number) => {
      let g: readonly [Bench, Bench] = [{ '1': day() }, {}];
      for (let i = 0; i < 12; i++) g = benchAfterPlay(g, play({ deltas: [delta(1, 0.05)], deadSeconds: dead }), DEPS);
      return g[0]['1']!;
    };
    const fast = drive(20), slow = drive(40);
    expect(fast.freshness).toBeLessThan(slow.freshness);
    expect(fast.freshness).toBeLessThan(0.9);
    // The long-term part falls with work and is the same in both: rest between plays does not restore it.
    expect(fast.freshnessLongTerm).toBeCloseTo(slow.freshnessLongTerm, 12);
    expect(fast.freshnessLongTerm).toBeLessThan(1);
  });
  it('bench recovery: 3 percent of the long-term deficit returns per minute on the bench, none on the field', () => {
    const g: readonly [Bench, Bench] = [{ '1': day({ freshness: 0.6, freshnessLongTerm: 0.6 }), '2': day({ freshness: 0.6, freshnessLongTerm: 0.6 }) }, {}];
    const after = benchAfterPlay(g, play({ deltas: [delta(2, 0)], liveSeconds: 0, deadSeconds: 60 }), DEPS)[0];
    expect(after['1']!.freshnessLongTerm).toBeCloseTo(0.6 + 0.4 * 0.03, 10);
    expect(after['2']!.freshnessLongTerm).toBe(0.6);
  });
  it('bench recovery stops at the ceiling the player started the game with', () => {
    const g: readonly [Bench, Bench] = [{ '1': day({ freshness: 0.8, freshnessLongTerm: 0.8 }) }, {}];
    let b: readonly [Bench, Bench] = g;
    for (let i = 0; i < 200; i++) b = benchAfterPlay(b, play({ deltas: [], ceilings: [{ '1': 0.88 }, {}] }), DEPS);
    expect(b[0]['1']!.freshnessLongTerm).toBeLessThanOrEqual(0.88);
    expect(b[0]['1']!.freshnessLongTerm).toBeGreaterThan(0.87);
  });
  it('timeout gives everyone a full short-term recovery; halftime also returns a quarter of the long-term deficit', () => {
    const g: readonly [Bench, Bench] = [{ '1': day({ freshness: 0.5, freshnessLongTerm: 0.8 }) }, {}];
    expect(benchAtBreak(g, 'timeout', NO_CEIL, P)[0]['1']).toMatchObject({ freshness: 0.8, freshnessLongTerm: 0.8 });
    const half = benchAtBreak(g, 'halftime', NO_CEIL, P)[0]['1']!;
    expect(half.freshnessLongTerm).toBeCloseTo(0.85, 12);
    expect(half.freshness).toBe(half.freshnessLongTerm);
  });
  it('freshness never exceeds its long-term part and stays in 0 to 1', () => {
    let g: readonly [Bench, Bench] = [{ '1': day(), '2': day() }, {}];
    for (let i = 0; i < 300; i++) {
      g = benchAfterPlay(g, play({ deltas: [delta(1, 0.3), delta(2, i % 3 === 0 ? 0.2 : 0, i % 3 === 0)], deadSeconds: 5 + (i % 40) }), DEPS);
      for (const d of Object.values(g[0])) {
        expect(d.freshness).toBeGreaterThanOrEqual(0);
        expect(d.freshness).toBeLessThanOrEqual(d.freshnessLongTerm);
        expect(d.freshnessLongTerm).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('J11.5.1 bookkeeping', () => {
  it('counts snaps for players on the field, not on a no-play', () => {
    const g: readonly [Bench, Bench] = [{ '1': day(), '2': day() }, {}];
    const a = benchAfterPlay(g, play({ deltas: [delta(1, 0.02), delta(2, 0, false)] }), DEPS);
    expect(a[0]['1']!.snapsThisGame).toBe(1);
    expect(a[0]['2']!.snapsThisGame).toBe(0);
    const b = benchAfterPlay(a, play({ deltas: [delta(1, 0.02)], counts: false }), DEPS);
    expect(b[0]['1']!.snapsThisGame).toBe(1);
    expect(b[0]['1']!.freshness).toBeLessThan(a[0]['1']!.freshness + 1e-12);
  });
  it('a player hurt in an injury stoppage sits the next counted down (injury.sit_downs read by key), then is available', () => {
    const sit = PRO.num('injury.sit_downs');
    let g: readonly [Bench, Bench] = [{}, { '7': day() }];
    g = benchAfterPlay(g, play({ deltas: [delta(7, 0.03)], injuries: [{ side: 1, playerId: 7, kind: 'stoppage' }] }), DEPS);
    expect(g[1]['7']!.requiredAbsenceDowns).toBe(sit);
    g = benchAfterPlay(g, play({ deltas: [], counts: false }), DEPS);
    expect(g[1]['7']!.requiredAbsenceDowns).toBe(sit);
    for (let i = 0; i < sit; i++) g = benchAfterPlay(g, play({ deltas: [] }), DEPS);
    expect(g[1]['7']!.requiredAbsenceDowns).toBe(0);
  });
  it('ejections and players ruled out stick for the game', () => {
    let g: readonly [Bench, Bench] = [{ '1': day(), '2': day() }, {}];
    g = benchAfterPlay(g, play({ deltas: [], disqualified: [1], injuries: [{ side: 0, playerId: 2, kind: 'out' }] }), DEPS);
    g = benchAfterPlay(g, play({ deltas: [] }), DEPS);
    expect(g[0]['1']!.ejected).toBe(true);
    expect(g[0]['2']!.unavailable).toBe(true);
  });
  it('is pure: the input bench is not changed', () => {
    const g: readonly [Bench, Bench] = [{ '1': day() }, {}];
    const snap = JSON.stringify(g);
    benchAfterPlay(g, play({ deltas: [delta(1, 0.1)] }), DEPS);
    expect(JSON.stringify(g)).toBe(snap);
  });
});

describe('D10.5.1 environment', () => {
  const base = { heatIndexF: 70, heatAcclimatisedDays: 0, altitudeFt: 0, visitingAtAltitude: false, daysAtAltitude: 0 };
  it('heat: recovery falls 2 percent per degree of heat index above 80, half that when acclimatised; cost rises 1.5 percent', () => {
    expect(environmentFactors(base, P)).toEqual({ recovery: 1, energyCost: 1 });
    const hot = environmentFactors({ ...base, heatIndexF: 90 }, P);
    expect(hot.recovery).toBeCloseTo(0.8, 12);
    expect(hot.energyCost).toBeCloseTo(1.15, 12);
    expect(environmentFactors({ ...base, heatIndexF: 90, heatAcclimatisedDays: 10 }, P).recovery).toBeCloseTo(0.9, 12);
  });
  it('altitude: the visitor loses 1 percent per 400 ft above 4,000 ft, halved after 3 days; the home team nothing', () => {
    expect(environmentFactors({ ...base, altitudeFt: 5280, visitingAtAltitude: true }, P).recovery).toBeCloseTo(0.97, 12);
    expect(environmentFactors({ ...base, altitudeFt: 5280, visitingAtAltitude: true, daysAtAltitude: 3 }, P).recovery).toBeCloseTo(0.985, 12);
    expect(environmentFactors({ ...base, altitudeFt: 5280 }, P).recovery).toBe(1);
  });
  it('heat slows recovery between plays', () => {
    expect(shortTermRecoveredShare(30, 90, 0.8, DEPS)).toBeLessThan(shortTermRecoveredShare(30, 90, 1, DEPS));
  });
  it('an early body-clock kickoff cuts starting freshness by 2 percent', () => {
    const i = { conditioning: 90, band: 'none' as const, wear: 0, bodyClockKickoffHour: 13 };
    expect(startingLongTerm(i, P)).toBe(1);
    expect(startingLongTerm({ ...i, bodyClockKickoffHour: 9 }, P)).toBeCloseTo(0.98, 12);
  });
});

function request(o: Partial<LineupRequest> = {}): LineupRequest {
  const team = fixtureTeam();
  const bench = benchOf(team);
  return { side: 0, unit: 'defense', roles: [...DEFENSE_ROLES], team, bench, previous: null, read: exactRead(bench), plan: DEFAULT_PLAN, ledger: EMPTY_LEDGER, mayChange: true, ...o };
}

describe('J11.5.1 step 4 and D10.6.1 lineup', () => {
  it('Q1.2.2: never fields more than substitution.max_players, read by key, at either level', () => {
    for (const rules of [PRO, COLLEGE]) {
      const max = rules.num('substitution.max_players');
      const roles = [...DEFENSE_ROLES, 'EXTRA1', 'EXTRA2'];
      const l = chooseLineup(request({ roles }), rules, P);
      expect(l.players.length).toBeLessThanOrEqual(max);
      expect(l.unfilledRoles.length).toBe(roles.length - max);
      expect(new Set(l.players.map((f) => f.playerId)).size).toBe(l.players.length);
    }
  });
  it('Q1.2.2 over generated benches: never more than the limit, never a player twice, never an unavailable player', () => {
    const s = STREAMS('between', [9999, 0]);
    for (let n = 0; n < 500; n++) {
      const team = fixtureTeam();
      const bench: Bench = {};
      for (const p of team.players) {
        const f = s.uniform();
        bench[String(p.playerId)] = day({ freshness: f, freshnessLongTerm: Math.max(f, s.uniform()), ejected: s.chance(0.05), unavailable: s.chance(0.05), requiredAbsenceDowns: s.chance(0.05) ? 1 : 0 });
      }
      const roles = (DEFENSE_ROLES.slice(0, s.int(8, 11)) as string[]).concat(s.chance(0.3) ? ['X1', 'X2'] : []);
      const l = chooseLineup(request({ team, bench, read: exactRead(bench), roles, mayChange: s.chance(0.7), previous: s.chance(0.5) ? request().previous : null }), PRO, P);
      expect(l.players.length).toBeLessThanOrEqual(PRO.num('substitution.max_players'));
      expect(new Set(l.players.map((f) => f.playerId)).size).toBe(l.players.length);
      for (const f of l.players) {
        const d = bench[String(f.playerId)]!;
        expect(d.ejected || d.unavailable || d.requiredAbsenceDowns > 0).toBe(false);
      }
    }
  });
  it('starts the depth chart starters when everyone is fresh', () => {
    const l = chooseLineup(request(), PRO, P);
    expect(l.players.map((f) => f.playerId)).toEqual([1, 2, 4, 5, 7, 8, 9, 10, 11, 13, 14]);
    expect(l.substitutions).toEqual([]);
  });
  it('J11.5.1 acceptance: a player below his threshold is replaced at the next dead ball when a substitute exists and tempo allows', () => {
    const base = request();
    const previous = chooseLineup(base, PRO, P).players;
    const bench = { ...base.bench, '1': day({ freshness: 0.5, freshnessLongTerm: 0.9 }) };
    const l = chooseLineup({ ...base, bench, read: exactRead(bench), previous }, PRO, P);
    expect(l.players.find((f) => f.role === 'DT1')!.playerId).toBe(3);
    expect(l.substitutions).toEqual([{ type: 'substitution', side: 0, inId: 3, outId: 1, reason: 'fatigue' }]);
    for (const e of l.substitutions) Contract.GameEvent.parse(e);
    // Tempo blocks the change: he stays on, tired (D10.1.1 edge case).
    const held = chooseLineup({ ...base, bench, read: exactRead(bench), previous, mayChange: false }, PRO, P);
    expect(held.players.find((f) => f.role === 'DT1')!.playerId).toBe(1);
    expect(held.substitutions).toEqual([]);
  });
  it('floor words: "ride him" keeps a player that "normal" would take out, "fresh legs" takes out one "normal" keeps', () => {
    const base = request();
    const bench = { ...base.bench, '1': day({ freshness: 0.5 }), '2': day({ freshness: 0.6 }) };
    const ride = chooseLineup({ ...base, bench, read: exactRead(bench), plan: { floor: 'ride_him', players: {} } }, PRO, P);
    const normal = chooseLineup({ ...base, bench, read: exactRead(bench), plan: { floor: 'normal', players: {} } }, PRO, P);
    const bench2 = { ...base.bench, '2': day({ freshness: 0.6 }) };
    const fresh = chooseLineup({ ...base, bench: bench2, read: exactRead(bench2), plan: { floor: 'normal', players: { '2': { floor: 'fresh_legs' } } } }, PRO, P);
    expect(ride.players.find((f) => f.role === 'DT1')!.playerId).toBe(1);
    expect(normal.players.find((f) => f.role === 'DT1')!.playerId).toBe(3);
    expect(normal.players.find((f) => f.role === 'DT2')!.playerId).toBe(2);
    expect(fresh.players.find((f) => f.role === 'DT2')!.playerId).not.toBe(2);
  });
  it('when everyone on a depth line is below the floor the freshest by the read plays', () => {
    const base = request();
    const bench = { ...base.bench, '1': day({ freshness: 0.3 }), '3': day({ freshness: 0.4 }) };
    expect(chooseLineup({ ...base, bench, read: exactRead(bench) }, PRO, P).players.find((f) => f.role === 'DT1')!.playerId).toBe(3);
  });
  it('injured, ejected and required-absence players always come off, even against tempo, with the right reason', () => {
    const base = request();
    const previous = chooseLineup(base, PRO, P).players;
    const bench = { ...base.bench, '4': day({ unavailable: true }), '7': day({ ejected: true }), '10': day({ requiredAbsenceDowns: 1 }) };
    const l = chooseLineup({ ...base, bench, read: exactRead(bench), previous, mayChange: false }, PRO, P);
    const by = Object.fromEntries(l.substitutions.map((e) => [e.outId, e.reason]));
    expect(by).toEqual({ 4: 'injury', 7: 'ejection', 10: 'injury' });
    expect(l.players.some((f) => [4, 7, 10].includes(f.playerId))).toBe(false);
  });
  it('emergency depth chart: a role with nobody left on its line takes an available player of the listed position', () => {
    const base = request();
    const bench = { ...base.bench, '13': day({ unavailable: true }) };
    const l = chooseLineup({ ...base, bench, read: exactRead(bench), roles: ['FS'] }, PRO, P);
    expect(l.emergencyRoles).toEqual(['FS']);
    expect(l.players[0]!.playerId).not.toBe(13);
  });
  it('D10.6.1 acceptance: a user plan of target shares is followed within 5 points with no injury or tempo constraint', () => {
    const team = fixtureTeam();
    const plan = { floor: 'ride_him' as const, players: { '1': { targetShare: 0.65 }, '4': { targetShare: 0.7 } } };
    let ledger: BenchLedger = EMPTY_LEDGER;
    const bench = benchOf(team);
    const dressed = team.players.map((p) => p.playerId);
    for (let i = 0; i < 65; i++) {
      const l = chooseLineup({ ...request(), team, bench, read: exactRead(bench), plan, ledger }, PRO, P);
      ledger = ledgerAfterPlay(ledger, 'defense', l.players.map((f) => f.playerId), dressed);
    }
    expect(Math.abs(shareOf(ledger, 1, 'defense') - 0.65)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(shareOf(ledger, 4, 'defense') - 0.7)).toBeLessThanOrEqual(0.05);
    expect(shareOf(ledger, 13, 'defense')).toBe(1);
  });
  it('snap caps for players back from injury', () => {
    const base = request();
    const bench = { ...base.bench, '1': day({ snapsThisGame: 20 }) };
    const l = chooseLineup({ ...base, bench, read: exactRead(bench), plan: { floor: 'normal', players: { '1': { snapCap: 20 } } } }, PRO, P);
    expect(l.players.find((f) => f.role === 'DT1')!.playerId).toBe(3);
  });
  it('B2 / B13.13.1: the defense against fast tempo may change only when the offense substituted and the match window applies', () => {
    expect(defenseMaySubstitute(false, false, PRO)).toBe(true);
    expect(defenseMaySubstitute(true, false, PRO)).toBe(false);
    expect(defenseMaySubstitute(true, true, PRO)).toBe(PRO.bool('substitution.match_window'));
    expect(defenseMaySubstitute(true, true, COLLEGE)).toBe(COLLEGE.bool('substitution.match_window'));
  });
});

describe('D10.6.1 staff read', () => {
  it('is deterministic by key and its error shrinks with staff quality', () => {
    const bench: Bench = {};
    for (let i = 1; i <= 40; i++) bench[String(i)] = day({ freshness: 0.4 + (i % 10) * 0.05 });
    const at = { gameId: 5, playNumber: 17 };
    expect(staffReads(bench, 0, 0.5, at, STREAMS, P)).toEqual(staffReads(bench, 0, 0.5, at, STREAMS, P));
    const err = (q: number) => {
      let e = 0;
      for (let play = 0; play < 50; play++) {
        const r = staffReads(bench, 0, q, { gameId: 5, playNumber: play }, STREAMS, P);
        for (const id of Object.keys(bench)) e += Math.abs(r[id]! - bench[id]!.freshness);
      }
      return e;
    };
    expect(err(1)).toBeLessThan(err(0));
    expect(err(1)).toBeGreaterThan(0);
  });
});

describe('D10.2.1 conditioning', () => {
  it('acceptance: a player idle for 8 weeks falls to the floor region and regains 90 within 6 weeks of full work', () => {
    let c = 90;
    for (let w = 0; w < 8; w++) c = conditioningAfterWeek(c, 0, 100, P);
    expect(c).toBeLessThanOrEqual(57);
    expect(c).toBeGreaterThanOrEqual(P.num('bench.conditioning.floor'));
    let weeks = 0;
    while (c < 90 && weeks < 20) { c = conditioningAfterWeek(c, 1, 100, P); weeks++; }
    expect(weeks).toBeLessThanOrEqual(6);
  });
  it('full training brings a player from 60 to about 90 in about 5 weeks (the length of a camp)', () => {
    let c = 60;
    for (let w = 0; w < 5; w++) c = conditioningAfterWeek(c, 1, 100, P);
    expect(c).toBeGreaterThan(88);
    expect(c).toBeLessThan(92);
  });
});

describe('D10.3.1 weekly load and debt', () => {
  it('age factor: 1 under 28, 0.85 from 34', () => {
    expect(ageFactor(25, P)).toBe(1);
    expect(ageFactor(31, P)).toBeCloseTo(0.925, 12);
    expect(ageFactor(36, P)).toBe(0.85);
  });
  it('edge case: on a short week about 60 percent of Sunday debt remains after 4 days, about 41 percent after 7', () => {
    const left = (days: number) => {
      let d = 100;
      for (let i = 0; i < days; i++) d = debtAfterDay(d, 0, 1e9, { dayOff: false, ageRecoveryWeight: 1 }, P);
      return d / 100;
    };
    expect(left(4)).toBeCloseTo(0.60, 2);
    expect(left(7)).toBeCloseTo(0.41, 2);
  });
  it('acceptance: thresholds act on debt only; one very heavy day followed by rest never reaches overreached if debt stays under 35 percent', () => {
    const tol = 100;
    let debt = debtAfterDay(0, tol / 7 + 30, tol, { dayOff: false, ageRecoveryWeight: 1 }, P);
    expect(debtBand(debt, tol, P)).toBe('heavy');
    for (let i = 0; i < 7; i++) {
      debt = debtAfterDay(debt, 0, tol, { dayOff: true, ageRecoveryWeight: 1 }, P);
      expect(debtBand(debt, tol, P)).not.toBe('overreached');
    }
  });
  it('acceptance: a team in full pads every day reaches the overreached band by week 3 and starts game days less fresh than a control', () => {
    // FIXTURE schedule: four weeks of a normal week, then either full pads every day or the same normal week.
    const normalWeek = [{ gameSnaps: 60 }, {}, { teamReps: 40, individualMinutes: 20 }, { thudReps: 40, individualMinutes: 20 }, { teamReps: 40 }, { walkThroughReps: 60 }, {}];
    const padsDay = { liveReps: 60, individualMinutes: 20 };
    const run = (pads: boolean) => {
      const daily: number[] = [];
      let debt = 0, band = 'none' as ReturnType<typeof debtBand>, firstOverreachedWeek: number | null = null, lowestStart = 1;
      for (let week = 0; week < 7; week++) { // 4 normal weeks, then 3 test weeks
        for (let d = 0; d < 7; d++) {
          const act = week >= 4 && pads ? padsDay : normalWeek[d]!;
          const load = dayLoad(act, P);
          const tol = weeklyTolerance(chronicLoad(daily), 26, 90, P);
          debt = debtAfterDay(debt, load, tol, { dayOff: Object.keys(act).length === 0, ageRecoveryWeight: 1 }, P);
          daily.push(load);
          band = debtBand(debt, weeklyTolerance(chronicLoad(daily), 26, 90, P), P);
          if (firstOverreachedWeek === null && (band === 'overreached' || band === 'run_down')) firstOverreachedWeek = week - 4 + 1;
          lowestStart = Math.min(lowestStart, startingLongTerm({ conditioning: 90, band, wear: 0, bodyClockKickoffHour: 13 }, P));
        }
      }
      return { band, firstOverreachedWeek, lowestStart };
    };
    const pads = run(true), control = run(false);
    expect(pads.firstOverreachedWeek).not.toBeNull();
    expect(pads.firstOverreachedWeek!).toBeLessThanOrEqual(3);
    expect(control.firstOverreachedWeek).toBeNull();
    expect(pads.lowestStart).toBeLessThan(control.lowestStart);
    // As written, D10.3.1 tolerance follows chronic load, so a body adapts: by the end of the third week of
    // daily pads the debt has cleared again. Reported to the D10 writer; the leaf does not say it persists.
    expect(pads.band).toBe('none');
  });
});

describe('D10.4.1 season wear', () => {
  it('acceptance: a back at the 99th percentile of carries shows wear near 1 by the last weeks, a rotational back none', () => {
    // FIXTURE: a position 80th-percentile season load of 1,000 units.
    expect(seasonWear({ load: 900, contactLoad: 400, p80: 1000, byeWeeks: 0 }, P)).toBeGreaterThanOrEqual(0.95);
    expect(seasonWear({ load: 400, contactLoad: 100, p80: 1000, byeWeeks: 0 }, P)).toBe(0);
  });
  it('a bye week removes 0.1 of wear and wear lowers starting freshness by up to 6 percent', () => {
    expect(seasonWear({ load: 1000, contactLoad: 0, p80: 1000, byeWeeks: 1 }, P)).toBeCloseTo(0.4, 12);
    expect(gameDayFatigue({ conditioning: 88, band: 'none', wear: 1, bodyClockKickoffHour: 13 }, P)).toEqual({ freshness: 0.94, freshnessLongTerm: 0.94, conditioning: 88 });
  });
});
