// G-55 acceptance: every rung's duty list exists as data and can be performed in a headless run (S1.3, S3).
import { describe, expect, it } from 'vitest';
import { stream, seedFromNumber } from '@gm/engine-core';
import { ParamFile, RuleKeyManifest, scanForbiddenJson } from '@gm/schema';
import dutiesJson from '../../src/ladder/duties.json' with { type: 'json' };
import matrixJson from '../../src/ladder/matrix.json' with { type: 'json' };
import pathsJson from '../../src/ladder/paths.json' with { type: 'json' };
import { CATALOGUE, RUNGS_BY_LEVEL, fillSeat, generateStaff, limitsFrom, type CatalogueLevel, type CatalogueRow } from '../../src/positions/index.ts';
import {
  BANDS, DUTIES, LADDER_EVENT_TYPES, PARAMS, PATH_TARGETS, RULE_KEYS, aiWorker, bandOf, buildDutyCatalogue, dutyList, fixedJudge,
  performDuties, runStaffWeek, syntheticTruth, weekScreen, hasTruthPart, emptyBandsOf, seatDutyList, checkPaths,
} from '../../src/ladder/index.ts';

const rng = (seed: number, name = 'career.ladder.test') => stream(seedFromNumber(seed), name, []);
const ladderSeats = (level: CatalogueLevel) => CATALOGUE.jobsAt(level).filter((j) => j.onStaff && j.dutyIds.length > 0);
const flagsFor = (j: CatalogueRow) => ({ callsPlays: j.callsPlaysEligible && (j.rung ?? 0) >= 7, hasRosterSay: false });

describe('duty data (S3.1.1)', () => {
  it('parses, has a duty for every S3 leaf, and every seat duty id in the job catalogue exists', () => {
    const leaves = ['S3.2.1', 'S3.2.2', 'S3.2.3', 'S3.3.1', 'S3.3.2', 'S3.3.3', 'S3.3.4', 'S3.4.1', 'S3.4.2', 'S3.4.3', 'S3.4.4', 'S3.4.5',
      'S3.5.1', 'S3.5.2', 'S3.5.3', 'S3.5.4', 'S3.5.5', 'S3.5.6', 'S3.5.7', 'S3.6.1', 'S3.6.2', 'S3.6.3', 'S3.7.1'];
    for (const l of leaves) expect(DUTIES.duties.some((d) => d.leaf === l), l).toBe(true);
    for (const j of CATALOGUE.jobs) for (const id of j.dutyIds) expect(DUTIES.has(id), `${j.id} ${id}`).toBe(true);
  });
  it('the matrix holds the 19 S3.1.1 rows across the seven bands, plus the S3.6.3 row', () => {
    expect(DUTIES.families).toHaveLength(20);
    expect(matrixJson.bands).toEqual([...BANDS]);
    expect(DUTIES.family('play_calling').cells['7']).toBe('O_or_R');
    expect(DUTIES.family('personnel_reports').cells['8-9']).toBe('by_power');
  });
  it('rejects a broken file at content build', () => {
    const bad = { ...dutiesJson, duties: [...dutiesJson.duties, { ...dutiesJson.duties[0], id: 'duty:S3.2.1' }] };
    expect(() => buildDutyCatalogue(bad, matrixJson)).toThrow(/duplicate duty/);
    expect(() => buildDutyCatalogue({ duties: [{ ...dutiesJson.duties[0], family: 'nope' }] }, matrixJson)).toThrow(/unknown family/);
  });
  it('content and manifests pass the schema and the forbidden-key scan', () => {
    ParamFile.parse(PARAMS);
    RuleKeyManifest.parse(RULE_KEYS);
    expect(LADDER_EVENT_TYPES.length).toBeGreaterThan(0);
    for (const [n, f] of [['duties.json', dutiesJson], ['matrix.json', matrixJson], ['paths.json', pathsJson]] as const) expect(scanForbiddenJson(n, f)).toEqual([]);
  });
});

describe('every rung has a playable duty list (S3.1.1 acceptance)', () => {
  for (const level of ['college', 'pro'] as const) {
    it(`${level}: each rung 1 to 9 the level offers lists at least three game-week duties, each opening a tool`, () => {
      const rungs = new Set<number>();
      for (const j of ladderSeats(level)) {
        if (j.rung === null) continue;
        rungs.add(j.rung);
        const week = weekScreen(dutyList({ job: j, level, flags: flagsFor(j) }), 'game', new Set(['duty:S3.5.7']));
        expect(week.length, j.id).toBeGreaterThanOrEqual(3);
        for (const a of week) expect(a.duty.tool.length, a.duty.id).toBeGreaterThan(0);
      }
      expect([...rungs].sort((a, b) => a - b)).toEqual(RUNGS_BY_LEVEL[level].filter((r) => r > 0));
    });
    it(`${level}: every seat's duties are performed headless with a product per duty and truth grades where the engine knows the answer`, () => {
      const s = rng(level === 'college' ? 1 : 2);
      for (const j of ladderSeats(level)) {
        const list = weekScreen(dutyList({ job: j, level, flags: flagsFor(j) }), 'game', new Set(['duty:S3.5.7']));
        const { products, hours } = performDuties(list, syntheticTruth(s), aiWorker(0.9, s), fixedJudge(70));
        expect(products).toHaveLength(list.length);
        expect(hours).toBeGreaterThan(0);
        for (const p of products) {
          if (p.ownership === 'observe') { expect(p.used).toBe(false); expect(p.grade).toBeNull(); continue; }
          if (p.grader === 'truth' || (p.grader === 'mixed' && hasTruthPart(p.kind))) { expect(p.grade, p.dutyId).not.toBeNull(); expect(p.grade!).toBeGreaterThan(0); }
          if (p.grader === 'outcome') expect(p.pending).toBe('outcome');
        }
      }
    });
  }
  it('rung 0 and off-ladder bosses list nothing', () => {
    expect(dutyList({ job: CATALOGUE.job('job:outside.student'), level: 'college' })).toEqual([]);
    expect(dutyList({ job: CATALOGUE.job('job:pro.owner'), level: 'pro' })).toEqual([]);
    expect(bandOf(0)).toBeNull();
  });
});

describe('ownership matrix cases', () => {
  const marks = (id: string, level: CatalogueLevel, flags = { callsPlays: false, hasRosterSay: false }) =>
    new Map(dutyList({ job: CATALOGUE.job(id), level, flags }).map((a) => [a.duty.id, a.ownership] as const));
  it('rung 1 observes film tagging that the graduate assistant owns', () => {
    expect(marks('job:college.student_video', 'college').get('duty:S3.3.1')).toBe('observe');
    expect(marks('job:college.graduate_assistant', 'college').get('duty:S3.3.1')).toBe('own');
    expect(marks('job:college.graduate_assistant', 'college').get('duty:S3.4.1')).toBe('recommend');
  });
  it('a coordinator owns play calling only when his seat calls plays', () => {
    expect(marks('job:pro.coordinator.offense', 'pro', { callsPlays: true, hasRosterSay: false }).get('duty:S3.6.2#play_calling')).toBe('own');
    expect(marks('job:pro.coordinator.offense', 'pro').get('duty:S3.6.2#play_calling')).toBe('recommend');
    expect(marks('job:pro.coordinator.offense', 'pro').get('duty:S3.6.2#hiring')).toBe('recommend');
  });
  it('a pro head coach owns personnel reports only with roster say (L5.2.1)', () => {
    expect(marks('job:pro.head_coach', 'pro').get('duty:S3.5.7')).toBe('recommend');
    expect(marks('job:pro.head_coach', 'pro', { callsPlays: true, hasRosterSay: true }).get('duty:S3.5.7')).toBe('own');
  });
  it('S3.7.1: every family marked O in the head coach column is owned by the head coach', () => {
    const m = marks('job:college.head_coach_top', 'college', { callsPlays: true, hasRosterSay: true });
    for (const f of DUTIES.families) if (f.cells['8-9'] === 'O') for (const d of DUTIES.dutiesOf(f.id, 'college')) expect(m.get(d.id), d.id).toBe('own');
  });
  it('college-only and pro-only duties stay at their level', () => {
    const pro = marks('job:pro.position_coach.qb', 'pro');
    expect(pro.has('duty:S3.5.5')).toBe(false);
    expect(pro.has('duty:S3.5.6')).toBe(false);
    expect(marks('job:college.position_coach.qb', 'college').has('duty:S3.5.7')).toBe(false);
  });
  it('short staff pushes duties down: a graduate assistant with no rung 3 to 5 above him coaches a position', () => {
    const job = CATALOGUE.job('job:college.graduate_assistant');
    const list = dutyList({ job, level: 'college', emptyBands: new Set(['3', '4-5'] as const) });
    const m = new Map(list.map((a) => [a.duty.id, a] as const));
    expect(m.get('duty:S3.5.1')?.ownership).toBe('own');
    expect(m.get('duty:S3.5.3')?.source).toBe('pushed_down');
    expect(m.get('duty:S3.4.1')?.fromBand).toBe('3');
    expect(dutyList({ job, level: 'college', emptyBands: new Set(['4-5'] as const) }).some((a) => a.source === 'pushed_down')).toBe(false);
  });
  it('the week screen shows seasonal work only off-season and per-request work only when requested', () => {
    const list = dutyList({ job: CATALOGUE.job('job:pro.head_coach'), level: 'pro', flags: { callsPlays: true, hasRosterSay: true } });
    expect(weekScreen(list, 'game').some((a) => a.duty.id === 'duty:S3.6.2#hiring')).toBe(false);
    expect(weekScreen(list, 'offseason').some((a) => a.duty.id === 'duty:S3.6.2#hiring')).toBe(true);
    expect(weekScreen(list, 'game').some((a) => a.duty.id === 'duty:S3.5.7')).toBe(false);
    expect(weekScreen(list, 'bye').some((a) => a.duty.cadence === 'per_game')).toBe(false);
  });
});

describe('headless staff week', () => {
  const staffOf = (level: CatalogueLevel, band: 'top' | 'low' = 'top') => {
    let staff = generateStaff({ teamId: 7, level, band, limits: limitsFrom(level === 'college' ? { 'staff.grad_assistants_max': 4, 'staff.offcampus_recruiters_max': 11, 'staff.strength_staff_max': 5, 'staff.student_assistants_max': 11 } : {}), firstSeatId: 1, date: { seasonYear: 2026, dayIndex: 10 } });
    for (const s of staff.seats) staff = fillSeat(staff, s.seatId, 1000 + s.seatId, { seasonYear: 2026, dayIndex: 1 });
    return staff;
  };
  const meta = { date: { seasonYear: 2026, dayIndex: 200 }, competitionId: null, tier: 1 as const, source: 'sim' as const };
  it('a full staff performs every listed duty, writes events, and two runs from one seed match exactly', () => {
    for (const level of ['college', 'pro'] as const) {
      const staff = staffOf(level);
      const run = (seed: number) => runStaffWeek({ staff, kind: 'game', truth: syntheticTruth(rng(seed, 'career.ladder.truth')), stream: rng(seed), judge: fixedJudge(65), meta });
      const a = run(11), b = run(11);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.seats.length).toBeGreaterThan(5);
      expect(a.events.some((e) => e.type === 'duty_graded')).toBe(true);
      const rungsWorked = new Set(a.seats.map((s) => staff.seats.find((x) => x.seatId === s.seatId)!.rung));
      for (const r of [2, 3, 5, 7, 9]) expect(rungsWorked.has(r), `${level} rung ${r}`).toBe(true);
    }
  });
  it('the user replaces one AI: his own worker produces his seat\'s products', () => {
    const staff = staffOf('college');
    const ga = staff.seats.find((s) => s.catalogueId === 'job:college.graduate_assistant')!;
    const perfect = aiWorker(1, rng(5));
    const out = runStaffWeek({ staff, kind: 'game', truth: syntheticTruth(rng(3)), stream: rng(4), judge: null, meta, user: { seatId: ga.seatId, worker: perfect } });
    const tag = out.seats.find((s) => s.seatId === ga.seatId)!.result.products.find((p) => p.dutyId === 'duty:S3.3.1')!;
    expect(tag.grade).toBeCloseTo(100, 6);
    expect(tag.used).toBe(true);
  });
  it('a full top staff is not short-staffed; head coach rungs 8 and 9 count as one band', () => {
    const staff = staffOf('college');
    expect([...emptyBandsOf(staff)]).toEqual([]);
    expect(seatDutyList(staff, staff.seats.find((s) => s.rung === 7)!.seatId).some((a) => a.source === 'pushed_down')).toBe(false);
  });
});

describe('S1.3.1 path targets', () => {
  it('every target is data with its source count, and none is presented as verified', () => {
    expect(PATH_TARGETS.length).toBeGreaterThanOrEqual(10);
    for (const t of PATH_TARGETS) { expect(t.sources).toBeLessThan(3); expect(t.status).toMatch(/Unverified/); }
  });
  it('the world-run check reads mean age of first top head job and the rung 2 to rung 9 share', () => {
    const climb = (age0: number, top: boolean) => ({ seasons: Array.from({ length: 25 }, (_, i) => ({ age: age0 + i, rung: i < 20 ? 2 + Math.floor(i / 3) : 9, topSubdivision: top })) });
    const stall = { seasons: Array.from({ length: 25 }, (_, i) => ({ age: 22 + i, rung: Math.min(2 + Math.floor(i / 4), 6), topSubdivision: true })) };
    const ok = checkPaths([climb(23, true), ...Array.from({ length: 19 }, () => stall)]);
    expect(ok.meanAgeFirstTopHead).toBe(43);
    expect(ok.ageOk).toBe(true);
    expect(ok.reachOk).toBe(true);
    expect(checkPaths([climb(23, true), climb(23, true)]).reachOk).toBe(false);
  });
});
