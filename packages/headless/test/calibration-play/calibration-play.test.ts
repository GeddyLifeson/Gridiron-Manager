// WP-26 tests (Q1.7.2 play level). Fixture rows hold no real rate; the baseline file is checked as data.
import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PlayByPlayRow } from '@gm/schema';
import { row, run, pass } from '../calibration/fixtures.ts';
import type { LoadedTargets } from '../../src/calibration/targets.ts';
import {
  readCsv, rowFromPublic, measureCells, CELL_PLAN, SPLITS, SHAPE_POINTS, compareCell, shapeChecks, baselineStatus,
  buildPlayReport, formatPlayReport, readBaseline, cellStatus, readChartSeason, applyChart, personnelFromParticipation, rowFromCollege, CHART_FIELDS, readTolerances, officialTotals, worstMisses, UNCHARTED_FIELDS,
  type CellValue, type Tolerances, type RealBaseline, type CsvRecord,
} from '../../src/calibration-play/index.ts';

const TOL: Tolerances = { source: 'fixture', status: 'Assumption', core: { rel: 0.03 }, rare: { rel: 0.1 }, shape: { absYd: 1, absThroughPct: 75, rel: 0.1, relFromPct: 90 }, standardErrors: 2, minRealEvents: 5 };
const bytes = (s: string): Uint8Array => new TextEncoder().encode(s);
const RUN_INFO = { build: 'fixture', paramsHash: 'fixture', resolverId: 'reference', seeds: 'fixture', games: 1, seedGroups: 1 };
const emptyTargets = (ruleSetId: string): LoadedTargets => ({ file: { ruleSetId, version: '1', targets: [] }, statusOf: new Map(), problems: [] });

function publicRow(over: CsvRecord): CsvRecord {
  return {
    game_id: '2023_01_AAA_BBB', play_id: '1', season: '2023', season_type: 'REG', home_team: 'BBB', posteam: 'AAA', play_type: 'pass', qtr: '2',
    quarter_seconds_remaining: '431', drive: '5', down: '3', ydstogo: '7', yardline_100: '42', goal_to_go: '0', posteam_score: '7', defteam_score: '10',
    yards_gained: '12', air_yards: '8', yards_after_catch: '4', pass_location: 'left', run_location: 'NA', shotgun: '1', no_huddle: '0', qb_dropback: '1',
    qb_scramble: '0', qb_kneel: '0', qb_spike: '0', sack: '0', interception: '0', fumble_lost: '0', complete_pass: '1', touchdown: '0', first_down: '1',
    penalty: '0', penalty_team: 'NA', penalty_type: 'NA', penalty_yards: 'NA', field_goal_result: 'NA', kick_distance: 'NA', extra_point_attempt: '0',
    extra_point_result: 'NA', two_point_attempt: '0', two_point_conv_result: 'NA', kickoff_attempt: '0', timeout: '0', ...over,
  };
}

describe('readCsv', () => {
  it('reads quoted fields with commas, quotes and line breaks, and only the wanted columns', () => {
    const got: CsvRecord[] = [];
    const r = readCsv(bytes('a,b,c\r\n1,"x, ""y""\nz",3\n4,,6'), ['a', 'b', 'nope'], (rec) => got.push(rec));
    expect(got).toEqual([{ a: '1', b: 'x, "y"\nz' }, { a: '4', b: '' }]);
    expect(r).toEqual({ rows: 2, missing: ['nope'] });
  });
});

describe('rowFromPublic', () => {
  it('maps a completed pass by the away team', () => {
    const r = rowFromPublic(publicRow({}), { gameId: 3, playIndex: 9 })!;
    expect(r).toMatchObject({ gameId: 3, playIndex: 9, offense: 1, playKind: 'scrimmage', period: 2, clockTenths: 4310, down: 3, distanceYd: 7, ballOnYd: 58,
      yardsToGoalYd: 42, resultType: 'pass_complete', dropback: true, sack: false, yardsGained: 12, airYd: 8, yardsAfterCatch: 4, passLocation: 'left', firstDown: true, noPlay: false });
  });
  it('drops markers and timeouts, keeps penalty no-plays', () => {
    expect(rowFromPublic(publicRow({ play_type: 'NA' }), { gameId: 1, playIndex: 1 })).toBeNull();
    expect(rowFromPublic(publicRow({ play_type: 'no_play', penalty: '0', timeout: '1' }), { gameId: 1, playIndex: 1 })).toBeNull();
    const pen = rowFromPublic(publicRow({ play_type: 'no_play', penalty: '1', penalty_team: 'BBB', penalty_type: 'Defensive Offside', penalty_yards: '5' }), { gameId: 1, playIndex: 1 })!;
    expect(pen).toMatchObject({ noPlay: true, resultType: 'no_play', penalties: [{ foulId: 'Defensive Offside', side: 0, yards: 5 }] });
  });
  it('maps sacks, scrambles, kneel-downs, spikes, kicks and tries', () => {
    const at = (o: CsvRecord) => rowFromPublic(publicRow(o), { gameId: 1, playIndex: 1 })!;
    expect(at({ sack: '1', complete_pass: '0', yards_gained: '-7', air_yards: 'NA' })).toMatchObject({ resultType: 'sack', sack: true, dropback: true, airYd: null, yardsAfterCatch: null });
    expect(at({ play_type: 'run', qb_scramble: '1', complete_pass: '0' })).toMatchObject({ resultType: 'run', scramble: true, dropback: true });
    expect(at({ play_type: 'run', qb_dropback: '0', complete_pass: '0' })).toMatchObject({ resultType: 'run', dropback: false });
    expect(at({ play_type: 'qb_kneel', qb_kneel: '1', qb_dropback: '0' }).resultType).toBe('kneel');
    expect(at({ play_type: 'qb_spike', qb_spike: '1' })).toMatchObject({ resultType: 'spike', dropback: false });
    expect(at({ play_type: 'field_goal', field_goal_result: 'made', kick_distance: '44' })).toMatchObject({ kickKind: 'field_goal', resultType: 'field_goal_good', kickDistanceYd: 44 });
    expect(at({ play_type: 'extra_point', extra_point_attempt: '1', extra_point_result: 'blocked', down: 'NA' })).toMatchObject({ playKind: 'try', kickKind: 'try_kick', resultType: 'try_failed', down: null });
    expect(at({ two_point_attempt: '1', two_point_conv_result: 'success', down: 'NA' })).toMatchObject({ playKind: 'try', kickKind: null, resultType: 'try_good', down: null, distanceYd: null });
    expect(at({ play_type: 'kickoff', kickoff_attempt: '1', down: 'NA' })).toMatchObject({ playKind: 'kickoff', kickKind: 'kickoff' });
  });
  it('uncharted and not-yet-charted fields stay neutral', () => {
    const r = rowFromPublic(publicRow({}), { gameId: 1, playIndex: 1 })!;
    for (const f of [...UNCHARTED_FIELDS, ...CHART_FIELDS]) expect([null, false]).toContain(r[f]);
  });
});

describe('charts', () => {
  it('reads personnel only when it describes five eligibles, fullbacks as backs', () => {
    expect(personnelFromParticipation('1 RB, 1 TE, 3 WR')).toBe('11');
    expect(personnelFromParticipation('1 C, 2 G, 1 QB, 1 RB, 2 T, 2 TE, 2 WR')).toBe('12');
    expect(personnelFromParticipation('1 C, 2 G, 1 FB, 2 T, 1 QB, 1 RB, 1 TE, 2 WR')).toBe('21');
    expect(personnelFromParticipation('1 RB, 1 TE, 2 WR')).toBeNull();
    expect(personnelFromParticipation('')).toBeNull();
  });
  it('applies a chart: a dropback needs both its rusher count and its pressure flag', () => {
    const base = rowFromPublic(publicRow({}), { gameId: 1, playIndex: 1 })!;
    const chart = { personnelCode: '11', boxCount: 6, rushers: 4, pressure: true, coverageFamily: 'cover3' as const, playAction: true, motion: false };
    expect(applyChart(base, chart)).toMatchObject({ personnelCode: '11', boxCount: 6, rushers: 4, pressure: true, coverageFamily: 'cover3', playAction: true, motion: false });
    expect(applyChart(base, { ...chart, pressure: null })).toMatchObject({ rushers: null, pressure: false });
    expect(applyChart(base, undefined)).toBe(base);
  });
  it('reads participation and FTN files, 0 and impossible counts as not charted', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wp26-'));
    const p = join(dir, 'p.csv'), f = join(dir, 'f.csv');
    writeFileSync(p, 'nflverse_game_id,play_id,offense_personnel,defenders_in_box,number_of_pass_rushers,was_pressure,defense_coverage_type\n'
      + 'G,1,"1 RB, 1 TE, 3 WR",6,4,TRUE,COVER_3\nG,2,"1 RB, 1 TE, 3 WR",0,0,FALSE,COMBO\nG,3,,7,44,,\n');
    writeFileSync(f, 'nflverse_game_id,nflverse_play_id,n_defense_box,n_pass_rushers,is_motion,is_play_action\nG,1,6,4,TRUE,FALSE\n');
    const s = readChartSeason(p, f, 2023);
    expect(s.byPlay.get('G|1')).toEqual({ personnelCode: '11', boxCount: 6, rushers: 4, pressure: true, coverageFamily: 'cover3', playAction: false, motion: true });
    expect(s.byPlay.get('G|2')).toMatchObject({ boxCount: null, rushers: null, pressure: false, coverageFamily: 'other', playAction: null });
    expect(s.byPlay.get('G|3')).toMatchObject({ boxCount: 7, rushers: null, pressure: null, coverageFamily: null });
    expect(s.second.get('G|1')).toEqual({ boxCount: 6, rushers: 4 });
    rmSync(dir, { recursive: true });
  });
  it('charted splits count only charted plays and share over them', () => {
    const d = (rushers: number | null, pressure: boolean, over: Partial<PlayByPlayRow> = {}) => pass('complete', 8, { rushers, pressure, ...over });
    const cells = new Map(measureCells([d(4, false), d(4, true), d(5, true), d(null, false), run(3, { boxCount: 7 }), run(5, { boxCount: 6 })]).map((c) => [c.id, c]));
    expect(cells.get('rushers[4].share')).toMatchObject({ n: 3, value: Number((2 / 3).toPrecision(6)) });
    expect(cells.get('all[all].pass.pressureRate')).toMatchObject({ n: 3, value: Number((2 / 3).toPrecision(6)) });
    expect(cells.get('pressure[pressured].pass.completionPct')).toMatchObject({ n: 2, value: 1 });
    expect(cells.get('box[7].share')).toMatchObject({ n: 2, value: 0.5 });
  });
});

describe('college rows', () => {
  const crow = (o: CsvRecord): CsvRecord => ({
    game_id: '1', game_play_number: '1', season_type: 'regular', home_team_division: 'fbs', away_team_division: 'fbs', home_team: 'H', pos_team: 'A', period: '2',
    clock_minutes: '7', clock_seconds: '11', play_type: 'Rush', play_text: 'X run for 5 yds', down: '2', distance: '7', yards_to_goal: '40', yards_gained: '5', yds_penalty: '',
    rush: '1', pass: '0', completion: '0', sack: '0', int: '0', rush_td: '0', pass_td: '0', penalty_flag: 'False', penalty_declined: 'False', penalty_no_play: 'False',
    firstD_by_yards: '0', firstD_by_penalty: '0', fumble_vec: '0', Goal_To_Go: 'False', pos_team_score: '7', def_pos_team_score: '3', drive_number: '4', ...o,
  });
  const at = (o: CsvRecord) => rowFromCollege(crow(o), { gameId: 1, playIndex: 1 });
  it('maps rushes, completions, sacks and takes foul yards out of the play', () => {
    expect(at({})).toMatchObject({ offense: 1, resultType: 'run', yardsGained: 5, clockTenths: 4310, down: 2, yardsToGoalYd: 40, dropback: false, scramble: false });
    expect(at({ rush: '0', pass: '1', completion: '1', play_type: 'Pass Reception', yards_gained: '12', firstD_by_yards: '1' })).toMatchObject({ resultType: 'pass_complete', dropback: true, firstDown: true });
    expect(at({ rush: '0', pass: '1', sack: '1', play_type: 'Sack', yards_gained: '-7' })).toMatchObject({ resultType: 'sack', sack: true, yardsGained: -7 });
    expect(at({ yards_gained: '-7', yds_penalty: '-10', penalty_flag: 'True', play_text: 'X run for 3 yds Penalty, Holding' })!.yardsGained).toBe(3);
    expect(at({ rush: '0', pass: '1', int: '1', play_type: 'Interception Return' })).toMatchObject({ resultType: 'interception', interception: true });
  });
  it('drops no-plays, penalty rows and two-point rows, and finds kneel-downs and spikes in the text', () => {
    expect(at({ penalty_no_play: 'True' })).toBeNull();
    expect(at({ rush: '0', play_type: 'Penalty' })).toBeNull();
    expect(at({ play_type: 'Two Point Rush' })).toBeNull();
        expect(at({ play_text: 'Team kneel down' })!.resultType).toBe('kneel');
    expect(at({ rush: '0', pass: '1', play_text: 'X spike' })).toMatchObject({ resultType: 'spike', dropback: false });
  });
});

describe('measureCells', () => {
  const rows = [
    run(4, { down: 1, distanceYd: 10 }), run(-1, { down: 1, distanceYd: 10 }), run(12, { down: 2, distanceYd: 3, firstDown: true }),
    pass('complete', 15, { down: 3, distanceYd: 7, firstDown: true, airYd: 9 }), pass('incomplete', 0, { down: 3, distanceYd: 7, airYd: 22 }),
    pass('sack', -6, { down: 3, distanceYd: 12 }), pass('interception', 0, { down: 2, distanceYd: 8, airYd: 18 }),
    row({ offenseKind: 'kneel', resultType: 'kneel', yardsGained: -1 }), row({ playKind: 'try', down: null, kickKind: 'try_kick', resultType: 'try_good' }),
  ];
  const cells = new Map(measureCells(rows).map((c) => [c.id, c]));
  it('has one cell per planned pair plus one share per split, with unique ids', () => {
    expect(cells.size).toBe(CELL_PLAN.length + SPLITS.length - 1);
  });
  it('counts the same plays as the WP-13 classes', () => {
    expect(cells.get('all[all].play.passPlayShare')).toMatchObject({ n: 7, value: Number((4 / 7).toPrecision(6)) });
    expect(cells.get('all[all].play.yards')!.value).toBeCloseTo((4 - 1 + 12 + 15 + 0 - 6 + 0) / 7, 5);
    expect(cells.get('all[all].pass.completionPct')).toMatchObject({ n: 3, value: Number((1 / 3).toPrecision(6)) });
    expect(cells.get('all[all].pass.sackRate')).toMatchObject({ n: 4, value: 0.25 });
    expect(cells.get('all[all].rush.yardsPerCarry')).toMatchObject({ n: 3, value: 5 });
    expect(cells.get('all[all].rush.stuffedShare')!.value).toBeCloseTo(1 / 3, 5);
    expect(cells.get('down[3].play.firstDownRate')).toMatchObject({ n: 3, value: Number((1 / 3).toPrecision(6)) });
    expect(cells.get('downDistance[3&6-9].share')).toMatchObject({ n: 7, value: Number((2 / 7).toPrecision(6)) });
    expect(cells.get('depth[6-10].pass.completionPct')).toMatchObject({ n: 1, value: 1 });
    expect(cells.get('depth[16-20].pass.interceptionRate')).toMatchObject({ n: 1, value: 1 });
    expect(cells.get('depth[21-30].share')).toMatchObject({ n: 3, value: Number((1 / 3).toPrecision(6)) });
    expect((cells.get('all[all].rush.gain')!.value as number[]).length).toBe(SHAPE_POINTS.length);
    expect(cells.get('zone[opp10-1].rush.yardsPerCarry')).toMatchObject({ n: 0, value: null });
  });
});

describe('compareCell and shapeChecks', () => {
  const cell = (over: Partial<CellValue>): CellValue => ({ id: 'all[all].pass.completionPct', dim: 'all', key: 'all', metric: 'pass.completionPct', kind: 'rate', cls: 'core', n: 10000, value: 0.65, sd: null, ...over });
  it('uses the class tolerance or two real standard errors, whichever is larger', () => {
    expect(compareCell(cell({}), cell({ value: 0.66 }), TOL)).toMatchObject({ pass: true, state: 'measured' });
    expect(compareCell(cell({}), cell({ value: 0.68 }), TOL)).toMatchObject({ pass: false });
    const small = compareCell(cell({ n: 100 }), cell({ value: 0.72 }), TOL);
    expect(small.pass).toBe(true);
    expect(small.toleranceUsed).toBeCloseTo(2 * Math.sqrt((0.65 * 0.35) / 100), 9);
    expect(compareCell(cell({ cls: 'rare', value: 0.02 }), cell({ cls: 'rare', value: 0.0219 }), TOL).pass).toBe(true);
    const m = compareCell(cell({ kind: 'mean', value: 4.5, sd: 6, n: 100 }), cell({ kind: 'mean', value: 5.5 }), TOL);
    expect(m.toleranceUsed).toBeCloseTo(1.2, 9);
    expect(m.pass).toBe(true);
  });
  it('marks thin, empty and unsourced cells without judging them', () => {
    expect(compareCell(cell({ n: 4 }), cell({}), TOL)).toMatchObject({ state: 'thin', pass: null });
    expect(compareCell(cell({}), cell({ n: 0, value: null }), TOL)).toMatchObject({ state: 'no_events', pass: null });
    expect(compareCell(null, cell({}), TOL)).toMatchObject({ state: 'missing_source', pass: null, real: null });
  });
  it('judges quantile cells point by point', () => {
    const q = (value: number[]): CellValue => cell({ id: 'all[all].rush.gain', metric: 'rush.gain', kind: 'quantiles', cls: 'shape', value });
    expect(compareCell(q([0, 1, 3, 6, 11, 14]), q([-1, 2, 3, 7, 12, 15.3]), TOL).pass).toBe(true);
    expect(compareCell(q([0, 1, 3, 6, 11, 14]), q([0, 1, 5, 6, 11, 14]), TOL)).toMatchObject({ pass: false, signedError: 2, toleranceUsed: 1 });
    expect(compareCell(q([0, 1, 3, 6, 11, 14]), q([0, 1, 3, 6, 11, 16]), TOL).pass).toBe(false);
  });
  it('checks monotone shapes only where the real cells are monotone', () => {
    const depth = (key: string, real: number, sim: number) => compareCell(
      cell({ id: `depth[${key}].pass.completionPct`, dim: 'depth', key, value: real }), cell({ id: `depth[${key}].pass.completionPct`, dim: 'depth', key, value: sim }), TOL);
    const keys = ['behind', '0', '1-5', '6-10', '11-15', '16-20', '21-30', '31+'];
    const falling = keys.map((k, i) => depth(k, 0.9 - i * 0.08, 0.9 - i * 0.08));
    expect(shapeChecks(falling)).toMatchObject([{ group: 'depth', direction: 'falling', held: true }]);
    const broken = keys.map((k, i) => depth(k, 0.9 - i * 0.08, i === 3 ? 0.95 : 0.9 - i * 0.08));
    expect(shapeChecks(broken)[0]!.held).toBe(false);
    const flat = keys.map((k, i) => depth(k, i === 3 ? 0.9 : 0.9 - i * 0.08, 0.5));
    expect(shapeChecks(flat)).toEqual([]);
  });
});

describe('the real baseline file', () => {
  const b = readBaseline('pro_2026')!;
  it('is the whole suite, from one collection, so every cell is 1 of 3', () => {
    expect(b.ruleSetId).toBe('pro_2026');
    expect(new Set(b.cells.map((c) => c.id)).size).toBe(CELL_PLAN.length + SPLITS.length - 1);
    expect(baselineStatus(b)).toBe('1 of 3');
    expect(baselineStatus({ sources: [...b.sources, { ...b.sources[0]!, citation: 'second' }, { ...b.sources[0]!, citation: 'third' }] })).toBe('Verified');
    expect(baselineStatus({ sources: [b.sources[0]!, b.sources[0]!, b.sources[0]!] })).toBe('1 of 3');
  });
  it('has league totals within 0.1% of both team-total collections in every season', () => {
    expect(b.adapterChecks.length).toBe(12);
    for (const c of b.adapterChecks) {
      expect(c.others.length).toBe(2);
      for (const o of c.others) expect(Math.abs(c.fromPlayByPlay - o.value) / o.value).toBeLessThan(0.001);
    }
  });
  it('charted cells name their own collections and are 1 of 3 (FTN equals the participation chart in 2023 and 2024, so it is not a second collection)', () => {
    expect(b.groups!.map((g) => g.name)).toEqual(['participation chart', 'FTN chart']);
    const status = (dim: string, metric: string) => cellStatus(b, { dim, metric });
    expect(status('rushers', 'share')).toBe('1 of 3');
    expect(status('all', 'pass.pressureRate')).toBe('1 of 3');
    expect(status('action', 'share')).toBe('1 of 3');
    expect(status('all', 'play.yards')).toBe('1 of 3');
    for (const s of b.chartChecks!) {
      expect(s.dropbacksCharted / s.dropbacks).toBeGreaterThan(0.85);
      if (s.season >= 2023) { expect(s.rushersEqual / s.rushersBoth).toBeGreaterThan(0.999); expect(s.boxEqual / s.boxBoth).toBeGreaterThan(0.99); }
      else expect(s.rushersEqual / s.rushersBoth).toBeLessThan(0.9);
    }
    const ids = new Set(b.cells.map((c) => c.id));
    for (const id of ['all[all].pass.pressureRate', 'rushers[4].pass.sackRate', 'box[7].rush.yardsPerCarry', 'coverage[cover3].pass.completionPct', 'action[playAction].pass.yardsPerAttempt', 'personnel[11].share', 'motion[motion].play.passPlayShare']) expect(ids.has(id)).toBe(true);
  });
  it('has a college file from its own collection, with the uncharted cells left out', () => {
    const c = readBaseline('college_2026')!;
    expect(c.ruleSetId).toBe('college_2026');
    expect(c.sources.map((s) => s.citation)).toEqual(['cfbfastR play-by-play (sportsdataverse-data)']);
    expect(baselineStatus(c)).toBe('1 of 3');
    const ids = new Set(c.cells.map((x) => x.id));
    expect(ids.has('all[all].rush.yardsPerCarry')).toBe(true);
    expect(c.cells.some((x) => ['depth', 'rushers', 'pressure', 'action', 'coverage', 'box', 'personnel', 'motion'].includes(x.dim))).toBe(false);
    expect(ids.has('all[all].pass.scrambleShare')).toBe(false);
    expect(c.seasons).toBe('2023-2025');
  });
  it('reads its tolerances from the file', () => {
    const t = readTolerances();
    expect(t.status).toBe('Assumption');
    expect(t.core.rel).toBeGreaterThan(0);
  });
});

describe('the play report', () => {
  const sample = [{ summaries: [], plays: [run(4), run(6), pass('complete', 10)] }];
  it('prints MISSING SOURCE for a level with no baseline and never certifies provisional cells', () => {
    const rep = buildPlayReport(emptyTargets('college_2026'), sample, RUN_INFO, null, TOL, ['note']);
    expect(rep.counts.missingSource).toBe(rep.counts.cells);
    expect(rep.cellsProvisional).toBe(true);
    const text = formatPlayReport(rep);
    expect(text).toContain('RUN NOTES:');
    expect(text).toContain('MISSING SOURCE');
    expect(text).not.toContain('| PASS');
    expect(formatPlayReport(buildPlayReport(emptyTargets('college_2026'), sample, RUN_INFO, null, TOL, ['note']))).toBe(text);
  });
  it('refuses a baseline of another rule set', () => {
    const b = readBaseline('pro_2026')!;
    expect(() => buildPlayReport(emptyTargets('college_2026'), sample, RUN_INFO, b, TOL)).toThrow(/Q2\.1\.1/);
  });
  it('compares against the baseline, marks every cell PROVISIONAL and ranks misses', () => {
    const b: RealBaseline = { ...readBaseline('pro_2026')! };
    const rep = buildPlayReport(emptyTargets('pro_2026'), sample, RUN_INFO, b, readTolerances());
    expect(rep.baseline!.status).toBe('1 of 3');
    expect(rep.counts.measured).toBeGreaterThan(0);
    const text = formatPlayReport(rep);
    expect(text).toContain('Every cell is PROVISIONAL');
    expect(text.split('\n').filter((l) => / (PASS|FAIL|THIN|NO EVENTS)$/.test(l))).toEqual([]);
    const worst = worstMisses(rep.cells, 3);
    expect(worst.length).toBeLessThanOrEqual(3);
    expect(worst.every((c) => c.pass === false)).toBe(true);
  });
  it('official totals count kneel-downs as rushes and spikes as passes', () => {
    expect(officialTotals([run(3), row({ resultType: 'kneel', yardsGained: -1 }), pass('complete', 5), pass('sack', -4), row({ resultType: 'spike', dropback: false })]))
      .toEqual({ rush_att: 2, rush_yds: 2, pass_att: 2, sacks: 1 });
  });
});
