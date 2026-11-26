// G-68 acceptance tests (G6, G7, O3.4). Play and part names are test labels only.
import { describe, expect, it } from 'vitest';
import type { Call, Part, PlayEntry, Playbook } from '../../src/playbook/index.ts';
import * as gp from '../../src/gameplan/index.ts';

function play(id: string, section: string, parts: PlayEntry['parts'], extra: Partial<PlayEntry> = {}): PlayEntry {
  return { id, book: 'offense', section: [section], labels: [], status: 'installed', parts, tags: [], role: 'base', units: 2, beats: [], situations: [], ...extra };
}
function book(plays: PlayEntry[]): Playbook {
  return { teamId: 'T', parts: new Map<string, Part>(), plays: new Map(plays.map((p) => [p.id, p])) };
}
const call = (playId: string, tags: string[] = []): Call => ({ playId, tags });

const PLAYS: PlayEntry[] = [
  play('r1', 'run', { personnel: '11', formation: 'trips' }),
  play('r2', 'run', { personnel: '12', formation: 'ace' }),
  play('p1', 'dropback', { personnel: '11', formation: 'trips' }, { beats: ['cover3'] }),
  play('p2', 'quick', { personnel: '11', formation: 'doubles', motion: 'jet' }, { beats: ['cover1'] }),
  play('p3', 'play_action', { personnel: '12', formation: 'ace' }),
  play('s1', 'screen', { personnel: '11', formation: 'doubles' }),
  play('n1', 'dropback', { personnel: '11', formation: 'doubles', concept: 'mesh' }, { status: 'valid', units: 3 }),
  play('n2', 'dropback', { personnel: '11', formation: 'trips', concept: 'mesh' }, { status: 'valid', units: 3, parentId: 'n1' }),
  play('old', 'run', { personnel: '11', formation: 'trips' }, { status: 'retired' }),
];
const BOOK = book(PLAYS);
const menuEntry = (id: string, playId: string, situationIds: string[], targetReps = 4): gp.MenuEntry => ({ id, side: 'offense', call: call(playId), situationIds, targetReps });

describe('G7.2.3 reference table (2024 NFL play-by-play)', () => {
  const t = gp.proReference2024();
  const third: gp.SituationRule = { id: 't', label: 't', anyOf: [{ all: [{ on: 'down', in: [3] }] }] };
  const b = (min: number, max?: number): gp.SituationRule => ({ id: 'b', label: 'b', anyOf: [{ all: [{ on: 'down', in: [3] }, { on: 'distance', min, ...(max === undefined ? {} : { max }) }] }] });
  it('third downs equal 12.6 within 0.1 and the four buckets sum to it', () => {
    const total = gp.expectedSnaps(third, t).value;
    expect(Math.abs(total - 12.6)).toBeLessThanOrEqual(0.1);
    const sum = [b(1, 3), b(4, 6), b(7, 10), b(11)].reduce((a, r) => a + gp.expectedSnaps(r, t).value, 0);
    expect(Math.abs(sum - total)).toBeLessThanOrEqual(0.1);
  });
  it('"any down, opponent 20 and in" shows 9.5, with source and game count', () => {
    const e = gp.expectedSnaps({ id: 'rz', label: 'rz', anyOf: [{ all: [{ on: 'yardsToGoal', max: 20 }] }] }, t);
    expect(e.value).toBeCloseTo(9.5, 1);
    expect(e.source).toBe('league');
    expect(e.games).toBe(544);
  });
  it('reproduces the other bible figures', () => {
    expect(gp.snapsPerGame(t)).toBeCloseTo(61.3, 1);
    expect(t.drivesPerGame!).toBeCloseTo(10.8, 1);
    const two = gp.expectedSnaps({ id: 'x', label: 'x', anyOf: [{ all: [{ on: 'halfSecondsLeft', max: 120 }] }] }, t).value;
    expect(two).toBeCloseTo(7.3, 1);
    expect(gp.expectedSnaps({ id: 'nh', label: 'nh', anyOf: [{ all: [{ on: 'tempo', in: ['no_huddle'] }] }] }, t).value).toBeCloseTo(7.5, 1);
  });
  it('a condition the table cannot see is skipped and marked approximate', () => {
    const e = gp.expectedSnaps({ id: 'x', label: 'x', anyOf: [{ all: [{ on: 'down', in: [3] }, { on: 'scoreDiff', min: 1 }] }] }, t);
    expect(e.approximate).toBe(true);
    expect(e.skipped).toEqual(['scoreDiff']);
  });
  it('uses the team table only from 4 games', () => {
    const team = gp.tableFromStates('team', 'team', [gp.NEUTRAL_STATE], 3);
    expect(gp.chooseTable(team, t)).toBe(t);
    expect(gp.chooseTable({ ...team, games: 4 }, t)).not.toBe(t);
  });
  it('depth marks', () => {
    expect(gp.depthMark(12, 3.2)).toBe('deep');
    expect(gp.depthMark(2, 3.6)).toBe('thin');
    expect(gp.depthMark(4, 3.4)).toBeNull();
  });
});

describe('G7.2.1 situation rules and O3.4.2 coverage map', () => {
  const sheet = gp.offenseTemplate();
  const sits = gp.situationMap(sheet);
  it('the grid has 5,000 states per personnel group', () => {
    expect(gp.situationGrid().length).toBe(5000);
  });
  it('first match in priority order takes focus', () => {
    const s: gp.SituationState = { ...gp.NEUTRAL_STATE, down: 3, distanceYd: 5, yardsToGoalYd: 15 };
    expect(gp.focusBox(sheet.boxes, sits, s)?.id).toBe('red_zone_third');
    expect(gp.focusBox(sheet.boxes, sits, { ...s, yardsToGoalYd: 60 })?.id).toBe('third_medium');
    expect(gp.focusBox(sheet.boxes, sits, { ...s, yardsToGoalYd: 60, halfSecondsLeft: 90 })?.id).toBe('two_minute');
  });
  it('focus for 50 sample states equals a hand implementation of priority-then-reading-order', () => {
    const grid = gp.situationGrid();
    const ordered = [...sheet.boxes].sort((a, b) => a.priority - b.priority || a.order - b.order);
    for (let i = 0; i < 50; i++) {
      const s = grid[(i * 97) % grid.length]!;
      const hand = ordered.find((b) => b.situationId !== null && gp.situationMatches(sits.get(b.situationId)!, s))?.id ?? null;
      expect(gp.focusBox(sheet.boxes, sits, s)?.id ?? null).toBe(hand);
    }
  });
  it('lists every unmatched state and shadowed boxes', () => {
    const only: gp.Box[] = sheet.boxes.filter((b) => b.id === 'third_short');
    const check = gp.checkRules(only, sits, gp.situationGrid());
    const expectUnmatched = gp.situationGrid().filter((s) => !(s.down === 3 && s.distanceYd <= 3)).length;
    expect(check.unmatched.length).toBe(expectUnmatched);
    const both = sheet.boxes.filter((b) => b.id === 'red_zone' || b.id === 'goal_line').map((b) => (b.id === 'red_zone' ? { ...b, priority: 1 } : b));
    expect(gp.checkRules(both, sits, gp.situationGrid()).shadowed.some((x) => x.shadowed === 'goal_line')).toBe(true);
  });
  it('the coverage map classifies all 120 cells', () => {
    const map = gp.coverageMap(sheet.boxes, sits);
    expect(map.length).toBe(4 * 6 * 5);
    expect(map.find((c) => c.down === 3 && c.distance === '4-6' && c.zone === 'open field')!.boxId).toBe('third_medium');
    expect(gp.coverageMap([], sits).every((c) => c.boxId === null)).toBe(true);
  });
});

describe('G7.2.2 catalogue', () => {
  const t = gp.proReference2024();
  const sheet = gp.offenseTemplate();
  const grid = gp.situationGrid();
  it('a template with every catalogue box shows zero missing', () => {
    const checks = gp.checkCatalogue(sheet.boxes, gp.situationMap(sheet), grid, t, new Set(['script']));
    expect(gp.missingRows(checks)).toEqual([]);
  });
  it('deleting a box moves its row to covered or missing correctly, ordered by expected snaps', () => {
    const less = sheet.boxes.filter((b) => b.id !== 'third_medium' && b.id !== 'third_extra_long' && b.id !== 'last_play_long');
    const checks = gp.checkCatalogue(less, gp.situationMap(sheet), grid, t, new Set(['script']));
    const st = (id: string) => checks.find((c) => c.row.id === id)!.status;
    for (const id of ['third_medium', 'third_extra_long']) expect(['missing', 'partly']).toContain(st(id));
    // The two-minute box's rule matches every last-play state, so that row is covered by another box.
    expect(st('last_play_long')).toBe('covered');
    expect(st('third_short')).toBe('has_box');
    const missing = gp.missingRows(checks).map((c) => c.row.id);
    expect(missing[0]).toBe('third_medium');
    expect(missing.indexOf('third_medium')).toBeLessThan(missing.indexOf('third_extra_long'));
    expect(checks.find((c) => c.row.id === 'third_medium')!.severity).toBe('warning');
  });
  it('a broader box covers a narrower row, and a box under 80% is partly covered', () => {
    const broad: gp.SituationRule = { id: 'tl', label: 'tl', anyOf: [{ all: [{ on: 'down', in: [3] }, { on: 'distance', min: 7 }] }] };
    const box = { ...sheet.boxes[0]!, id: 'tl', situationId: 'tl', catalogueRef: null, category: null };
    const checks = gp.checkCatalogue([box], new Map([['tl', broad]]), grid, t);
    expect(checks.find((c) => c.row.id === 'third_extra_long')!.status).toBe('covered');
    const half: gp.SituationRule = { id: 'h', label: 'h', anyOf: [{ all: [{ on: 'down', in: [3] }, { on: 'distance', min: 1, max: 1 }] }] };
    const c2 = gp.checkCatalogue([{ ...box, id: 'h', situationId: 'h' }], new Map([['h', half]]), grid, t);
    expect(c2.find((c) => c.row.id === 'third_short')!.status).toBe('partly');
  });
  it('gives AI preparation rows with expected snaps and a down-and-distance id', () => {
    const rows = gp.catalogueEntries(t);
    expect(rows.find((r) => r.id === 'third_medium')!.expectedSnaps).toBeCloseTo(3.2, 1);
    expect(rows.find((r) => r.id === 'two_minute')!.clock).toBe('two_minute');
    expect(gp.downDistanceId({ ...gp.NEUTRAL_STATE, down: 3, distanceYd: 8 })).toBe('third_long');
    expect(gp.downDistanceId({ ...gp.NEUTRAL_STATE, down: 1, distanceYd: 5, yardsToGoalYd: 5 })).toBe('first_other');
  });
});

describe('G7.1 sheet object and layout', () => {
  it('templates have no overlaps and every key path is unique and at most 3 presses', () => {
    for (const s of [gp.offenseTemplate(), gp.defenseTemplate(), gp.specialTeamsTemplate()]) {
      expect(gp.layoutProblems(s)).toEqual([]);
      const filled = s.boxes.reduce((acc, b) => gp.addEntry(acc, b.id, { id: `${b.id}.e`, call: call('r1') }), s);
      const km = gp.keyMap(filled);
      expect(km.tooLong).toEqual([]);
      const paths = [...km.entries.values()].map((p) => p.join(''));
      expect(new Set(paths).size).toBe(paths.length);
    }
  });
  it('finds overlaps and key changes when a box moves', () => {
    const s = gp.offenseTemplate();
    const moved = { ...s, boxes: s.boxes.map((b) => (b.id === 'first_10' ? { ...b, col: 6 } : b)) };
    expect(gp.layoutProblems(moved).some((p) => p.kind === 'overlap')).toBe(true);
    const swapped = { ...s, boxes: s.boxes.map((b) => (b.id === 'first_10' ? { ...b, side: 1 as const, row: 12, col: 20, w: 4 } : b.id === 'halftime' ? { ...b, side: 0 as const, col: 0, row: 0, w: 6 } : b)) };
    expect(gp.keyChanges(gp.keyMap(s), gp.keyMap(swapped))).toContain('first_10');
  });
  it('a filled sheet round-trips through save and load unchanged; a template import strips entries', () => {
    let s = { ...gp.offenseTemplate(), gameId: 'g1' };
    s = gp.addEntry(s, 'first_10', { id: 'e1', call: call('r1', ['left']), note: 'if two-high', rank: 1 });
    const text = gp.serializeSheet(s);
    expect(gp.parseSheet(text)).toEqual(s);
    expect(gp.parseSheet(text, true).boxes.every((b) => b.entries.length === 0)).toBe(true);
    expect(() => gp.parseSheet('{"format":"x"}')).toThrow(gp.SheetFormatError);
  });
  it('density meter bands and smallest text', () => {
    let s = gp.offenseTemplate();
    for (let i = 0; i < 30; i++) s = gp.addEntry(s, 'first_10', { id: `e${i}`, call: call('r1', [`t${i}`]) });
    const d = gp.density(s);
    expect(d.entriesBySide[0]).toBe(30);
    expect(d.bandBySide[0]).toBe('clear');
    expect(d.overflow).toContain('first_10');
    expect(d.smallestTextPt).toBeLessThan(7);
  });
});

describe('G6.1 looks board and themes', () => {
  const rows: gp.ScoutRow[] = [];
  for (let g = 1; g <= 6; g++) for (let i = 0; i < 6; i++) rows.push({
    ref: `${g}.${i}`, gameOrder: g, season: 2026, teamId: 2, callerId: 9, side: 'defense', down: 3, distanceYd: i < 3 ? 2 : 8, yardsToGoalYd: 50,
    personnel: '11', formation: null, playKind: null, concept: null, front: null, coverageFamily: i % 2 === 0 ? 'cover1' : 'cover3', pressureDesign: null, forced: false,
  });
  const opt: gp.BoardOptions = { window: { kind: 'recent', games: 4 }, bucket: (r) => gp.downDistanceId({ ...gp.NEUTRAL_STATE, down: r.down, distanceYd: r.distanceYd }), look: (r) => r.coverageFamily };
  it('every count equals the database count for the window, and no rate shows without its sample', () => {
    const board = gp.looksBoard(rows, 2026, opt);
    const hand = rows.filter((r) => r.gameOrder >= 3 && r.distanceYd === 2 && r.coverageFamily === 'cover1').length;
    const c = board.cells.find((x) => x.bucket === 'third_short' && x.look === 'cover1')!;
    expect(c.count).toBe(hand);
    expect(c.n).toBe(12);
    expect(c.rate).toBeCloseTo(hand / 12, 9);
    expect(c.lo!).toBeLessThan(c.rate!);
    const small = gp.looksBoard(rows, 2026, { ...opt, window: { kind: 'recent', games: 1 } });
    expect(small.cells.every((x) => x.rate === null && x.n < 5)).toBe(true);
  });
  it('marks a stale window and a caller change', () => {
    expect(gp.looksBoard(rows, 2027, opt).stale).toBe(true);
    const changed = rows.map((r) => (r.gameOrder === 6 ? { ...r, callerId: 10 } : r));
    expect(gp.looksBoard(changed, 2026, opt).callerChanged).toBe(true);
  });
  it('themes link evidence and calls, or are flagged; a sixth theme is warned', () => {
    const board = gp.looksBoard(rows, 2026, opt);
    const menu = [menuEntry('m1', 'p1', ['third_long'])];
    const ok: gp.Theme = { id: 't1', side: 'offense', text: 'beat their cover 3', kind: 'attack', evidence: ['third_long/cover3'], calls: ['m1'], installDay: 2 };
    expect(gp.checkThemes([ok], menu, board.cells).filter((w) => w.subject === 't1')).toEqual([]);
    const bad: gp.Theme = { ...ok, id: 't2', evidence: [], calls: [] };
    expect(gp.checkThemes([bad], menu, board.cells).map((w) => w.code)).toEqual(expect.arrayContaining(['themes.no_evidence', 'themes.no_calls']));
    const wrongDay: gp.Theme = { ...ok, id: 't3', installDay: 3 };
    expect(gp.checkThemes([wrongDay], menu, board.cells).map((w) => w.code)).toContain('themes.day_without_calls');
    const six = Array.from({ length: 6 }, (_, i) => ({ ...ok, id: `x${i}` }));
    expect(gp.checkThemes(six, menu, board.cells).map((w) => w.code)).toContain('themes.too_many');
  });
});

describe('G6.2 menu, new for this week, sequences', () => {
  const menu = [menuEntry('a', 'r1', ['first_10']), menuEntry('b', 'p1', ['third_long']), menuEntry('c', 'p2', ['third_short']), menuEntry('d', 'r2', ['first_10']), menuEntry('e', 's1', ['second_long'])];
  it('balance counts equal a hand count', () => {
    const b = gp.balance(menu, BOOK);
    expect(b.runPass).toEqual({ run: 2, pass: 3, other: 0 });
    expect(b.personnel).toEqual({ '11': 4, '12': 1 });
    expect(b.formation).toEqual({ trips: 2, doubles: 2, ace: 1 });
  });
  it('lists scouted looks above the line with no answering call', () => {
    const cells: gp.LookCell[] = [
      { bucket: 'third_long', look: 'cover3', count: 6, n: 10, rate: 0.6, lo: 0.4, hi: 0.8, refs: [] },
      { bucket: 'third_long', look: 'cover2', count: 4, n: 10, rate: 0.4, lo: 0.2, hi: 0.6, refs: [] },
      { bucket: 'third_long', look: 'cover0', count: 1, n: 10, rate: 0.1, lo: 0, hi: 0.3, refs: [] },
    ];
    expect(gp.unansweredLooks(cells, menu, BOOK).map((c) => c.look)).toEqual(['cover2']);
  });
  it('a new third-down play added after the second practice day projects lower than the same play added on day 1', () => {
    const week: gp.WeekInstall = { shortWeek: false, capacityUnits: 10, today: 1, repsFrom: (d) => Math.max(0, 8 - 3 * (d - 1)), projectReadiness: (_id, reps) => Math.min(100, reps * 15) };
    const m = [menuEntry('n', 'n1', ['third_medium'], 6)];
    const early = gp.newForWeek(m, BOOK, week, () => 1)[0]!;
    const late = gp.newForWeek(m, BOOK, week, () => 3)[0]!;
    expect(late.projectedReadiness).toBeLessThan(early.projectedReadiness);
    const meter = gp.installMeter(gp.newForWeek(m, BOOK, week, () => 3), m, week);
    expect(meter.warnings.map((w) => w.code)).toContain('install.late_item');
  });
  it('the meter equals the summed units, a known concept from a new formation costs a third and ranks first', () => {
    const week: gp.WeekInstall = { shortWeek: true, capacityUnits: 3, today: 0, repsFrom: () => 10, projectReadiness: () => 70 };
    const m = [menuEntry('x', 'n1', ['first_10']), menuEntry('y', 'n2', ['first_10'])];
    const withParent = book(PLAYS.map((p) => (p.id === 'n1' ? { ...p, status: 'installed' as const } : p)));
    const items = gp.newForWeek(m, withParent, week);
    expect(items.map((i) => i.playId)).toEqual(['n2']);
    expect(items[0]!.units).toBeCloseTo(1, 9);
    const all = gp.newForWeek(m, BOOK, week);
    const meter = gp.installMeter(all, m, week);
    expect(meter.units).toBeCloseTo(all.reduce((a, i) => a + i.units, 0), 9);
    expect(meter.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['install.short_week', 'install.over_capacity']));
  });
  it('a linked later call shows its reminder after the earlier one has been called', () => {
    const s: gp.Sequence = { id: 's', kind: 'set_up', calls: ['a', 'b'] };
    expect(gp.sequenceReminder(s, 1, () => 0)).toBe(false);
    expect(gp.sequenceReminder(s, 1, (id) => (id === 'a' ? 1 : 0))).toBe(true);
    const u: gp.Sequence = { id: 'u', kind: 'until_adjust', calls: ['a', 'b'], times: 3 };
    expect(gp.sequenceReminder(u, 1, () => 2)).toBe(false);
    expect(gp.checkSequences([{ id: 'z', kind: 'set_up', calls: ['a'] }], menu)[0]!.code).toBe('sequence.size');
  });
});

describe('G6.3 matchups and protection', () => {
  it('with perfect scouting the predicted defender matches the engine alignment, sorted by confidence', () => {
    const engine = (f: string): string => (f === 'trips' ? 'LB' : f === 'doubles' ? 'nickel' : 'safety');
    const opts = [{ formationId: 'trips', motionId: null }, { formationId: 'doubles', motionId: null }, { formationId: 'empty', motionId: null }];
    const predict: gp.AlignmentPredictor = (o) => (o.formationId === 'empty' ? null : { defender: engine(o.formationId), rules: [{ rule: 'strength', seen: o.formationId === 'trips' ? 2 : 9 }] });
    const res = gp.huntMatchup({ id: 'm', targetSlot: 'Y', playerId: 'te', wanted: ['LB', 'nickel'] }, opts, predict, [], BOOK);
    for (const r of res) if (!r.unscouted) expect(r.defender).toBe(engine(r.option.formationId));
    expect(res[0]!.option.formationId).toBe('doubles');
    expect(res.find((r) => r.option.formationId === 'trips')!.thin).toBe(true);
    expect(res.find((r) => r.option.formationId === 'empty')!.unscouted).toBe(true);
  });
  it('every menu pass shows an answer or a flag for every threat', () => {
    const menu = [menuEntry('a', 'p1', []), menuEntry('b', 'p2', []), menuEntry('c', 's1', []), menuEntry('d', 'r1', [])];
    const threats: gp.Threat[] = [{ id: 'edge', kind: 'rusher', name: '99', situationIds: [], primary: 'chip' }, { id: 'double_a', kind: 'pressure', name: 'double A', situationIds: [], primary: 'quick' }];
    const cells = gp.protectionMatrix(threats, menu, BOOK);
    expect(cells.length).toBe(3 * 2);
    expect(cells.find((c) => c.entryId === 'a' && c.threatId === 'double_a')!.answer).toBeNull();
    expect(cells.find((c) => c.entryId === 'b' && c.threatId === 'double_a')!.answer).toBe('quick');
    expect(gp.checkThreats(threats, cells).some((w) => w.code === 'protection.unanswered')).toBe(true);
    expect(gp.answerCost('seventh_protector', 0.5).routesLost).toBe(1);
  });
});

describe('G6.4 defensive plan and emphasis', () => {
  const def = (id: string, pkg: string, faced: string[], sit: string[], pressure: boolean): gp.MenuEntry => ({ id, side: 'defense', call: call(id), situationIds: sit, targetReps: 2, defense: { package: pkg, personnelFaced: faced, role: 'set', pressure, shell: pressure ? 'zero_high' : 'two_high' } });
  const rules: gp.DefensiveRules = { matching: { '11': 'nickel', '12': 'base' }, matchupRules: [], checks: [], pressureByDown: {}, quarterback: { containRules: true, spy: null }, bestPlayer: { playerId: null, plan: 'straight' }, unscoutedDefault: { nickel: 'n1' } };
  it('every personnel group used maps to a package and a call', () => {
    const menu = [def('n1', 'nickel', ['11'], ['d_third_4_6'], true)];
    const codes = gp.checkDefense(menu, rules, ['11', '12', '21']).map((w) => `${w.code}:${w.subject}`);
    expect(codes).toEqual(expect.arrayContaining(['defense.no_call:12', 'defense.no_package:21', 'defense.third_mix:d_third_4_6', 'defense.unscouted_default:base']));
  });
  it('balance meters and set-stress-break order', () => {
    const menu = [def('a', 'nickel', ['11'], ['third_long'], true), def('b', 'nickel', ['11'], ['third_long'], false)];
    expect(gp.defenseBalance(menu, () => 3).pressureByDown[3]).toBe(0.5);
    const ord = gp.setStressBreakOrder([{ defense: { role: 'break' as const } }, { defense: { role: 'set' as const } }]);
    expect(ord[0]!.defense!.role).toBe('set');
  });
  it('a dial with no practice period takes half effect and is warned at the end of its range', () => {
    expect(gp.dialEffect({ dial: 'takeaway', position: 2, practicePeriod: true })).toBe(1);
    expect(gp.dialEffect({ dial: 'takeaway', position: 2, practicePeriod: false })).toBe(0.5);
    expect(gp.checkDials([{ dial: 'takeaway', position: 2, practicePeriod: false }])[0]!.code).toBe('emphasis.unpracticed');
  });
});

describe('G6.5 tempo and contingencies', () => {
  it('projected possessions fall as chosen pace slows', () => {
    const d = [20, 25, 30, 35, 40].map((s) => gp.expectedDrives(s, 28, 28, 10.8));
    for (let i = 1; i < d.length; i++) expect(d[i]!).toBeLessThan(d[i - 1]!);
    expect(gp.expectedDrives(28, 28, 28, 10.8)).toBeCloseTo(10.8, 9);
  });
  it('adding a contingency lowers main reps per call by its unique reps; removing restores', () => {
    const main = [menuEntry('a', 'r1', []), menuEntry('b', 'p1', [])];
    const c: gp.Contingency = { id: 'qb', side: 'offense', trigger: { kind: 'qb_out', backupId: 'q2' }, calls: [menuEntry('x', 'p2', [], 6), menuEntry('y', 'r1', [], 4)] };
    expect(gp.contingencyReps(c, main)).toBe(6);
    expect(gp.mainRepsPerCall(40, main, [])).toBe(20);
    expect(gp.mainRepsPerCall(40, main, [c])).toBe(17);
    expect(gp.offeredWeather({ rainChance: 0.4, windMph: 21 })).toEqual(['wet', 'wind']);
    expect(gp.offeredWeather({ rainChance: 0.39, windMph: 20 })).toEqual([]);
  });
});

describe('G6.6 plan review', () => {
  it('every warning names its leaf and clears when its cause is fixed', () => {
    const base: gp.PlanReviewInput = { menu: [menuEntry('a', 'r1', ['first_10'])], culled: 100, themes: [], sequences: [], cells: [], book: BOOK, repsNeeded: 50, repsAvailable: 40, projectedReadiness: 70, extra: [], qbDislikes: ['r1'] };
    const r = gp.reviewPlan(base);
    expect(r.warnings.every((w) => /^G[5-7]\./.test(w.leaf))).toBe(true);
    expect(r.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['review.reps', 'review.qb_dislike', 'menu.practiced_range']));
    const fixed = gp.reviewPlan({ ...base, repsAvailable: 60, qbDislikes: [] });
    expect(fixed.warnings.map((w) => w.code)).not.toContain('review.reps');
    expect(fixed.warnings.map((w) => w.code)).not.toContain('review.qb_dislike');
  });
  it('approval and edit share', () => {
    let a: gp.Approval = { state: 'draft' };
    a = gp.submit(a, 1); a = gp.sendBack(a, 2, 'too big'); expect(a.state).toBe('sent_back');
    a = gp.submit(a, 3); a = gp.approve(a, 4, 'hc'); expect(a.state).toBe('approved');
    expect(gp.editShare([menuEntry('a', 'r1', []), menuEntry('b', 'r2', [])], [menuEntry('a', 'r1', []), menuEntry('c', 'p1', [])])).toBe(1);
  });
});

describe('G7.3 filling and the reduction', () => {
  it('the counter equals distinct play-plus-tag entries and the warning fires exactly at the ratio', () => {
    let s = gp.offenseTemplate();
    s = gp.addEntry(s, 'first_10', { id: '1', call: call('r1') });
    s = gp.addEntry(s, 'second_long', { id: '2', call: call('r1') });
    s = gp.addEntry(s, 'second_long', { id: '3', call: call('r1', ['left']) });
    expect(gp.sizeReport(s, 2).unique).toBe(2);
    expect(gp.sizeReport(s, 2).overReps).toBe(false);
    expect(gp.sizeReport(s, 1).overReps).toBe(true);
  });
  it('an off-plan call is marked not practiced; readiness is the passed staff estimate', () => {
    let s = gp.offenseTemplate();
    s = gp.addEntry(s, 'first_10', { id: '1', call: call('p3') });
    s = gp.addEntry(s, 'first_10', { id: '2', call: call('r1') });
    const v = gp.entryViews(s, [menuEntry('a', 'r1', [])], () => 61);
    expect(v.find((x) => x.entryId === '1')!.notInPlan).toBe(true);
    expect(v.find((x) => x.entryId === '2')!.notInPlan).toBe(false);
    expect(v.every((x) => x.readiness === 61)).toBe(true);
    s = gp.reorderBox(s, 'first_10', ['2', '1']);
    expect(s.boxes.find((b) => b.id === 'first_10')!.entries.map((e) => e.id)).toEqual(['2', '1']);
  });
  it('cut log and use rate', () => {
    let s = gp.offenseTemplate();
    s = gp.addEntry(s, 'first_10', { id: '1', call: call('r1') });
    s = gp.addEntry(s, 'first_10', { id: '2', call: call('p1') });
    expect(gp.useRate(s, ['r1', 'r1'])).toBe(0.5);
    const cut = gp.cutCalls(s, ['p1'], 1, 'busted', []);
    expect(gp.uniqueCalls(cut.sheet).size).toBe(1);
    expect(cut.log[0]!.reason).toBe('busted');
    expect(gp.cutCandidates([{ callKey: 'p1', reps: 3, busts: 2, completionRate: null, qbDislike: false }, { callKey: 'r1', reps: 3, busts: 0, completionRate: null, qbDislike: false }]).map((r) => r.callKey)).toEqual(['p1']);
  });
});

describe('G7.4 scripts', () => {
  const script: gp.ScriptEntry[] = [
    { id: 's1', call: call('r1', ['left']), purpose: 'show_formation', setsUp: 's3' },
    { id: 's2', call: call('p2'), purpose: 'early_completion', onlyIf: [{ on: 'distance', max: 6 }] },
    { id: 's3', call: call('p3'), purpose: 'set_up' },
  ];
  it('order equals designer order; a penalty does not use an entry; only-if entries are skipped', () => {
    let c = gp.START;
    const st = gp.NEUTRAL_STATE;
    expect(gp.currentEntry(script, c, st)!.id).toBe('s1');
    c = gp.afterSnap(script, c, 's1', false);
    expect(gp.currentEntry(script, c, st)!.id).toBe('s1');
    c = gp.afterSnap(script, c, 's1', true);
    expect(gp.currentEntry(script, c, st)!.id).toBe('s3');
    expect(gp.currentEntry(script, c, { ...st, distanceYd: 4 })!.id).toBe('s2');
    expect(gp.setUpReady(script, c, 's3')).toBe(true);
    c = gp.skip(c, 's3');
    expect(gp.currentEntry(script, c, st)).toBeNull();
  });
  it('variety counts match a hand count', () => {
    const v = gp.scriptVariety(script, BOOK);
    expect(v.runPass).toEqual({ run: 1, pass: 2 });
    expect(v.direction).toEqual({ left: 1, none: 2 });
    expect(v.reveals).toContain('reaction to jet');
    expect(gp.checkScript(script)[0]!.code).toBe('script.short');
  });
  it('the second script becomes active only after halftime; candidates trace to first-half marks', () => {
    expect(gp.secondScriptActive(2, 0)).toBe(false);
    expect(gp.secondScriptActive(3, 1)).toBe(true);
    const c = gp.halftimeCandidates([{ call: call('p1'), starred: true, yards: [], noAnswerNote: false, ref: 'm1' }, { call: call('r1'), starred: false, yards: [-2], noAnswerNote: false, ref: 'm2' }], []);
    expect(c.map((x) => x.source)).toEqual(['m1']);
  });
});

describe('G7.5 must-calls, notes, card', () => {
  it('an outstanding must-call is visible until called, and missed at the half', () => {
    const m: gp.MustCall[] = [{ id: 'm', call: call('p1'), target: { kind: 'by_half' } }, { id: 'n', call: call('r1'), target: { kind: 'at_least', times: 2 } }];
    let st = gp.mustCallStates(m, [], 2, 600);
    expect(st.map((s) => s.outstanding)).toEqual([true, true]);
    expect(st[0]!.brightness).toBe('bright');
    st = gp.mustCallStates(m, [{ callKey: 'p1', quarter: 2, yards: 5, touchedBy: null, shownLook: null }, { callKey: 'r1', quarter: 1, yards: 2, touchedBy: 'rb', shownLook: null }], 2, 300);
    expect(st.map((s) => s.outstanding)).toEqual([false, true]);
    expect(gp.mustCallStates(m, [], 3, 900)[0]!.missed).toBe(true);
    expect(gp.mustCallStates(m, [], 3, 900, new Set(['m']))[0]!.dismissed).toBe(true);
    expect(gp.brightness(4, 400)).toBe('brightest');
  });
  it('touch targets count touches and clear for inactive players', () => {
    const t = gp.touchStates([{ playerId: 'wr', min: 3, promised: true }, { playerId: 'x', min: 3, promised: false }], [{ callKey: 'p1', quarter: 1, yards: 5, touchedBy: 'wr', shownLook: null }], new Set(['x']), new Set());
    expect(t[0]!.outstanding).toBe(true);
    expect(t[1]!.cleared).toMatch(/not active/);
  });
  it('a tendency note shows rate and sample together', () => {
    expect(gp.noteLine({ id: 'n', boxId: null, kind: 'tendency', text: 'man on 3rd and 6-9', tendency: { cell: 'x', count: 7, n: 8 } }, { count: 1, n: 1 })).toBe('man on 3rd and 6-9: 7 of 8 (today 1 of 1)');
  });
  it('kneel-down arithmetic reads the play clock by key; edits are flagged and logged', () => {
    const rules = { num: (k: string) => ({ 'clock.play_clock_s': 40, 'timeout.per_half': 3 } as Record<string, number>)[k]! };
    const tbl = gp.kneelTable(rules);
    expect(tbl.length).toBe(4);
    expect(tbl[0]!.secondsKilled).toBe(3 * 2 + 3 * 39);
    expect(tbl[3]!.secondsKilled).toBe(6);
    const card: gp.HeadCoachCard = { fourth: [{ distanceYd: 1, yardsToGoalYd: 50, call: 'punt', trace: 'chart v1' }], twoPoint: [{ scoreDiff: -8, goForTwo: true, trace: 'chart v1' }], timeoutRules: [], inBoundsPlayS: 17, kneel: tbl, fieldGoalLine: { withWind: 38, intoWind: 30 }, crewTendencies: [], trickHistory: [], depthCard: [], standingInstructions: [], edits: [], stale: [] };
    const e = gp.editFourth(card, 1, 50, 'go', 10);
    expect(gp.isEdited(e, 'fourth', '1@50')).toBe(true);
    expect(e.edits[0]).toMatchObject({ from: 'punt', to: 'go' });
    expect(gp.fieldGoalLine((y) => (y <= 35 ? 0.8 : 0.3))).toBe(35);
    expect(gp.refreshed(gp.markStale(card, ['fieldGoalLine']), 'fieldGoalLine').stale).toEqual([]);
  });
});

describe('G7.6 wristband and audibles', () => {
  const format: Parameters<typeof gp.fillBand>[1] = { flaps: 1, sides: 1, cellsPerSide: 4, scheme: 'number', colors: [], wearers: 'qb' };
  it('every band number maps to exactly one call and shows beside the call', () => {
    let s = gp.offenseTemplate();
    ['r1', 'r2', 'p1', 'p2', 'p3', 's1'].forEach((id, i) => { s = gp.addEntry(s, 'first_10', { id: `e${i}`, call: call(id) }); });
    const band = gp.fillBand(s, format, [call('s1')], (c) => c.playId.length, () => 1, 1);
    expect(band.length).toBe(4);
    expect(gp.bandProblems(band)).toEqual([]);
    const withBand = { ...s, wristband: band };
    expect(gp.bandNumberOf(withBand, call('s1'))).toBe(band[0]!.label);
    expect(gp.bandProblems([...band, band[0]!])).not.toEqual([]);
  });
  it('the quarterback never audibles outside the list in 1,000 tries at full freedom', () => {
    const sheet = { audibleList: [{ name: 'a', call: call('r1') }, { name: 'b', call: call('p2') }] };
    const ids = PLAYS.map((p) => p.id);
    let x = 7;
    for (let i = 0; i < 1000; i++) {
      x = (x * 1103515245 + 12345) % 2147483648;
      const target = ids[x % ids.length]!;
      if (gp.mayAudibleTo(sheet, 'full', call('p1'), target)) expect(['r1', 'p2']).toContain(target);
    }
    expect(gp.mayAudibleTo(sheet, 'package', { playId: 'r1', tags: [], second: { playId: 'p2', tags: [] } }, 'p2')).toBe(true);
    expect(gp.mayAudibleTo(sheet, 'none', call('r1'), 'r1')).toBe(false);
    expect(gp.checkAudibles([{ name: 'n', call: call('n1') }], BOOK, () => 1)[0]!.code).toBe('audible.not_installed');
  });
});

describe('G7.7 defensive and special teams sheets', () => {
  it('defensive focus by personnel, with the nearest group for one not on the sheet', () => {
    const s = gp.defenseTemplate();
    const st: gp.SituationState = { ...gp.NEUTRAL_STATE, personnel: '12' };
    expect(gp.defenseFocus(s, st, () => null)!.id).toBe('vs_12');
    expect(gp.defenseFocus(s, { ...st, personnel: '13' }, () => '12')!.id).toBe('vs_12');
    expect(gp.defenseFocus(s, { ...st, down: 3, distanceYd: 8 }, () => null)!.id).toBe('d_third_7_9');
  });
  it('stress highlight never before 4 snaps against the set call', () => {
    expect(gp.stressHighlight(3, 3)).toBe(false);
    expect(gp.stressHighlight(2, 4)).toBe(true);
    expect(gp.stressHighlight(1, 4)).toBe(false);
  });
  it('every kicking situation has a box in the template, and a missing one is listed', () => {
    const s = gp.specialTeamsTemplate();
    expect(gp.missingKickingBoxes(s)).toEqual([]);
    expect(gp.missingKickingBoxes({ ...s, boxes: s.boxes.filter((b) => b.id !== 'st_onside') })).toEqual(['onside']);
  });
});

describe('G7.8 versions, G7.9 review, lock, marks and print', () => {
  let base = gp.offenseTemplate();
  ['r1', 'p1', 'p2', 'old'].forEach((id, i) => { base = gp.addEntry(base, 'first_10', { id: `e${i}`, call: call(id), ...(id === 'p2' ? { weatherRisk: true } : {}) }); });
  it('switching versions changes entries and leaves every box position and key unchanged', () => {
    const v = gp.draftBackupVersion(base, 'v1', 'q2', (c) => (c.playId === 'r1' ? 80 : 40));
    const s = gp.applyVersion(base, v);
    expect(s.boxes.map((b) => [b.id, b.side, b.col, b.row])).toEqual(base.boxes.map((b) => [b.id, b.side, b.col, b.row]));
    expect([...gp.keyMap(s).boxes]).toEqual([...gp.keyMap(base).boxes]);
    expect(s.boxes.find((b) => b.id === 'first_10')!.entries.map((e) => e.id)).toEqual(['e0']);
    expect(gp.checkVersion(base, v, gp.proReference2024()).map((w) => w.code)).toContain('version.small');
    expect(gp.applyVersion(base, gp.draftWeatherVersion(base, 'w', 'wet')).boxes.find((b) => b.id === 'first_10')!.entries.map((e) => e.id)).not.toContain('e2');
  });
  it('each planted fault appears in the report, and broken entries block locking', () => {
    const r = gp.reviewSheet({
      sheet: base, book: BOOK, table: gp.proReference2024(), practiced: (c) => c.playId !== 'p2', readiness: (c) => (c.playId === 'p1' ? 30 : 80),
      overLimit: (c) => c.playId === 'r1', needsDoubtful: (c) => (c.playId === 'r1' ? 'wr1' : null), repsAvailable: 2, qbDislikes: new Set(['p1']),
    });
    const codes = new Set(r.items.map((i) => i.code));
    for (const c of ['missing_situation', 'empty_box', 'broken_entry', 'unpracticed', 'low_readiness', 'over_length', 'doubtful_player', 'qb_dislike', 'size_vs_reps']) expect(codes.has(c)).toBe(true);
    expect(() => gp.lockSheet(base, r, 5)).toThrow(gp.LockError);
    const clean = { ...r, items: r.items.filter((i) => !i.blocks) };
    const locked = gp.lockSheet(base, clean, 5);
    expect(locked.lockedAt).toBe(5);
    expect(gp.lockedEditAllowed(locked, 'weather')).toBe(true);
    expect(gp.lockedEditAllowed(locked, 'other')).toBe(false);
  });
  it('a formation where every call is a run shows as a tell', () => {
    let s = gp.offenseTemplate();
    ['r1', 'r1x', 'r1y'].forEach((id) => { s = gp.addEntry(s, 'first_10', { id, call: call(id) }); });
    const b = book([...PLAYS, play('r1x', 'run', { formation: 'trips' }), play('r1y', 'run', { formation: 'trips' })]);
    const r = gp.reviewSheet({ sheet: s, book: b, table: null, practiced: () => true, readiness: () => 90, overLimit: () => false, needsDoubtful: () => null, repsAvailable: 100, qbDislikes: new Set() });
    expect(r.items.some((i) => i.code === 'formation_tell' && i.subject === 'trips')).toBe(true);
  });
  it('tally equals the call log at every dead ball; marks survive a version switch', () => {
    const log: gp.CallLogLine[] = [
      { callKey: 'r1', quarter: 1, yards: 4, touchedBy: 'rb', shownLook: 'cover3' },
      { callKey: 'p1', quarter: 1, yards: 0, touchedBy: 'wr', shownLook: null },
      { callKey: 'r1', quarter: 2, yards: 7, touchedBy: 'rb', shownLook: null },
    ];
    let m: Map<string, gp.EntryMarks> = new Map();
    for (let i = 0; i < log.length; i++) {
      m = gp.recordCall(m, log[i]!);
      const upto = log.slice(0, i + 1);
      for (const k of ['r1', 'p1']) expect(m.get(k)?.tally ?? 0).toBe(upto.filter((l) => l.callKey === k).length);
    }
    expect(gp.marksFromLog(log)).toEqual(m);
    const x = gp.addMark(m, 'p1', { kind: 'cross' });
    expect(x.keyPresses).toBe(1);
    expect(gp.isCrossed(x.marks, 'p1')).toBe(true);
  });
  it('print matches the grid in box positions and entry order, and flags overflow', () => {
    const boxes = gp.printLayout(base, 'tabloid', (e) => e.call.playId);
    const f = boxes.find((b) => b.id === 'first_10')!;
    const src = base.boxes.find((b) => b.id === 'first_10')!;
    expect(f.xIn).toBeCloseTo((src.col / 24) * 17, 9);
    expect(f.lines.slice(1)).toEqual(src.entries.map((e) => e.call.playId));
    expect(boxes.every((b) => b.textPt >= 7)).toBe(true);
    let dense = base;
    for (let i = 0; i < 30; i++) dense = gp.addEntry(dense, 'first_10', { id: `d${i}`, call: call('r1', [`t${i}`]) });
    expect(gp.printLayout(dense, 'letter', (e) => e.call.playId).find((b) => b.id === 'first_10')!.overflow).toBe(true);
  });
});

describe('params', () => {
  it('every design constant is readable and in range', () => {
    for (const p of gp.PARAMS.params) {
      expect(p.value).toBeGreaterThanOrEqual(p.min);
      expect(p.value).toBeLessThanOrEqual(p.max);
    }
    expect(() => gp.param('nope')).toThrow();
  });
});
