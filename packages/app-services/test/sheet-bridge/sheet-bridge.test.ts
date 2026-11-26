// The game plan sheet to the calling console: rule conversion, the staff draft from the plan at the staff's
// skill (the K3.4.2 builder), learned preferences, the console config, and a whole game called by keys from
// a staff-drafted sheet. Plan entries below are test data (which call a coach picks for which situation), not rates.
import { describe, expect, it } from 'vitest';
import { DMATH, field, seedFromHex, streamSource } from '@gm/engine-core';
import { flow, stats } from '@gm/engine-game';
import { gameplan as gp } from '@gm/football-content';
import { calibration } from '@gm/headless';
import * as officiating from '@gm/officiating';
import { resolver } from '@gm/resolver-reference';
import { resolveRuleSet } from '@gm/rules-data';
import { ATTRIBUTE_IDS, DefenseCall, NEUTRAL_ENVIRONMENT, OffenseCall, type GameDeps, type GameInput, type ParamFile, type ParamTable, type Side } from '@gm/schema';
import { assignKeys, focusBox, GameCallingSession, type LineupFor, type SheetSituation } from '../../src/commands/game-calling/index.ts';
import { contentBook } from '../../src/coach-calling/index.ts';
import {
  MANUAL_ONLY, applyPreferences, bookMenu, consoleConfigFor, learnPreferences, staffDraft, toBoxRule, toConsoleSheet,
} from '../../src/sheet-bridge/index.ts';
import { BINDINGS, RESERVED, resolve } from '../game-calling/fixtures.ts';

const RULES = resolveRuleSet('pro_2026');
const book = contentBook();
const rowRule = (id: string) => gp.CATALOGUE_BY_ID.get(id)!.situation!;
const at = (o: Partial<SheetSituation>): SheetSituation => ({ down: 1, distance: 10, toGoal: 60, twoMinute: false, lastPlayOfHalf: false, scoreDiff: 0, personnel: null, suddenChange: false, noHuddle: false, ...o });

/** TEST PLAN: a coordinator's menu, each call with the situations he picked it for. */
const entry = (playId: string, situationIds: string[]): gp.MenuEntry => ({ id: `m.${playId}`, side: 'offense', call: { playId, tags: [] }, situationIds, targetReps: 2 });
const PLAN: gp.MenuEntry[] = [
  entry('run_inside_zone_right', ['first_10', 'second_short', 'short_yardage', 'goal_line']),
  entry('pass_curl_flat', ['first_10', 'second_medium', 'second_long']),
  entry('quick_stick', ['second_medium', 'third_short', 'third_medium', 'two_minute']),
  entry('run_power_right', ['first_10', 'second_short', 'third_short', 'short_yardage', 'goal_line', 'fourth_short']),
  entry('pass_mesh', ['third_medium', 'third_long', 'two_minute', 'red_zone']),
  entry('pass_dagger', ['third_long', 'third_extra_long', 'second_long', 'two_minute']),
  entry('pa_pop_pass', ['first_10', 'high_red_zone', 'play_action']),
  entry('screen_bubble', ['second_long', 'first_long', 'screens']),
  entry('pass_yankee', ['shots']),
  entry('pass_smash', ['high_red_zone', 'low_red_zone', 'fringe', 'red_zone_third']),
  entry('spike_clock', ['clock_plays']),
];

describe('situation to console rule', () => {
  it('reads down, distance, field zone and the two-minute and last-play flags', () => {
    expect(toBoxRule(rowRule('first_10'))).toEqual({ downs: [1], distMin: 10, distMax: 10 });
    expect(toBoxRule(rowRule('third_extra_long'))).toEqual({ downs: [3], distMin: 11 });
    expect(toBoxRule(rowRule('low_red_zone'))).toEqual({ toGoalMin: 4, toGoalMax: 10 });
    expect(toBoxRule(rowRule('two_minute'))).toEqual({ twoMinute: true });
    expect(toBoxRule(rowRule('last_play_long'))).toEqual({ lastPlayOfHalf: true, toGoalMin: 41 });
    expect(toBoxRule(rowRule('sudden_change'))).toEqual({ suddenChange: true });
  });
  it('the defensive template rules: personnel, tempo outside two minutes, score', () => {
    const d = gp.defenseTemplate();
    const r = (id: string) => toBoxRule(d.situations.find((s) => s.id === id)!);
    expect(r('vs_11')).toEqual({ personnel: ['11'], downs: [1, 2] });
    expect(r('d_tempo')).toEqual({ noHuddle: true, twoMinute: false });
  });
  it('returns null for what the console cannot test: tries, game seconds, lost-yardage plays, "or" rules', () => {
    for (const id of ['two_point', 'four_minute', 'back_on_track']) expect(toBoxRule(rowRule(id))).toBeNull();
    expect(toBoxRule({ id: 'x', label: 'x', anyOf: [{ all: [{ on: 'down', in: [1] }] }, { all: [{ on: 'down', in: [2] }] }] })).toBeNull();
  });
});

describe('staff draft from the game plan', () => {
  const draft = staffDraft({ unit: 'offense', gameId: 'g1', menu: PLAN, preparationZ: 1 });
  const box = (id: string) => draft.sheet.boxes.find((b) => b.id === id);
  it('gives a box only where the plan chose calls, and fills it only with those calls, in plan order', () => {
    const fb = box('first_10')!;
    expect(fb.entries.map((e) => e.call.playId)).toEqual(['run_inside_zone_right', 'pass_curl_flat', 'run_power_right', 'pa_pop_pass']);
    expect(box('third_long')!.entries.map((e) => e.call.playId)).toEqual(['pass_mesh', 'pass_dagger']);
    for (const b of draft.sheet.boxes) for (const e of b.entries) {
      const m = PLAN.find((p) => p.call.playId === e.call.playId)!;
      expect(m.situationIds).toContain(b.catalogueRef);
    }
    expect(box('backed_up')).toBeUndefined(); // no plan call chosen for it
  });
  it('category boxes hold the calls chosen for them; the layout is legal and every situation is on the sheet', () => {
    expect(box('shots')!.entries.map((e) => e.call.playId)).toEqual(['pass_yankee']);
    expect(box('screens')!.entries.map((e) => e.call.playId)).toEqual(['screen_bubble']);
    expect(gp.layoutProblems(draft.sheet)).toEqual([]);
    for (const b of draft.sheet.boxes) if (b.situationId !== null) expect(draft.sheet.situations.some((s) => s.id === b.situationId)).toBe(true);
  });
  it('the script draws from first and 10 and second and medium; its length follows the staff (K4.5.1: 8 to 15)', () => {
    const big = staffDraft({ unit: 'offense', gameId: 'g', menu: bookMenu('offense'), preparationZ: 3 });
    const small = staffDraft({ unit: 'offense', gameId: 'g', menu: bookMenu('offense'), preparationZ: -3 });
    expect(big.sheet.script.length).toBe(15);
    expect(small.sheet.script.length).toBe(8);
    expect(big.sheet.boxes.length).toBeGreaterThan(small.sheet.boxes.length); // K3.4.2 coverage 70% to 100% by preparation
  });
  it('with no plan the staff list the whole book for the side; unknown plays are skipped, not invented', () => {
    const d = staffDraft({ unit: 'defense', gameId: 'g', menu: [], preparationZ: 0 });
    expect(d.sheet.boxes.length).toBeGreaterThan(0);
    for (const b of d.sheet.boxes) for (const e of b.entries) expect(book.defense.has(e.call.playId)).toBe(true);
    const bad = staffDraft({ unit: 'offense', gameId: 'g', menu: [...PLAN, entry('no_such_play', ['first_10'])], preparationZ: 0 });
    expect(bad.skipped).toContain('plan:m.no_such_play');
  });
});

describe('the staff learn from the user\'s edits', () => {
  it('a call taken out is left out next week and kept as a staff suggestion; a call put in joins the front', () => {
    const draft = staffDraft({ unit: 'offense', gameId: 'g1', menu: PLAN, preparationZ: 1 }).sheet;
    let edited = gp.removeEntry(draft, 'first_10', 'first_10.1');
    edited = gp.addEntry(edited, 'third_long', { id: 'mine', call: { playId: 'screen_bubble', tags: [] } });
    const prefs = learnPreferences(null, draft, edited);
    expect(prefs.weeks).toBe(1);
    expect(prefs.rows).toEqual([
      { boxId: 'first_10', callKey: 'run_inside_zone_right', call: { playId: 'run_inside_zone_right', tags: [] }, added: 0, removed: 1 },
      { boxId: 'third_long', callKey: 'screen_bubble', call: { playId: 'screen_bubble', tags: [] }, added: 1, removed: 0 },
    ]);
    const next = staffDraft({ unit: 'offense', gameId: 'g2', menu: PLAN, preparationZ: 1, preferences: prefs });
    const box = (id: string) => next.sheet.boxes.find((b) => b.id === id)!.entries.map((e) => e.call.playId);
    expect(box('first_10')).not.toContain('run_inside_zone_right');
    expect(box('third_long')[0]).toBe('screen_bubble');
    expect(next.suggestions).toEqual([{ boxId: 'first_10', call: { playId: 'run_inside_zone_right', tags: [] }, callKey: 'run_inside_zone_right', removedWeeks: 1 }]);
    // Putting it back the next week cancels the habit.
    const back = learnPreferences(prefs, next.sheet, gp.addEntry(next.sheet, 'first_10', { id: 'b', call: { playId: 'run_inside_zone_right', tags: [] } }));
    expect(applyPreferences(draft, back).sheet.boxes.find((b) => b.id === 'first_10')!.entries.map((e) => e.call.playId)).toContain('run_inside_zone_right');
  });
});

describe('game plan sheet to console sheet', () => {
  const draft = staffDraft({ unit: 'offense', gameId: 'g1', menu: PLAN, preparationZ: 1 }).sheet;
  const { sheet, manualOnly, broken } = toConsoleSheet(draft);
  it('focus lands where the game plan says (G7.2.1 priorities: clock above zones above downs)', () => {
    expect(focusBox(sheet, at({})).boxId).toBe('first_10');
    expect(focusBox(sheet, at({ down: 3, distance: 8 })).boxId).toBe('third_long');
    expect(focusBox(sheet, at({ twoMinute: true })).boxId).toBe('two_minute');
    expect(focusBox(sheet, at({ toGoal: 15 })).boxId).toBe('high_red_zone');
    expect(focusBox(sheet, at({ down: 3, distance: 1, toGoal: 2 })).boxId).toBe('goal_line');
  });
  it('a down with no box of its own falls to the broadest box for that down (K4.1.1 rule 4)', () => {
    const f = focusBox(sheet, at({ down: 4, distance: 7 }));
    expect(f).toMatchObject({ how: 'base', empty: false });
    expect(sheet.boxes.find((b) => b.id === f.boxId)!.baseDowns).toContain(4);
  });
  it('category boxes are reached by key only, and every entry is a valid engine call once players are added', () => {
    expect(manualOnly).toEqual(expect.arrayContaining(['shots', 'screens', 'play_action']));
    expect(sheet.boxes.find((b) => b.id === 'shots')!.rule).toBe(MANUAL_ONLY);
    expect(broken).toEqual([]);
    for (const b of sheet.boxes) for (const e of b.entries) expect(() => OffenseCall.parse({ ...e.call, players: [] })).not.toThrow();
    const def = toConsoleSheet(staffDraft({ unit: 'defense', gameId: 'g', menu: [], preparationZ: 0 }).sheet).sheet;
    for (const b of def.boxes) for (const e of b.entries) expect(() => DefenseCall.parse({ ...e.call, players: [] })).not.toThrow();
  });
  it('a retired or missing play is listed as broken and left out', () => {
    const withBad = gp.addEntry(draft, 'first_10', { id: 'bad', call: { playId: 'gone', tags: [] } });
    expect(toConsoleSheet(withBad).broken).toEqual(['first_10/bad']);
  });
});

const special = { personnelOf: () => '11' }; // TEST VALUE: fixture personnel code, the depth chart supplies it in a game

describe('box keys on a big sheet (O2.2.2)', () => {
  it('a 40-box sheet gets 40 distinct codes that never use a console key, and no single letter is also a prefix', () => {
    const boxes = Array.from({ length: 40 }, (_, i) => ({ id: `b${i}`, title: `b${i}`, row: Math.floor(i / 8), col: i % 8, rule: null, entries: [] }));
    const k = assignKeys({ id: 's', unit: 'offense', boxes }, RESERVED);
    const codes = Object.values(k.box);
    expect(new Set(codes.map((c) => c.join('+'))).size).toBe(40);
    for (const c of codes) for (const x of c) expect(RESERVED).not.toContain(x);
    const singles = new Set(codes.filter((c) => c.length === 1).map((c) => c[0]));
    for (const c of codes) if (c.length === 2) expect(singles.has(c[0])).toBe(false);
  });
});

describe('console config in one call', () => {
  it('drafts the sides the user has no sheet for, keeps his sheet, and keys skip the console keys', () => {
    const mine = gp.addEntry({ ...gp.offenseTemplate(), gameId: 'g1' }, 'first_10', { id: 'x', call: { playId: 'pass_mesh', tags: [] } });
    const r = consoleConfigFor({ rules: RULES, gameId: 'g1', bindings: BINDINGS, sheets: { offense: mine }, plan: { offense: PLAN }, staffPreparationZ: { offense: 0, defense: 0 }, special });
    expect(r.drafted).toEqual(['defense']);
    expect(r.sheets.offense).toBe(mine);
    expect(r.config.radioCutoffTenths).toBe(150);
    expect(r.config.sheets.special!.boxes.map((b) => b.id)).toEqual(expect.arrayContaining(['st_kickoff', 'st_punt', 'st_field_goal']));
    for (const u of ['offense', 'defense', 'special'] as const) {
      const letters = Object.values(r.config.keys[u]!.box).flat();
      for (const k of letters) expect(RESERVED).not.toContain(k);
      expect(new Set(Object.values(r.config.keys[u]!.box).map((k) => k.join('+'))).size).toBe(r.config.sheets[u]!.boxes.length);
    }
  });  it('offense entries carry route tags for routes the sheet already runs, one group per receiver', () => {
    const mine = gp.addEntry({ ...gp.offenseTemplate(), gameId: 'g1' }, 'first_10', { id: 'x', call: { playId: 'pass_mesh', tags: [] } });
    const r = consoleConfigFor({ rules: RULES, gameId: 'g1', bindings: BINDINGS, sheets: { offense: mine }, plan: { offense: PLAN }, staffPreparationZ: { offense: 0, defense: 0 }, special });
    const e = r.config.sheets.offense!.boxes.flatMap((b) => b.entries).find((x) => x.id.endsWith('/x'))!;
    expect(e.tags.length).toBeGreaterThan(0);
    for (const t of e.tags) { expect(t.kind).toBe('route'); expect(t.group).toMatch(/^route:[A-Z]+$/); expect(t.installed).toBe(true); }
  });
  it('the plan calls off the sheet become the in-game search pool, none duplicated from the sheet', () => {
    const mine = gp.addEntry({ ...gp.offenseTemplate(), gameId: 'g1' }, 'first_10', { id: 'x', call: { playId: 'pass_mesh', tags: [] } });
    const r = consoleConfigFor({ rules: RULES, gameId: 'g1', bindings: BINDINGS, sheets: { offense: mine }, plan: { offense: PLAN }, staffPreparationZ: { offense: 0, defense: 0 }, special });
    const pool = r.config.pool?.offense ?? [];
    const onSheet = new Set(r.config.sheets.offense!.boxes.flatMap((b) => b.entries.map((e) => e.label)));
    expect(pool.length).toBeGreaterThan(0);
    for (const e of pool) { expect(onSheet.has(e.label)).toBe(false); expect(e.id.startsWith('pool:')).toBe(true); }
  });
});

// ---- a whole game, side 0 called by keys from the staff's drafted sheets
const PARAM_FILES: readonly ParamFile[] = [
  officiating.clock.PARAMS, officiating.series.PARAMS, officiating.scrimmage.PARAMS, officiating.fouls.PARAMS, officiating.crew.PARAMS,
  officiating.replay.PARAMS, officiating.kick.PARAMS, officiating.restart.PARAMS, officiating.overtime.PARAMS, resolver.PARAMS, flow.PARAMS, stats.PARAMS, calibration.PARAMS,
];
function paramTable(): ParamTable {
  const map = new Map<string, number>();
  for (const f of PARAM_FILES) for (const p of f.params) map.set(p.name, p.value);
  return { version: 'test', has: (k) => map.has(k), num: (k) => { const v = map.get(k); if (v === undefined) throw new Error(k); return v; } };
}
/** PLACEHOLDER teams: four units of eleven at one attribute value, no real or generated people. */
function team(side: Side): GameInput['teams'][number] {
  const units = ['offense', 'defense', 'kick', 'return'] as const;
  const players: GameInput['teams'][number]['players'][number][] = [];
  const depth: Record<string, number[]> = {};
  units.forEach((unit, u) => {
    depth[unit] = [];
    for (let i = 1; i <= 11; i++) {
      const playerId = (side + 1) * 1000 + u * 100 + i;
      const attributes: Record<string, number> = {};
      for (const a of ATTRIBUTE_IDS) attributes[a] = 50;
      players.push({
        playerId, position: unit, jersey: (u * 11 + i) % 100, heightIn: 74, weightLb: 220, ageYears: 25, attributes,
        tests: { fortyS: 4.6, tenSplitS: 1.6, threeConeS: null, shuttleS: null, verticalIn: null, broadIn: null, changeOfDirectionZ: 0 },
        gameDay: { freshness: 1, freshnessLongTerm: 1, conditioning: 50, playingHurt: [], knowledge: {}, snapsThisGame: 0, requiredAbsenceDowns: 0, ejected: false, unavailable: false },
      });
      depth[unit]!.push(playerId);
    }
  });
  return { teamId: side + 1, side, players, depth, teamDiscipline: { defCoverage: 1, postPlay: 1 } };
}

const KEY_MS = 250; // virtual time per key press: a named test assumption
const LIVE_MS = 6000; // virtual time from a committed call to the next dead ball: a named test assumption

describe('a whole game from the staff-drafted sheets', () => {
  it('side 0 calls every scrimmage play by keys from the drafted sheets, and every call is a book play', () => {
    const seedHex = '5ab1e7c0de4f2a19';
    const geometry = field.fieldGeometry(RULES);
    const input: GameInput = { gameId: 1, ruleSetId: 'pro_2026', gameType: 'regular', teams: [team(0), team(1)], crew: officiating.crew.neutralCrew(1), environment: NEUTRAL_ENVIRONMENT, seedHex, fidelityTier: 'B' };
    const roster = (s: Side) => calibration.depthRoster(input.teams[s].depth);
    const regulationPeriods = RULES.num('clock.periods');
    const deps: GameDeps = {
      rules: RULES, params: paramTable(), geometry, streams: streamSource(seedFromHex(seedHex)), math: DMATH, resolver: resolver.REFERENCE_RESOLVER,
      officiating: officiating.facade.createOfficiating(),
      deciders: [calibration.createChartCaller({ side: 0, geometry, roster: roster(0), regulationPeriods }), calibration.createChartCaller({ side: 1, geometry, roster: roster(1), regulationPeriods })],
    };
    const lineup: LineupFor = (unit) => roster(0)(unit, null);
    const { config } = consoleConfigFor({ rules: RULES, gameId: 'g1', bindings: BINDINGS, plan: { offense: PLAN }, staffPreparationZ: { offense: 0.5, defense: 0.5 }, special });
    const session = new GameCallingSession({ input, deps, userSide: 0, console: config, lineup, resolve, keyIntervalMs: KEY_MS, startMs: 0, liveMs: () => LIVE_MS, bookLine: () => '' });
    session.start();
    let pick = 0;
    let lastOpen = -1;
    let stuck = 0;
    const units = new Set<string>();
    for (let guard = 0; guard < 20000 && !session.final; guard++) {
      const s = session.driver.state;
      if (session.holding) { session.wait(LIVE_MS); continue; }
      const p = session.pending;
      if (p?.late) { session.wait(1000); continue; }
      if (!p || !s.open) throw new Error('session waits with no open request');
      const id = p.request.requestId;
      if (id === lastOpen) { if (++stuck > 3) { session.settle(); continue; } } else { stuck = 0; lastOpen = id; }
      if (s.step === 'prompt') { session.press(p.request.type === 'challenge' ? 'Digit1' : 'Enter'); continue; }
      if (s.step === 'fourth') { session.press(s.open.situation.toGoal <= 30 ? 'Digit3' : 'Digit2'); continue; }
      if (s.step !== 'select') { session.settle(); continue; }
      units.add(s.open.unit);
      const box = s.cfg.sheets[s.open.unit]!.boxes.find((b) => b.id === s.focus.boxId);
      const count = box?.entries.length ?? 0;
      if (count === 0) { session.settle(); continue; }
      session.press(`Digit${(pick++ % Math.min(count, 9)) + 1}`);
      if (!session.driver.state.open) continue;
      session.press('Enter');
      session.settle();
    }
    expect(session.final).toBe(true);
    expect([...units].sort()).toEqual(['defense', 'offense', 'special']);
    let userCalls = 0;
    for (const e of session.events) {
      if (e.type !== 'decision_made' || e.decision.side !== 0 || e.decision.actor.kind !== 'user') continue;
      const call = e.decision.snappingCall ?? e.decision.opposingCall;
      if (!call) continue;
      // A fake or two-point play comes from the special-teams menu (st.*); every other offensive call is a book play.
      if (call.unit === 'offense') { expect(book.plays.has(call.playContentId ?? '') || (call.playContentId ?? '').startsWith('st.')).toBe(true); userCalls++; }
      if (call.unit === 'defense') { expect(book.defense.has(call.callContentId ?? '')).toBe(true); userCalls++; }
    }
    expect(userCalls).toBeGreaterThan(40);
  }, 120000);
});
