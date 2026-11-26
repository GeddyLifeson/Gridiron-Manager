// G-60 follow-up: the next-call queue (I2.3.6) and the third-down kicking-unit alert (I4.1.1).
import { describe, it, expect } from 'vitest';
import type { DecisionRequest } from '@gm/schema';
import {
  ConsoleKeyDriver, assignKeys, initialConsole, markers, openRequest, unitChangeTenths, param,
  type CallSheet, type ConsoleConfig, type OpenInput, type SheetSituation,
} from '../../src/commands/game-calling/index.ts';
import { buildConsoleView } from '../../src/read-models/game-calling/index.ts';
import { RESERVED, offenseSheet, resolve, testConsoleConfig } from './fixtures.ts';

const SIT: SheetSituation = { down: 1, distance: 10, toGoal: 75, twoMinute: false, lastPlayOfHalf: false, scoreDiff: 0, personnel: null, suddenChange: false, noHuddle: false };
let reqId = 1;
const req = (type: DecisionRequest['type'] = 'snapping_call'): DecisionRequest =>
  ({ requestId: reqId++, type, side: 0, options: [], deadlinePlayClockTenths: 150, windowTenths: null, defaultOptionId: null });
const input = (over: Partial<OpenInput> = {}): OpenInput => ({
  request: req(), situation: SIT, kind: 'scrimmage', playClockTenths: 400, atMs: 0, personnelOnField: '11', insideTwoMinute: false,
  legal: { timeout: true, challenge: false }, timeoutReason: null, challengeReason: null, offenseSetTenths: 150, afterTimeout: false, suggestion: null, ...over,
});

/** The fixture offense sheet plus three second-down boxes by distance (short, medium, long). */
function queueConfig(over: Partial<ConsoleConfig> = {}): ConsoleConfig {
  const base = offenseSheet();
  const first = base.boxes.find((b) => b.id === 'first')!;
  const mk = (id: string, col: number, distMin: number, distMax: number) => ({ ...first, id, title: id, row: 3, col, rule: { downs: [2], distMin, distMax }, entries: first.entries.map((e) => ({ ...e, id: `${id}_${e.id}` })) });
  const sheet: CallSheet = { ...base, boxes: [...base.boxes, mk('2nd_short', 0, 0, 4), mk('2nd_medium', 1, 5, 8), mk('2nd_long', 2, 9, 99)] };
  const cfg = testConsoleConfig(over);
  return { ...cfg, sheets: { ...cfg.sheets, offense: sheet }, keys: { ...cfg.keys, offense: assignKeys(sheet, RESERVED) } };
}

function sentDriver(cfg: ConsoleConfig) {
  const d = new ConsoleKeyDriver(initialConsole(cfg), { resolve, keyIntervalMs: 200 });
  d.state = openRequest(d.state, input());
  d.pressAll(['Digit1', 'Enter']);
  expect(d.state.step).toBe('sent');
  return d;
}
const letter = (cfg: ConsoleConfig, box: string) => cfg.keys.offense!.box[box]!;

describe('next-call queue (I2.3.6)', () => {
  it('three second-down entries queued: the box that occurs is preselected, the others cleared, nothing sent without a confirm', () => {
    const cfg = queueConfig();
    const d = sentDriver(cfg);
    d.pressAll([...letter(cfg, '2nd_short'), 'Digit2', ...letter(cfg, '2nd_medium'), 'Digit3', ...letter(cfg, '2nd_long'), 'Digit4']);
    expect(d.state.queue.map((q) => q.boxId)).toEqual(['2nd_short', '2nd_medium', '2nd_long']);
    const commitsBefore = d.commands.filter((c) => c.type === 'call.commit').length;
    d.state = openRequest(d.state, input({ situation: { ...SIT, down: 2, distance: 6 }, atMs: d.nowMs }));
    expect(d.state.focus.boxId).toBe('2nd_medium');
    expect(d.state.selected?.entryId).toBe(cfg.sheets.offense!.boxes.find((b) => b.id === '2nd_medium')!.entries[2]!.id);
    expect(d.state.notice).toBe('console.queuedReady');
    expect(d.state.queue).toEqual([]);
    expect(d.state.step).toBe('select');
    expect(d.commands.filter((c) => c.type === 'call.commit').length).toBe(commitsBefore);
    // One key confirms it.
    d.press('Enter');
    expect(d.state.step).toBe('sent');
  });

  it('a box queued twice keeps the newest; the queue holds at most queueMax entries', () => {
    const cfg = queueConfig();
    const d = sentDriver(cfg);
    d.pressAll([...letter(cfg, '2nd_short'), 'Digit1', ...letter(cfg, '2nd_short'), 'Digit2']);
    expect(d.state.queue).toHaveLength(1);
    const boxes = ['2nd_medium', '2nd_long', 'third', 'red'];
    for (const b of boxes) d.pressAll([...letter(cfg, b), 'Digit1']);
    expect(d.state.queue).toHaveLength(param('queueMax'));
    expect(d.state.notice).toBe('console.queueFull');
  });

  it('a turnover, score or penalty clears the queue', () => {
    const cfg = queueConfig();
    const d = sentDriver(cfg);
    d.pressAll([...letter(cfg, '2nd_medium'), 'Digit1']);
    d.state = openRequest(d.state, input({ situation: { ...SIT, down: 2, distance: 6 }, atMs: d.nowMs, clearQueue: true }));
    expect(d.state.selected).toBeNull();
    expect(d.state.queue).toEqual([]);
  });

  it('auto-send only with the hurry-up option on and never for a call whose player is out', () => {
    const cfg = queueConfig({ sendQueuedAtOnce: true, defaultTempo: 'hurry_up' });
    const d = sentDriver(cfg);
    d.pressAll([...letter(cfg, '2nd_medium'), 'Digit1']);
    d.state = openRequest(d.state, input({ situation: { ...SIT, down: 2, distance: 6 }, atMs: d.nowMs }));
    expect(d.state.step).toBe('sent');

    const sheet = cfg.sheets.offense!;
    const hurt: CallSheet = { ...sheet, boxes: sheet.boxes.map((b) => (b.id === '2nd_medium' ? { ...b, entries: b.entries.map((e) => ({ ...e, replacement: 'No. 2 back' })) } : b)) };
    const cfg2 = { ...cfg, sheets: { ...cfg.sheets, offense: hurt } };
    const d2 = sentDriver(cfg2);
    d2.pressAll([...letter(cfg2, '2nd_medium'), 'Digit1']);
    d2.state = openRequest(d2.state, input({ situation: { ...SIT, down: 2, distance: 6 }, atMs: d2.nowMs }));
    expect(d2.state.step).toBe('select');
    expect(d2.state.notice).toBe('console.replacement');
  });

  it('the view lists the queue', () => {
    const cfg = queueConfig();
    const d = sentDriver(cfg);
    d.pressAll([...letter(cfg, '2nd_long'), 'Digit4']);
    const v = buildConsoleView({
      console: d.state, atMs: d.nowMs, personnelOnField: '11', opponentPersonnel: null, booth: null, tendency: null, challengesLeft: 2, keyFor: () => null,
      strip: { period: 1, clockTenths: 9000, clockRunning: true, score: [0, 0], down: 1, distance: 10, spot: { side: 'own', yard: 25 }, hash: 'middle', timeoutsLeft: [3, 3], playClockLengthTenths: 400, shortClock: false },
    });
    expect(v.queue).toEqual([{ box: '2nd_long', label: 'Smash' }]);
  });
});

describe('third-down kicking-unit alert (I4.1.1)', () => {
  const third = () => input({ situation: { ...SIT, down: 3, distance: 7, toGoal: 60 }, bookLine: '4th and 2 or less: go. Longer: punt' });
  const fourth = (atMs: number) => input({ request: req(), kind: 'fourth_down', situation: { ...SIT, down: 4, distance: 5, toGoal: 58 }, atMs });

  it('pre-commit cycles on third down only, and the view shows it with the book line', () => {
    const d = new ConsoleKeyDriver(initialConsole(testConsoleConfig()), { resolve, keyIntervalMs: 200 });
    d.state = openRequest(d.state, input());
    d.press('KeyK');
    expect(d.state.precommit).toBe('decide_then');
    expect(d.state.notice).toBe('console.precommitThirdOnly');
    d.state = openRequest(d.state, third());
    d.press('KeyK');
    expect(d.state.precommit).toBe('punt');
    d.pressAll(['KeyK', 'KeyK', 'KeyK']);
    expect(d.state.precommit).toBe('decide_then');
    const v = buildConsoleView({
      console: d.state, atMs: d.nowMs, personnelOnField: '11', opponentPersonnel: null, booth: null, tendency: null, challengesLeft: 2, keyFor: () => 'KeyK',
      strip: { period: 1, clockTenths: 9000, clockRunning: true, score: [0, 0], down: 3, distance: 7, spot: { side: 'own', yard: 40 }, hash: 'middle', timeoutsLeft: [3, 3], playClockLengthTenths: 400, shortClock: false },
    });
    expect(v.precommit).toEqual({ choice: 'console.precommit.decide_then', bookLine: '4th and 2 or less: go. Longer: punt', key: 'KeyK' });
  });

  it('a pre-committed punt opens fourth down on the punt call, alerted; decide-then shows the choice', () => {
    const d = new ConsoleKeyDriver(initialConsole(testConsoleConfig()), { resolve, keyIntervalMs: 200 });
    d.state = openRequest(d.state, third());
    d.pressAll(['KeyK', 'Digit1', 'Enter']); // pre-commit punt, then call the third-down play
    d.settle();
    d.state = openRequest(d.state, fourth(d.nowMs));
    expect(d.state.step).toBe('select');
    expect(d.state.open?.unit).toBe('special');
    expect(d.state.focus.boxId).toBe('punt');
    expect(d.state.alerted).toBe('punt');
    expect(d.state.notice).toBe('console.unitReady');
    d.press('Enter');
    expect(d.state.sent?.entry.call).toMatchObject({ unit: 'kick', kickKind: 'punt' });

    const d2 = new ConsoleKeyDriver(initialConsole(testConsoleConfig()), { resolve, keyIntervalMs: 200 });
    d2.state = openRequest(d2.state, third());
    d2.state = openRequest(d2.state, fourth(d2.nowMs));
    expect(d2.state.step).toBe('fourth');
    expect(d2.state.alerted).toBeNull();
  });

  it('unit timing: alerted is fastest, not alerted adds time, a change of mind after the unit started costs the run-off', () => {
    const alerted = unitChangeTenths('punt', 'punt', false);
    const cold = unitChangeTenths('punt', null, false);
    const reversed = unitChangeTenths('field_goal', 'punt', true);
    expect(cold - alerted).toBe(param('unalertedUnitTenths'));
    expect(reversed).toBe(param('fieldGoalUnitTenths') + param('unalertedUnitTenths') + param('reversalTenths'));
    // Acceptance shape: alerted, confirmed at 30 s on a 40 s clock, the unit is set with at least 10 s left.
    const d = new ConsoleKeyDriver(initialConsole(testConsoleConfig()), { resolve, keyIntervalMs: 200 });
    d.state = openRequest(d.state, third());
    d.press('KeyK');
    d.state = openRequest(d.state, fourth(d.nowMs));
    const latest = markers(d.state)!.latestTenths;
    expect(300 - (latest - param('minPresnapTenths'))).toBeGreaterThanOrEqual(100);
    // Backing out and choosing the field goal: the marker moves by the unalerted time and the reversal.
    d.press('Backspace');
    expect(d.state.step).toBe('fourth');
    d.press('Digit3');
    expect(d.state.reversal).toBe(true);
    expect(markers(d.state)!.latestTenths - latest).toBe(param('fieldGoalUnitTenths') - param('puntUnitTenths') + param('unalertedUnitTenths') + param('reversalTenths'));
  });

  it('the defense never gets the offense pre-commit', () => {
    const d = new ConsoleKeyDriver(initialConsole(testConsoleConfig()), { resolve, keyIntervalMs: 200 });
    d.state = openRequest(d.state, { ...third(), request: req('opposing_call') });
    d.press('KeyK');
    expect(d.state.precommit).toBe('decide_then');
  });
});
