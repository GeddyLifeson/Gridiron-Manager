// In-game playbook search and sideline drawing: search reaches the sheet and the plan pool, drawing combines only
// installed pieces and marks the call shaky, and the new call lands on the sheet selected, ready to send by key.
import { describe, it, expect } from 'vitest';
import type { DecisionRequest } from '@gm/schema';
import {
  ConsoleKeyDriver, IN_GAME_BOX, addInGameCall, drawCall, initialConsole, openRequest, reachableCalls, searchCalls,
  type OpenInput, type SheetEntry, type SheetSituation,
} from '../../src/commands/game-calling/index.ts';
import { resolve, testConsoleConfig } from './fixtures.ts';

const SIT: SheetSituation = { down: 1, distance: 10, toGoal: 75, twoMinute: false, lastPlayOfHalf: false, scoreDiff: 0, personnel: null, suddenChange: false, noHuddle: false };
const req: DecisionRequest = { requestId: 7, type: 'snapping_call', side: 0, options: [], deadlinePlayClockTenths: 150, windowTenths: null, defaultOptionId: null } as DecisionRequest;
const open: OpenInput = {
  request: req, situation: SIT, kind: 'scrimmage', playClockTenths: 400, atMs: 0, personnelOnField: '11', insideTwoMinute: false,
  legal: { timeout: true, challenge: false }, timeoutReason: null, challengeReason: null, offenseSetTenths: 150, afterTimeout: false, suggestion: null,
};

function driver(pool: SheetEntry[] = []) {
  const cfg = testConsoleConfig();
  const d = new ConsoleKeyDriver(initialConsole({ ...cfg, pool: { offense: pool } }), { resolve, keyIntervalMs: 200 });
  d.state = openRequest(d.state, open);
  return d;
}
const zone = (d: ConsoleKeyDriver) => d.state.cfg.sheets.offense!.boxes.flatMap((b) => b.entries).find((e) => e.label === 'Inside zone')!;

describe('in-game playbook search', () => {
  it('finds calls on the sheet by words, once each, and calls in the plan pool off the sheet', () => {
    const base = driver().state.cfg.sheets.offense!.boxes[0]!.entries[0]!;
    const d = driver([{ ...base, id: 'pool:x', label: 'Y cross from the plan' }]);
    const hits = searchCalls(d.state, 'offense', 'zone');
    expect(hits.length).toBe(1);
    expect(hits[0]!.boxId).not.toBeNull();
    const pool = searchCalls(d.state, 'offense', 'y cross');
    expect(pool.map((x) => [x.entry.id, x.boxId])).toEqual([['pool:x', null]]);
    expect(reachableCalls(d.state, 'offense').length).toBeGreaterThan(5);
  });
});

describe('sideline drawing', () => {
  it('adds installed tags, flips strength, and marks the drawn call shaky and off the wristband', () => {
    const d = driver();
    const r = drawCall(zone(d), { id: 'in_game/1', tagIds: ['m_jet'], strength: 'left' });
    if (!r.ok) throw new Error(r.refusal);
    expect(r.entry.readiness).toBe('shaky');
    expect(r.entry.onBand).toBe(false);
    expect(r.entry.call.unit === 'offense' && r.entry.call.tags.includes('m_jet') && r.entry.call.strength === 'left').toBe(true);
    expect(r.entry.label).toContain('Jet');
    expect(r.entry.spokenTenths).toBe(zone(d).spokenTenths + 4);
  });
  it('refuses tags that are not installed, two tags in one group, and uninstalled plays', () => {
    const d = driver();
    expect(drawCall(zone(d), { id: 'x', tagIds: ['m_orbit'] }).ok).toBe(false);
    expect(drawCall({ ...zone(d), readiness: 'not_installed' }, { id: 'x', strength: 'right' }).ok).toBe(false);
    expect(drawCall(zone(d), { id: 'x', tagIds: ['nope'] }).ok).toBe(false);
  });
  it('a plain copy keeps the estimate', () => {
    const d = driver();
    const r = drawCall(zone(d), { id: 'x' });
    expect(r.ok && r.entry.readiness).toBe('ready');
  });
});

describe('put on the sheet', () => {
  it('lands in the Drawn in game box, gets an entry key, is selected, and Enter sends it', () => {
    const d = driver();
    const r = drawCall(zone(d), { id: 'in_game/1', tagIds: ['m_jet'] });
    if (!r.ok) throw new Error(r.refusal);
    const added = addInGameCall(d.state, 'offense', r.entry, d.nowMs);
    expect(added.handled).toBe(true);
    d.state = added.state;
    const box = d.state.cfg.sheets.offense!.boxes.find((b) => b.id === IN_GAME_BOX)!;
    expect(box.entries.map((e) => e.id)).toEqual(['in_game/1']);
    expect(d.state.cfg.keys.offense!.entry['in_game/1']).toBe('Digit1');
    expect(d.state.selected).toEqual({ unit: 'offense', boxId: IN_GAME_BOX, entryId: 'in_game/1' });
    d.press('Enter');
    d.settle();
    expect(d.commands.some((c) => c.type === 'call.commit' && c.call.entry.id === 'in_game/1')).toBe(true);
  });
  it('the in-game box never takes the automatic focus', () => {
    const d = driver();
    const r = drawCall(zone(d), { id: 'in_game/1', strength: 'right' });
    if (!r.ok) throw new Error(r.refusal);
    d.state = addInGameCall(d.state, 'offense', r.entry, d.nowMs).state;
    d.state = openRequest(d.state, { ...open, atMs: d.nowMs });
    expect(d.state.focus.boxId).not.toBe(IN_GAME_BOX);
  });
});
