// G-56 depth chart and roles. Acceptance (plans/game-build-plan.md G-56): packages, rotations, special
// teams units, position battles per M2. Each describe names the bible leaf whose acceptance line it
// checks; params.json `constrainedBy` points at these test names.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DepthChartRecord, TuningParam } from '@gm/schema';
import {
  P, PARAMS, RULE_KEYS, alignmentAllowed, battleAfterInjury, battleCard, battleClock, changeAllowedAfterLock, choosePackage, decideBattle,
  defaultShare, developmentSwapIn, draftGameDay, emergencyKnowledge, emergencyWarnings, fillSituational, healthyScratchStreaks, holderForNextSnap,
  installCost, limitInSnaps, lineShort, lineupFor, lowValueBackups, medicalSuggestion, mustComeOff, packageLineup, plannedVersusActual,
  promiseFromTalk, redshirtStatus, replaceInjured, resolveUnit, roleChanges, roleOf, situationalBack, slowOperation, specialTeamsCounts,
  specialTeamsLoad, staffDefaultAlignment, staffShares, starterCapProblems, talkOutcome, timingPenalty, toEnginePlan, toRecordRotation,
  toRecords, toSimDepth, unfilledSituational, unitDef, unitSide, unitsFromRecords, validateChart, waveDue,
  type Battle, type RoleInput, type RotationRule, type RotationState,
} from '../../src/depth/index.ts';
import { COLLEGE_RULES, DEFS, ROSTER, RULES, chart, limitFor, people } from './fixture.ts';

const all = () => true;
const PLAN = ['off:11', 'off:12', 'def:base', 'def:nickel', 'def:dime', 'st:punt', 'st:kickoff', 'st:field_goal'];
const onRoster = (id: number) => ROSTER.includes(id);

describe('params and keys', () => {
  it('every row parses, names a leaf and a test in this file', () => {
    const text = readFileSync(new URL('./depth.test.ts', import.meta.url), 'utf8');
    for (const p of PARAMS.params) {
      TuningParam.parse(p);
      expect(p.value, p.name).toBeGreaterThanOrEqual(p.min);
      expect(p.value, p.name).toBeLessThanOrEqual(p.max);
      const m = /Test "([^"]+)"/.exec(p.constrainedBy);
      expect(m, p.name).not.toBeNull();
      expect(text.includes(`'${m![1]}'`), `${p.name} -> ${m![1]}`).toBe(true);
    }
    expect(RULE_KEYS.map((k) => k.key)).toContain('substitution.max_players');
  });
});

describe('chart: units and validation (M2.1.1)', () => {
  it('unit ids are namespaced off:, def:, st: (W-G70-1)', () => {
    expect(unitSide('st:punt')).toBe('st');
    expect(unitSide('def:nickel')).toBe('def');
    expect(() => unitSide('special:punt')).toThrow();
  });
  it('every unit in the plan yields 11 distinct players', () => {
    expect(validateChart(chart(), DEFS, PLAN, RULES, onRoster)).toEqual([]);
    for (const u of PLAN) expect(Object.keys(packageLineup(chart(), DEFS, u, all).lineup)).toHaveLength(11);
  });
  it('validation lists every failing unit: a player first at two jobs, an empty column, a short unit', () => {
    const c = chart();
    const bad = { ...c, units: { ...c.units, 'off:11': { ...c.units['off:11']!, Z: [20], SLOT: [] } } };
    const problems = validateChart(bad, DEFS, ['off:11'], RULES, onRoster);
    expect(problems.some((p) => p.message.includes('first at X and Z'))).toBe(true);
    expect(problems.some((p) => p.message.includes('SLOT: empty column'))).toBe(true);
    expect(problems.some((p) => p.message.includes('yields 9 distinct players'))).toBe(true);
  });
  it('a package inherits base jobs it does not set and marks them inherited (M2.2.1 rule 2)', () => {
    const r = resolveUnit(chart(), DEFS, 'def:nickel');
    expect(r.lists.NB).toEqual([74, 75]);
    expect(r.lists.LE).toEqual([50, 54]);
    expect(r.inherited).toContain('LE');
    expect(r.inherited).not.toContain('NB');
  });
  it('after the list locks only active players may be added (rule 4)', () => {
    const before = chart().units['off:11']!;
    expect(changeAllowedAfterLock(before, { ...before, X: [23, 20] }, (id) => id !== 26)).toBe(true);
    expect(changeAllowedAfterLock(before, { ...before, X: [26, 20] }, (id) => id !== 26)).toBe(false);
  });
  it('engine depth map and world rows round-trip', () => {
    const sim = toSimDepth(chart(), DEFS, ['off:11', 'def:nickel'], (id) => id !== 23);
    expect(sim.X).toEqual([20]);
    expect(sim.NB).toEqual([74, 75]);
    const rotation = toRecordRotation([{ unitId: 'off:11', job: 'RB', personIds: [10, 11], shares: [0.65, 0.35], change: 'series', starterIn: [] }]);
    const rows = toRecords(chart(), { seasonYear: 2026, dayIndex: 250 }, (u) => (u === 'off:11' ? rotation : []));
    for (const r of rows) expect(DepthChartRecord.safeParse(r).success, r.unitId).toBe(true);
    expect(rows.find((r) => r.unitId === 'off:11')!.rotation).toHaveLength(2);
    expect(unitsFromRecords(rows, 7)['st:punt']).toEqual(chart().units['st:punt']);
  });
});

describe('cascade: line slide', () => {
  it('a tackle injury slides the guard out and the backup guard enters (M2.1.3 rule 1)', () => {
    const c = chart();
    const { lineup } = lineupFor(resolveUnit(c, DEFS, 'off:11'), all);
    const r = replaceInjured(c, DEFS, 'off:11', lineup, 'LT', (id) => id !== 40, people());
    expect(r.how).toBe('cascade');
    expect(r.lineup.LT).toBe(41);
    expect(r.lineup.LG).toBe(46);
    expect(new Set(Object.values(r.lineup)).size).toBe(11);
  });
  it('centre and backup centre out: the card or best line-capable fit, logged when unplanned', () => {
    const c = chart();
    const { lineup } = lineupFor(resolveUnit(c, DEFS, 'off:11'), all);
    const r = replaceInjured(c, DEFS, 'off:11', lineup, 'C', (id) => id !== 42 && id !== 46, people());
    expect(r.how).toBe('emergency_card');
    expect(r.lineup.C).toBe(47);
    const none = replaceInjured({ ...c, emergency: {} }, DEFS, 'off:11', lineup, 'C', (id) => ![42, 46, 45, 47, 48].includes(id), people());
    expect(none.how).toBe('best_fit');
    expect(none.logged).toMatch(/no planned replacement/);
  });
  it('any single active player out mid-game leaves a legal 11 in every unit without user input', () => {
    const c = chart();
    for (const unitId of PLAN) {
      const { lineup } = packageLineup(c, DEFS, unitId, all);
      for (const [job, out] of Object.entries(lineup)) {
        const r = replaceInjured(c, DEFS, unitId, lineup, job, (id) => id !== out, people());
        expect(Object.keys(r.lineup), `${unitId} ${job}`).toHaveLength(11);
        expect(new Set(Object.values(r.lineup)).size).toBe(11);
        expect(Object.values(r.lineup)).not.toContain(out);
      }
    }
  });
  it('line-capable count below the minimum is flagged', () => {
    const { lineup } = lineupFor(resolveUnit(chart(), DEFS, 'off:11'), all);
    expect(lineShort(lineup, people())).toBe(false);
    expect(lineShort({ ...lineup, LT: 20, LG: 21, C: 22 }, people())).toBe(true);
  });
});

describe('cascade: emergency card', () => {
  it('warns for an unnamed need, an inactive name, and a name short of practice reps', () => {
    const c = chart();
    const reps = { quarterback: 9, long_snapper: 9, holder: 9, kicker: 9, punter: 9, sixth_lineman: 9, seventh_lineman: 9 };
    const ppl = people(Object.fromEntries([3, 30, 1, 91, 90, 47, 48].map((id) => [id, { emergencyReps: reps }])));
    expect(emergencyWarnings(c, ppl, all)).toEqual([]);
    const w = emergencyWarnings({ ...c, emergency: { ...c.emergency, holder: undefined } }, people(), (id) => id !== 3);
    expect(w.some((p) => p.message === 'no emergency holder named')).toBe(true);
    expect(w.some((p) => p.message.includes('quarterback 3 is not active'))).toBe(true);
    expect(w.some((p) => p.message.includes('fewer than 5 practice reps'))).toBe(true);
  });
  it('an emergency player short of reps plays at the knowledge penalty', () => {
    const p = people({ 1: { emergencyReps: { holder: P('emergency.minReps') - 1 } } }).get(1)!;
    expect(emergencyKnowledge(p, 'holder')).toBe(P('emergency.untrainedKnowledge'));
    expect(emergencyKnowledge({ ...p, emergencyReps: { holder: P('emergency.minReps') } }, 'holder')).toBe(1);
  });
});

describe('game day: staff draft', () => {
  it('48 with 8 linemen, starters and core special teams firsts dressed, minimums met', () => {
    const d = draftGameDay({ chart: chart(), defs: DEFS, plan: PLAN, candidates: ROSTER, people: people(), limitFor });
    expect(d.actives).toHaveLength(48);
    expect(d.limit).toBe(48);
    expect(d.inactives).toHaveLength(ROSTER.length - 48);
    for (const id of [1, 10, 20, 40, 50, 60, 70, 90, 91, 92, 63, 76]) expect(d.actives).toContain(id);
    expect(d.actives.filter((id) => people().get(id)!.group === 'ol').length).toBeGreaterThanOrEqual(P('gameday.min.ol'));
  });
  it('with 7 healthy linemen the limit shown is 47, and ruled-out players are inactive first', () => {
    const ppl = people({ 40: { out: true }, 41: { out: true } });
    const d = draftGameDay({ chart: chart(), defs: DEFS, plan: PLAN, candidates: ROSTER, people: ppl, limitFor });
    expect(d.limit).toBe(47);
    expect(d.actives).toHaveLength(47);
    expect(d.inactives.filter((i) => i.reason === 'ruled_out').map((i) => i.personId).sort()).toEqual([40, 41]);
    expect(d.warnings.some((w) => w.message.startsWith('7 ol dressed'))).toBe(true);
  });
  it('a healthy scratch three weeks running is counted for the role-expectation event (rule 5)', () => {
    const w = draftGameDay({ chart: chart(), defs: DEFS, plan: PLAN, candidates: ROSTER, people: people(), limitFor });
    const streaks = healthyScratchStreaks([w, w, w]);
    const scratched = w.inactives[0]!.personId;
    expect(streaks.get(scratched)).toBe(3);
  });
});

describe('packages (M2.2.1)', () => {
  it('trigger order: call, then personnel read, then down and distance, then base', () => {
    const d = { down: 3, toGo: 8, yardsToGoal: 60 };
    expect(choosePackage('def', DEFS, PLAN, { ...d, call: 'def:base', personnelRead: '11' })).toBe('def:base');
    expect(choosePackage('def', DEFS, PLAN, { ...d, personnelRead: '11' })).toBe('def:nickel');
    expect(choosePackage('def', DEFS, PLAN, { ...d, personnelRead: '21' })).toBe('def:dime');
    expect(choosePackage('def', DEFS, PLAN, { down: 1, toGo: 10, yardsToGoal: 60, personnelRead: '21' })).toBe('def:base');
    expect(choosePackage('off', DEFS, PLAN, { down: 1, toGo: 10, yardsToGoal: 60, situations: ['four_minute'] })).toBe('off:12');
  });
  it('an inactive package player falls back job by job to the base mapping', () => {
    const r = packageLineup(chart(), DEFS, 'def:nickel', (id) => id !== 74 && id !== 75);
    expect(r.lineup.NB).toBe(60);
    expect(r.fellBack).toEqual(['NB']);
    expect(Object.keys(r.lineup)).toHaveLength(11);
  });
});

describe('situational: triggers', () => {
  it('third and long uses the third-down back; short yardage and goal line the short-yardage back', () => {
    expect(situationalBack({ down: P('sit.thirdDown'), toGo: P('sit.thirdDownBackMinToGo'), yardsToGoal: 50 })).toBe('third_down_back');
    expect(situationalBack({ down: 1, toGo: 10, yardsToGoal: 50, situations: ['two_minute'] })).toBe('third_down_back');
    expect(situationalBack({ down: P('sit.fourthDown'), toGo: 1, yardsToGoal: 50 })).toBe('short_yardage_back');
    expect(situationalBack({ down: 1, toGo: 1, yardsToGoal: P('sit.goalLineYardLine') })).toBe('short_yardage_back');
    expect(situationalBack({ down: 1, toGo: 10, yardsToGoal: 50 })).toBeNull();
  });
});

describe('situational: fill', () => {
  it('named players first, the fallback after; unnamed roles are listed for I1', () => {
    const c = chart();
    expect(fillSituational(c, 'third_down_back', 1, [10], all).players).toEqual([11]);
    const hurt = fillSituational(c, 'third_down_back', 1, [10], (id) => id !== 11);
    expect(hurt.players).toEqual([10]);
    expect(hurt.replaced).toEqual([11]);
    const hands = fillSituational(c, 'hands_team', P('sit.handsTeamSize'), [20, 21, 22, 23, 24, 25, 30, 31, 70, 71, 72, 73], all);
    expect(hands.players).toHaveLength(11);
    expect(hands.unfilled).toBe(true);
    expect(unfilledSituational(c, ['third_down_back', 'kneel_down']).map((p) => p.message)).toEqual(['kneel down: nobody named, the base chart covers it']);
  });
});

describe('rotation: staff default shares', () => {
  it('depth ranks get the real-data shares; line and quarterback do not rotate', () => {
    const s = staffShares(chart(), DEFS, 'off:11');
    expect(s.get(10)).toBe(P('share.rb.r1'));
    expect(s.get(11)).toBe(P('share.rb.r2'));
    expect(s.get(20)).toBe(P('share.wr.r1'));
    expect(s.get(1)).toBe(1);
    expect(s.get(2)).toBeUndefined();
    expect(s.get(40)).toBe(1);
    expect(defaultShare('ol', 1)).toBeNull();
    expect(defaultShare('db', 9)).toBe(0);
    const d = staffShares(chart(), DEFS, 'def:base');
    expect(d.get(50)).toBe(P('share.dl.r1'));
    expect(d.get(70)).toBe(P('share.db.r1'));
  });
  it('the engine plan carries shares below one and snap caps', () => {
    const plan = toEnginePlan(new Map([[10, 0.65], [1, 1]]), new Map([[11, 30]]));
    expect(plan.players['10']).toEqual({ targetShare: 0.65 });
    expect(plan.players['1']).toEqual({});
    expect(plan.players['11']).toEqual({ snapCap: 30 });
    const rows = toRecordRotation([{ unitId: 'off:11', job: 'RB', personIds: [10, 11], shares: [0.65, 0.35], change: 'series', starterIn: [] }]);
    expect(rows[1]).toEqual({ role: 'RB', personIds: [11], ruleKey: 'rotation.by_series', share: 0.35 });
  });
});

describe('rotation: by play', () => {
  const rule: RotationRule = { unitId: 'off:11', job: 'RB', personIds: [10, 11], shares: [0.6, 0.4], change: 'play', starterIn: ['third_down'] };
  const base: RotationState = { unitSnaps: 0, playerSnaps: {}, recent: [], cue: {}, startOfPossession: false, situations: [], medicalOut: new Set() };
  it('over a game the actual shares land within the tolerance of target', () => {
    let current = 10;
    const snaps: Record<string, number> = {};
    const recent: number[] = [];
    const n = P('limits.expectedOffSnaps');
    for (let i = 0; i < n; i++) {
      current = holderForNextSnap(rule, current, { ...base, unitSnaps: i, playerSnaps: snaps, recent });
      snaps[String(current)] = (snaps[String(current)] ?? 0) + 1;
      recent.push(current);
    }
    const pv = plannedVersusActual(new Map([[10, 0.6], [11, 0.4]]), snaps, n);
    expect(pv.every((r) => r.within)).toBe(true);
  });
  it('exceptions: medical limit first, then the starter stays in on third down', () => {
    expect(holderForNextSnap(rule, 11, { ...base, recent: [11, 11, 11], situations: ['third_down'] })).toBe(10);
    expect(holderForNextSnap(rule, 10, { ...base, situations: ['third_down'], medicalOut: new Set([10]) })).toBe(11);
  });
  it('by series swaps only at the start of a possession; by fatigue reads the cue', () => {
    const series = { ...rule, change: 'series' as const };
    expect(holderForNextSnap(series, 10, { ...base, unitSnaps: 10, playerSnaps: { '10': 10 } })).toBe(10);
    expect(holderForNextSnap(series, 10, { ...base, unitSnaps: 10, playerSnaps: { '10': 10 }, startOfPossession: true })).toBe(11);
    const fat = { ...rule, change: 'fatigue' as const };
    expect(holderForNextSnap(fat, 10, { ...base, cue: { '10': true } })).toBe(11);
    expect(holderForNextSnap(fat, 10, { ...base, cue: { '10': true, '11': true } })).toBe(10);
  });
});

describe('rotation: waves', () => {
  it('the second wave comes on after the wave length or at a series end', () => {
    expect(waveDue(P('rotation.waveLengthSnaps') - 1, false)).toBe(false);
    expect(waveDue(P('rotation.waveLengthSnaps'), false)).toBe(true);
    expect(waveDue(1, true)).toBe(true);
  });
});

describe('limits: kinds convert', () => {
  it('snap, share and series limits convert by expected snaps; a limit of 30 never allows a 31st', () => {
    expect(limitInSnaps({ kind: 'snaps', value: 30, medical: false }, 'off')).toBe(30);
    expect(limitInSnaps({ kind: 'share', value: 0.5, medical: false }, 'def')).toBe(Math.floor(0.5 * P('limits.expectedDefSnaps')));
    expect(limitInSnaps({ kind: 'series', value: 3, medical: false }, 'off')).toBe(3 * P('limits.expectedSnapsPerSeries'));
    const lim = { kind: 'snaps' as const, value: 30, medical: false };
    const ctx = { snapsThisGame: 30, seriesThisGame: 5, twoMinuteDrive: false, override: false };
    expect(mustComeOff(lim, 'off', { ...ctx, snapsThisGame: 29 })).toBe(false);
    expect(mustComeOff(lim, 'off', ctx)).toBe(true);
    expect(mustComeOff(lim, 'off', { ...ctx, override: true })).toBe(false);
    expect(mustComeOff(lim, 'off', { ...ctx, twoMinuteDrive: true })).toBe(false);
    expect(mustComeOff({ ...lim, medical: true }, 'off', { ...ctx, twoMinuteDrive: true })).toBe(true);
  });
});

describe('limits: medical suggestion', () => {
  it('half the usual share in the first game back, three quarters in the second, then none', () => {
    expect(medicalSuggestion(1, 0.8)!.value).toBeCloseTo(0.8 * P('limits.medicalFirstGame'));
    expect(medicalSuggestion(2, 0.8)!.value).toBeCloseTo(0.8 * P('limits.medicalSecondGame'));
    expect(medicalSuggestion(3, 0.8)).toBeNull();
  });
});

describe('limits: development minimum', () => {
  it('a minimum of 10 is met when the margin is above 14', () => {
    let snaps = 0;
    for (let play = 0; play < 60 && developmentSwapIn(10, snaps, P('limits.developmentMargin') + 1, false); play++) snaps++;
    expect(snaps).toBe(10);
    expect(developmentSwapIn(10, 0, 3, false)).toBe(false);
  });
});

describe('limits: redshirt tracker (M2.3.2 rule 4)', () => {
  it('four appearances warn before any snap in a fifth regular-season game; postseason does not count', () => {
    const s = redshirtStatus({ regular: 4, postseason: 0 }, false, false, COLLEGE_RULES)!;
    expect(s.warnBeforeSnap).toBe(true);
    expect(s.seasonUsed).toBe(false);
    expect(redshirtStatus({ regular: 4, postseason: 1 }, false, true, COLLEGE_RULES)!.warnBeforeSnap).toBe(false);
    expect(redshirtStatus({ regular: 3, postseason: 0 }, false, false, COLLEGE_RULES)!.warnBeforeSnap).toBe(false);
    expect(redshirtStatus({ regular: 4, postseason: 0 }, false, false, RULES)).toBeNull();
  });
});

describe('special teams: staff draft', () => {
  it('every unit resolves to 11; no starter first on more than the cap', () => {
    const c = chart();
    for (const u of ['st:punt', 'st:kickoff', 'st:field_goal']) expect(Object.keys(lineupFor(resolveUnit(c, DEFS, u), all).lineup)).toHaveLength(11);
    const starters = new Set([1, 10, 20, 21, 22, 30, 40, 41, 42, 43, 44, 50, 51, 52, 53, 60, 61, 62, 70, 71, 72, 73]);
    expect(starterCapProblems(c, DEFS, starters)).toEqual([]);
    const greedy = { ...c, units: { ...c.units, 'st:punt': { ...c.units['st:punt']!, PP: [30] }, 'st:kickoff': { ...c.units['st:kickoff']!, R5: [30] } } };
    expect(starterCapProblems(greedy, DEFS, starters).map((p) => p.message)).toEqual(['starter 30 is first on 3 core units; the staff limit is 2']);
  });
  it('special teams counts and low-value backups', () => {
    const counts = specialTeamsCounts(chart(), DEFS);
    expect(counts.get(63)).toBe(2);
    expect(counts.get(90)).toBe(2);
    expect(lowValueBackups([26, 63, 1], new Set([1]), counts)).toEqual([26]);
  });
});

describe('special teams: load', () => {
  it('coverage snaps weigh more than kicking snaps', () => {
    expect(specialTeamsLoad(unitDef(DEFS, 'st:punt'))).toBe(P('st.loadCoverage'));
    expect(specialTeamsLoad(unitDef(DEFS, 'st:field_goal'))).toBe(P('st.loadKicking'));
    expect(specialTeamsLoad({ unitId: 'st:punt_return', jobs: [] })).toBe(P('st.loadOther'));
  });
});

describe('specialists: shared timing', () => {
  it('full penalty in week one, half in week two, a quarter in week three, none after', () => {
    const w1 = timingPenalty(1, 0), w2 = timingPenalty(2, 0), w3 = timingPenalty(3, 0);
    expect(w1.meanS).toBeCloseTo(P('spec.penaltyMeanS'));
    expect(w2.meanS).toBeCloseTo(w1.meanS / 2);
    expect(w3.meanS).toBeCloseTo(w1.meanS / 4);
    expect(timingPenalty(4, 0)).toEqual({ meanS: 0, sdS: 0 });
    expect(timingPenalty(1, 1).meanS).toBeCloseTo(w1.meanS * (1 - P('spec.practiceRemoval')));
  });
});

describe('specialists: slow marks', () => {
  it('marks operations over the starting thresholds', () => {
    expect(slowOperation('field_goal', 1.3)).toBe(false);
    expect(slowOperation('field_goal', 1.45)).toBe(true);
    expect(slowOperation('punt', 2.2)).toBe(true);
  });
});

describe('battles: weighted evidence', () => {
  const b: Battle = { unitId: 'off:11', job: 'QB', competitors: [1, 2], split: [0.5, 0.5], decideBy: 200, openedOn: 180 };
  it('relabelling the same reps as against third-team opponents changes the weighted grade, not the raw', () => {
    const ev = [{ personId: 1, grade: 80, reps: 10, against: 'first' as const }, { personId: 1, grade: 60, reps: 10, against: 'second' as const }];
    const a = battleCard(b, ev)[0]!;
    const c = battleCard(b, [ev[0]!, { ...ev[1]!, against: 'third' as const }])[0]!;
    expect(a.raw).toBe(c.raw);
    expect(a.weighted).not.toBe(c.weighted);
    expect(battleCard(b, ev)[1]!.weighted).toBeNull();
  });
  it('the decision writes the winner first; an injury ends a two-man battle', () => {
    expect(decideBattle(chart(), b, 2).units['off:11']!.QB).toEqual([2, 1]);
    expect(battleAfterInjury(b, 1)).toEqual({ winner: 2 });
  });
});

describe('battles: deadlines', () => {
  it('late past the stated date; readiness penalty inside the deadline before the opener', () => {
    const b: Battle = { unitId: 'off:11', job: 'QB', competitors: [1, 2], split: [0.5, 0.5], decideBy: 200, openedOn: 180 };
    expect(battleClock(b, 201, 230)).toEqual({ late: true, readinessPenalty: false });
    expect(battleClock(b, 230 - P('battle.readinessDeadlineDays'), 230).readinessPenalty).toBe(true);
  });
});

describe('roles: labels', () => {
  const r = (over: Partial<RoleInput>): RoleInput => ({ person: people().get(20)!, plannedShare: 0, packageOrSituational: false, coreUnitsFirst: 0, active: true, inactiveMostWeeks: false, ...over });
  it('a planned share drop from 70% to 40% labels a rotation player', () => {
    expect(roleOf(r({ plannedShare: 0.7 }))).toBe('starter');
    expect(roleOf(r({ plannedShare: 0.4 }))).toBe('rotation');
    expect(roleOf(r({ plannedShare: 0.1, packageOrSituational: true }))).toBe('package_specialist');
    expect(roleOf(r({ coreUnitsFirst: 2 }))).toBe('core_special_teams');
    expect(roleOf(r({}))).toBe('developmental');
    expect(roleOf(r({ active: false, inactiveMostWeeks: true }))).toBe('scout_team');
    expect(roleOf(r({ active: false, inactiveMostWeeks: true, person: { ...people().get(20)!, service: 1 } }))).toBe('developmental');
    expect(roleOf(r({ person: { ...people().get(20)!, practiceSquad: true } }))).toBe('scout_team');
  });
});

describe('roles: change events', () => {
  it('a starter moved to second always generates an event with a delivery choice', () => {
    const before = chart();
    const after = decideBattle(before, { unitId: 'off:11', job: 'QB', competitors: [1, 2], split: [0.5, 0.5], decideBy: 0, openedOn: 0 }, 2);
    const ev = roleChanges(before, after, new Map([[1, 'starter'], [2, 'developmental']]), new Map([[1, 'starter'], [2, 'starter']]));
    const e1 = ev.find((e) => e.personId === 1)!;
    expect(e1.cause).toBe('demoted');
    expect(e1.lostFirsts).toEqual(['off:11/QB']);
    expect(e1.deliveries).toContain('head_coach');
    expect(ev.find((e) => e.personId === 2)!.cause).toBe('threshold');
  });
  it('publishing first counts as learned from the media; a stated condition makes a promise', () => {
    expect(talkOutcome('head_coach', true)).toEqual({ coachMinutes: 0, learnedFrom: 'media' });
    expect(talkOutcome('head_coach', false)).toEqual({ coachMinutes: P('roles.inPersonMinutes'), learnedFrom: 'head_coach' });
    expect(talkOutcome('none', false).learnedFrom).toBe('chart');
    expect(promiseFromTalk(1, 'win it back in practice', 250)).toEqual({ personId: 1, condition: 'win it back in practice', reviewOn: 250 });
    expect(promiseFromTalk(1, '  ', 250)).toBeNull();
  });
});

describe('alignment: rules', () => {
  it('install costs, shadow for corners only, staff defaults by hash width', () => {
    expect(installCost('sides')).toBe(0);
    expect(installCost('strength')).toBe(P('align.installCost.strength'));
    expect(alignmentAllowed({ pair: 'safeties', rule: 'shadow', shadowTarget: 9 })).toBe(false);
    expect(alignmentAllowed({ pair: 'corners', rule: 'shadow', shadowTarget: 9 })).toBe(true);
    expect(staffDefaultAlignment('corners', true)).toBe('field_boundary');
    expect(staffDefaultAlignment('tackles_ends', true)).toBe('sides');
    expect(staffDefaultAlignment('corners', false)).toBe('sides');
  });
});
