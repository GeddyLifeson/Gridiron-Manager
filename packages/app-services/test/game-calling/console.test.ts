// G-60 console units: sheet keys and focus (O2.2.2, I2.2.2), the call cycle markers (I2.1.1, I3.1.1), late
// outcomes (I2.1.3), tags (I2.3.2), the guard (O2.5.3), one timeout per dead ball (B1), recall (O2.2.3), the
// deadline default (J11.6.1), remapped keys in the hint bar (O2.5.2), the observed-only view (O2.1.2) and the
// pause probe (R1.2.6 item 6).
import { describe, it, expect } from 'vitest';
import { shell } from '@gm/app-ui';
import type { DecisionRequest } from '@gm/schema';
import {
  ConsoleKeyDriver, assignKeys, focusBox, initialConsole, lateOutcome, markers, offenseMarkers, openRequest, param,
  type CallSheet, type ConsoleConfig, type OpenInput, type SheetSituation,
} from '../../src/commands/game-calling/index.ts';
import { buildConsoleView, type ConsoleViewInput } from '../../src/read-models/game-calling/index.ts';
import { RESERVED, resolve, testConsoleConfig } from './fixtures.ts';

const SIT: SheetSituation = { down: 1, distance: 10, toGoal: 75, twoMinute: false, lastPlayOfHalf: false, scoreDiff: 0, personnel: null, suddenChange: false, noHuddle: false };
const req = (type: DecisionRequest['type'], over: Partial<DecisionRequest> = {}): DecisionRequest =>
  ({ requestId: 7, type, side: 0, options: [], deadlinePlayClockTenths: 150, windowTenths: null, defaultOptionId: null, ...over });
const open = (over: Partial<OpenInput> = {}): OpenInput => ({
  request: req('snapping_call'), situation: SIT, kind: 'scrimmage', playClockTenths: 400, atMs: 0, personnelOnField: '11', insideTwoMinute: false,
  legal: { timeout: true, challenge: false }, timeoutReason: null, challengeReason: null, offenseSetTenths: 150, afterTimeout: false, suggestion: null, ...over,
});
function driver(o: Partial<OpenInput> = {}, cfg: Partial<ConsoleConfig> = {}, resolver = resolve) {
  const d = new ConsoleKeyDriver(initialConsole(testConsoleConfig(cfg)), { resolve: resolver, keyIntervalMs: 200 });
  d.state = openRequest(d.state, open(o));
  return d;
}

describe('sheet keys (O2.2.2)', () => {
  it('box letters skip the letters the console binds', () => {
    const k = assignKeys(testConsoleConfig().sheets.offense!, RESERVED);
    const used = Object.values(k.box).flat();
    for (const r of RESERVED) expect(used).not.toContain(r);
    expect(RESERVED).toContain('KeyT');
    expect(RESERVED).toContain('KeyC');
  });

  it('20 boxes of 10 entries: every entry is at most 2 presses plus Enter, overflow boxes get two letters', () => {
    const boxes = Array.from({ length: 20 }, (_, b) => ({
      id: `b${b}`, title: `b${b}`, row: Math.floor(b / 5), col: b % 5, rule: null,
      entries: Array.from({ length: 10 }, (_, e) => ({ ...testConsoleConfig().sheets.offense!.boxes[0]!.entries[0]!, id: `b${b}e${e}` })),
    }));
    const sheet: CallSheet = { id: 'big', unit: 'offense', boxes };
    const keys = assignKeys(sheet, RESERVED);
    const lengths = Object.values(keys.box).map((c) => c.length);
    expect(lengths.filter((l) => l === 2).length).toBeGreaterThan(0);
    // Single-letter boxes: letter + digit + Enter. Every entry key is a digit (10 per box).
    expect(Object.values(keys.entry).every((k) => /^Digit\d$/.test(k))).toBe(true);
    const d = new ConsoleKeyDriver(initialConsole({ ...testConsoleConfig(), sheets: { offense: sheet }, keys: { offense: keys } }), { resolve });
    d.state = openRequest(d.state, open({ playClockTenths: 4000 }));
    let worst = 0;
    for (const b of boxes) for (const e of b.entries) {
      d.state = openRequest(d.state, open({ playClockTenths: 4000, atMs: d.nowMs }));
      const presses = [...keys.box[b.id]!, keys.entry[e.id]!];
      d.pressAll(presses);
      const sel = d.state.selected;
      expect(sel?.entryId).toBe(e.id);
      if (keys.box[b.id]!.length === 1) worst = Math.max(worst, presses.length);
      else expect(presses).toHaveLength(3);
    }
    // A single-letter box costs letter + digit (+ Enter); an overflow box one more letter, the chord prefix.
    // In the focused box an entry is one digit.
    expect(worst).toBe(2);
    expect(Object.values(keys.box).filter((c) => c.length === 1)).toHaveLength(26 - RESERVED.length - 1);
  });
});

describe('focus (I2.2.2, I3.2.2)', () => {
  const sheet = testConsoleConfig().sheets.offense!;
  const cases: [Partial<SheetSituation>, string, string][] = [
    [{ toGoal: 12 }, 'red', 'rule'],
    [{ twoMinute: true }, 'two_minute', 'rule'],
    [{ down: 3, distance: 7 }, 'third', 'rule'],
    [{ down: 1 }, 'first', 'base'],
    [{ down: 2 }, 'second', 'base'],
    [{ down: 4 }, 'fourth', 'base'],
    [{ down: null, distance: null, toGoal: 2 }, 'red', 'rule'],
  ];
  for (const [s, box, how] of cases) it(`${JSON.stringify(s)} -> ${box}`, () => {
    expect(focusBox(sheet, { ...SIT, ...s })).toMatchObject({ boxId: box, how });
  });
});

describe('call cycle markers (I2.1.1, I3.1.1)', () => {
  const base = { spokenTenths: 20, relay: 'radio' as const, tempo: 'huddle' as const, substitution: false, afterTimeout: false, radioCutoffTenths: 150 };
  it('the marker moves earlier with a longer call and with a substitution', () => {
    const m0 = offenseMarkers(base).latestTenths;
    expect(offenseMarkers({ ...base, spokenTenths: 40 }).latestTenths).toBeGreaterThan(m0);
    expect(offenseMarkers({ ...base, substitution: true }).latestTenths).toBeGreaterThan(m0);
  });
  it('the console marker moves when a personnel change makes a substitution', () => {
    const d = driver();
    d.pressAll(['Digit1']);
    const m1 = markers(d.state)!.latestTenths;
    d.pressAll(['KeyG', 'Digit2', 'Digit2']);
    expect(d.state.personnel).toBe('22');
    expect(markers(d.state)!.latestTenths).toBeGreaterThan(m1);
  });
  it('a call at 2 s is a timeout when the user burns one, else a delay of game (I2.1.3)', () => {
    const standing = { burnTimeoutToSaveYards: true, timeoutsLeft: 2, timeoutTakenThisDeadBall: false };
    expect(lateOutcome(20, base, standing)).toBe('timeout');
    expect(lateOutcome(20, base, { ...standing, burnTimeoutToSaveYards: false })).toBe('delay_of_game');
    expect(lateOutcome(20, base, { ...standing, timeoutsLeft: 0 })).toBe('delay_of_game');
    expect(lateOutcome(400, base, standing)).toBe('normal');
  });
});

describe('the key state machine', () => {
  it('two tags of one group: the new one replaces the old (I2.3.2)', () => {
    const d = driver();
    d.pressAll(['Digit1', 'KeyM', 'Digit1']);
    expect(d.state.tags).toEqual(['m_jet']);
    d.pressAll(['KeyM', 'Digit2']);
    expect(d.state.tags).toEqual(['m_orbit']);
    expect(d.state.notice).toBe('console.tagNotInstalled');
  });

  it('guard: a tap does not challenge, a hold does, and no guard under 3 s (O2.5.3)', () => {
    const r = req('challenge', { options: [{ optionId: 'none', labelKey: 'x' }, { optionId: 'catch', labelKey: 'y' }], deadlinePlayClockTenths: null, defaultOptionId: 'none' });
    const d = driver({ request: r, kind: 'option', legal: { timeout: false, challenge: true } });
    d.press('KeyC');
    expect(d.commands.filter((c) => c.type === 'challenge')).toHaveLength(0);
    expect(d.state.notice).toBe('console.holdToConfirm');
    d.press('Hold+KeyC');
    expect(d.commands.filter((c) => c.type === 'challenge')).toHaveLength(1);
    const late = driver({ request: r, kind: 'option', legal: { timeout: false, challenge: true }, playClockTenths: param('guardMinClockTenths') - 1 });
    late.press('KeyC');
    expect(late.commands.filter((c) => c.type === 'challenge')).toHaveLength(1);
  });

  it('one team timeout per dead ball', () => {
    const d = driver();
    d.press('KeyT');
    d.press('KeyT');
    expect(d.commands.filter((c) => c.type === 'timeout')).toHaveLength(1);
    d.state = openRequest(d.state, open({ atMs: d.nowMs, sameDeadBall: true }));
    d.press('KeyT');
    expect(d.commands.filter((c) => c.type === 'timeout')).toHaveLength(1);
    d.state = openRequest(d.state, open({ atMs: d.nowMs }));
    d.press('KeyT');
    expect(d.commands.filter((c) => c.type === 'timeout')).toHaveLength(2);
  });

  it('recall before the marker, at the time cost of a new call (O2.2.3)', () => {
    const d = driver();
    d.pressAll(['Digit1', 'Enter']);
    expect(d.state.step).toBe('sent');
    expect(d.state.sent?.committed).toBe(false);
    d.press('Backspace');
    expect(d.state.step).toBe('select');
    d.pressAll(['Digit2', 'Enter']);
    d.settle();
    const commit = d.commands.find((c) => c.type === 'call.commit');
    expect(commit && commit.type === 'call.commit' && commit.call.entry.label).toBe('Power');
    // Five keys at 200 ms: the reading moved one second.
    expect(commit && commit.type === 'call.commit' && commit.call.acceptedAtPlayClockTenths).toBe(390);
  });

  it('no call by the deadline plays the default (J11.6.1)', () => {
    const d = driver({ playClockTenths: 200 });
    d.wait(4000);
    expect(d.commands.filter((c) => c.type === 'deadline.default')).toHaveLength(0);
    d.wait(1000);
    expect(d.commands.filter((c) => c.type === 'deadline.default')).toHaveLength(1);
    expect(d.state.step).toBe('idle');
  });

  it('a fixed-window prompt closes after its window of real time', () => {
    const d = driver({ request: req('penalty_choice', { options: [{ optionId: 'a', labelKey: 'a' }, { optionId: 'b', labelKey: 'b' }], deadlinePlayClockTenths: null, windowTenths: 50, defaultOptionId: 'a' }), kind: 'option' });
    d.wait(4900);
    expect(d.commands).toHaveLength(0);
    d.wait(200);
    expect(d.commands.map((c) => c.type)).toEqual(['deadline.default']);
  });

  it('fourth down on defense: 2 opens the punt return box', () => {
    const d = driver({ request: req('opposing_call'), kind: 'fourth_down', situation: { ...SIT, down: 4 } });
    expect(d.state.step).toBe('fourth');
    d.press('Digit2');
    expect(d.state.open?.unit).toBe('special');
    expect(d.state.focus.boxId).toBe('punt_return');
  });

  it('own and opponent kicks open the special sheet on the kick box', () => {
    expect(driver({ kind: 'own_kick', kickKind: 'try_kick' }).state.focus.boxId).toBe('try');
    expect(driver({ request: req('opposing_call'), kind: 'opponent_kick', kickKind: 'kick_return' }).state.focus.boxId).toBe('kick_return');
  });

  it('the pause probe is refused: no command stops the clock', () => {
    const d = driver();
    for (const c of ['pause', 'game.pause', 'clock.stop', 'slow']) expect(d.send(c).accepted).toBe(false);
  });
});

describe('console view (O2.1.1, O2.5.2)', () => {
  const strip = { period: 1, clockTenths: 9000, clockRunning: false, score: [0, 0] as const, down: 1, distance: 10, spot: { side: 'own' as const, yard: 25 }, hash: 'middle' as const, timeoutsLeft: [3, 3] as const, playClockLengthTenths: 400, shortClock: false };
  const view = (d: ConsoleKeyDriver, bindings = shell.DEFAULT_KEYMAP.bindings): ReturnType<typeof buildConsoleView> => {
    const keyFor = (action: string) => bindings.find((b) => b.context === `console.${d.state.open?.unit ?? 'offense'}` && b.action === action)?.keys[0] ?? null;
    const i: ConsoleViewInput = { console: d.state, atMs: d.nowMs, strip, personnelOnField: '11', opponentPersonnel: null, booth: null, tendency: null, challengesLeft: 2, keyFor };
    return buildConsoleView(i);
  };

  it('the hint bar shows a remapped key, and the remapped key works', () => {
    const { bindings } = shell.applyOverrides({ 'console.offense|call.confirm': ['KeyX'] });
    const d = driver({}, {}, (chord, ctx) => shell.actionFor(chord, ctx, bindings));
    const v = view(d, bindings);
    expect(v.hint.find((h) => h.action === 'call.confirm')?.key).toBe('KeyX');
    d.pressAll(['Digit1', 'KeyX']);
    expect(d.state.step).toBe('sent');
  });

  it('the view JSON carries no truth-like keys', () => {
    const d = driver();
    d.pressAll(['Digit1']);
    const json = JSON.stringify(view(d));
    for (const bad of ['"truth"', '"rating"', '"trueRating"', '"potential"', '"opposingCall"', '"attributes"', '"hidden"']) expect(json).not.toContain(bad);
  });
});

describe('host time (break test #4)', () => {
  it('a NaN, infinite or negative wait is no time at all, and settle keeps a sane step', () => {
    const d = driver();
    const t0 = d.nowMs;
    for (const ms of [NaN, -1, -60_000, Infinity, -Infinity]) d.wait(ms);
    expect(d.nowMs).toBe(t0);
    d.settle(NaN);
    d.settle(-100);
    expect(Number.isFinite(d.nowMs)).toBe(true);
    expect(Number.isFinite(d.state.nowMs)).toBe(true);
  });
});
