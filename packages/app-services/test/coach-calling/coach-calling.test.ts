// The AI coordinators call from the real playbook (G-58 follow-up): content to K4 sheet calls and K3 options,
// sheet calls to engine calls, K5 order fits, the K3 sheet to the K4 sheet, and a whole game where both AI
// staffs call only plays and defenses from the full content set (WP-25).
import { describe, expect, it } from 'vitest';
import { DMATH } from '@gm/engine-core';
import { flow } from '@gm/engine-game';
import { calling, staff } from '@gm/coach-ai';
import { full, gameplan } from '@gm/football-content';
import { DefenseCall, OffenseCall } from '@gm/schema';
import {
  callOptions, coachCallerPort, contentBook, contentFits, defenseCall, defenseSheetCall, offenseCall, offenseSheetCall, personnelKey, sheetCallOf,
  toCallingRule, toCallingSheet,
} from '../../src/coach-calling/index.ts';
import {
  GEOMETRY, LAST_DOWN, REGULATION_PERIODS, aiSheet, aiStaff, conservative, draws, gameDeps, gameInput, isOvertimeFault, lineupOf, manager, profileOf,
} from './fixtures.ts';

const book = contentBook();
const play = (id: string) => book.plays.get(id)!;
const def = (id: string) => book.defense.get(id)!;

describe('content as the AI reads it', () => {
  it('holds every play and call of the full set, starter ids included', () => {
    expect(book.plays.size).toBe(full.FULL_PLAYS.length);
    expect(book.defense.size).toBe(full.FULL_DEFENSE.length);
    expect(book.plays.size).toBeGreaterThanOrEqual(38); // WP-25: 12 starter + 26 added, and later packages on top
    expect(book.defense.size).toBeGreaterThanOrEqual(17);
    for (const id of ['run_inside_zone_right', 'kneel_victory', 'pass_mesh', 'def_cover2_zone', 'def_34_cover3']) expect(sheetCallOf(book, id)).not.toBeNull();
    expect(sheetCallOf(book, 'no_such_play')).toBeNull();
  });
  it('tags each play by its kind and intent, and keys its personnel', () => {
    expect(offenseSheetCall(play('run_power_right'))).toMatchObject({ callId: 'run_power_right', lookClass: 'run_power_right', tags: {}, personnel: 'p21' });
    expect(offenseSheetCall(play('pa_pop_pass')).tags).toEqual({ pass: true, playAction: true });
    expect(offenseSheetCall(play('screen_bubble')).tags).toEqual({ pass: true, screen: true });
    expect(offenseSheetCall(play('rpo_glance')).tags).toEqual({ rpo: true });
    expect(offenseSheetCall(play('pass_yankee')).tags).toEqual({ pass: true, deepShot: true });
    expect(personnelKey('12')).toBe('p12');
    expect(personnelKey('01')).toBe('other');
  });
  it('tags each defense by coverage family, rushers and who rushes; the look class is what a charter logs', () => {
    expect(defenseSheetCall(def('def_cover0_six_man'))).toMatchObject({ lookClass: 'cover0+pressure', tags: { blitz: true, man: true }, personnel: null });
    expect(defenseSheetCall(def('def_cover3_fire_zone'))).toMatchObject({ lookClass: 'cover3+pressure', tags: { blitz: true } });
    expect(defenseSheetCall(def('def_cover3_fire3_sim')).tags).toEqual({ simulatedPressure: true });
    expect(defenseSheetCall(def('def_cover4_palms'))).toMatchObject({ lookClass: 'cover4', tags: { twoHigh: true } });
    expect(defenseSheetCall(def('def_two_man_under')).tags).toEqual({ man: true, twoHigh: true });
    expect(defenseSheetCall(def('def_cover3_sky')).tags).toEqual({});
  });
  it('gives the K3 planner one option per content item with its family', () => {
    const opts = callOptions(book, (id) => (id === 'pass_mills' ? 0.4 : 1));
    expect(opts.length).toBe(book.plays.size + book.defense.size);
    expect(opts.find((o) => o.callId === 'pass_mills')).toMatchObject({ unit: 'offense', conceptFamily: 'dropback_pass', tags: ['deepShot', 'pass'], readiness: 0.4, fits: null });
    expect(opts.find((o) => o.callId === 'def_cover0_six_man')).toMatchObject({ unit: 'defense', conceptFamily: 'cover0+pressure', kind: 'cover0' });
  });
});

describe('sheet call to engine call', () => {
  const lineup = lineupOf(0);
  it('every play builds a valid offensive call with the content id and family fields', () => {
    for (const p of book.plays.values()) {
      const c = offenseCall(p, lineup);
      expect(() => OffenseCall.parse(c)).not.toThrow();
      expect(c).toMatchObject({ playContentId: p.id, kind: p.kind, personnelCode: p.personnel, formationId: p.formationId, shotgun: p.shotgun });
      expect(c.players.length).toBe(11);
      if (p.kind === 'run') expect(c.runDirection).not.toBeNull();
    }
  });
  it('every defense builds a valid defensive call', () => {
    for (const d of book.defense.values()) {
      const c = defenseCall(d, lineup);
      expect(() => DefenseCall.parse(c)).not.toThrow();
      expect(c).toMatchObject({ callContentId: d.id, coverageFamily: d.coverageFamily, rushers: d.rushers, boxCount: d.boxCount, packageId: d.package });
    }
  });
});

describe('K5 order fits from content', () => {
  const fits = contentFits(book);
  const all = [...book.plays.values()].map((p) => offenseSheetCall(p));
  it('a kneel order lets only the kneel through, a spike order only the spike', () => {
    const k = calling.joinK5({ clock: { mode: 'burn', kneel: true, spike: false, constraints: [] }, fits })!;
    expect(all.filter(k.allows!).map((c) => c.callId)).toEqual(['kneel_victory']);
    const s = calling.joinK5({ clock: { mode: 'save', kneel: false, spike: true, constraints: [] }, fits })!;
    expect(all.filter(s.allows!).map((c) => c.callId)).toEqual(['spike_clock']);
  });
  it('avoid incompletion keeps only calls with no designed forward pass; stay in bounds keeps inside runs, draws and the kneel', () => {
    const ai = calling.joinK5({ clock: { mode: 'burn', kneel: false, spike: false, constraints: ['avoid_incompletion'] }, fits })!;
    for (const c of all.filter(ai.allows!)) expect(['run', 'draw', 'qb_run', 'kneel']).toContain(play(c.callId).kind);
    expect(all.filter(ai.allows!).length).toBeGreaterThan(5);
    const ib = calling.joinK5({ clock: { mode: 'burn', kneel: false, spike: false, constraints: ['stay_in_bounds'] }, fits })!;
    const inside = [...book.plays.values()].filter((p) => p.kind === 'kneel' || p.kind === 'draw' || ((p.kind === 'run' || p.kind === 'qb_run') && (p.runDirection === 'middle' || p.runDirection === null))).map((p) => p.id).sort();
    expect(all.filter(ib.allows!).map((c) => c.callId).sort()).toEqual(inside);
    expect(inside).toEqual(expect.arrayContaining(['draw_rb', 'kneel_victory']));
    expect(inside).not.toContain('run_wide_zone_right');
  });
});

describe('K3 sheet to K4 sheet', () => {
  const LOOKS = ['cover3', 'cover1', 'cover4', 'cover2', 'cover0+pressure', 'cover3+pressure', 'cover6', 'two_man', 'other'];
  const SHARES = [0.3, 0.2, 0.15, 0.1, 0.08, 0.07, 0.05, 0.03, 0.02];
  const ai = aiSheet('offense', {
    goal_line: ['run_iso_right', 'run_power_right', 'pass_slant_flat'],
    red_zone: ['pass_snag', 'pass_smash', 'run_duo_right'],
    sudden_change: ['play_action_deep_cross', 'run_wide_zone_right'],
    short_yardage: ['run_power_right', 'qb_power_read'],
    third_long: ['pass_dagger', 'pass_shallow_cross', 'screen_slow_rb'],
    two_minute: ['quick_stick', 'pass_curl_flat', 'spike_clock'],
    first_10: ['run_inside_zone_right', 'pass_slant_flat', 'pa_pop_pass', 'run_wide_zone_right'],
    second_medium: ['run_split_zone_right', 'pass_mesh', 'rpo_glance'],
  }, LOOKS, SHARES);
  const { sheet, dropped } = toCallingSheet(ai, { book });

  it('reads each catalogue rule as K4 bounds and drops the ones K4 cannot say', () => {
    const r = (id: string) => toCallingRule(gameplan.CATALOGUE_BY_ID.get(id)!.situation!);
    expect(r('third_long')).toEqual({ downs: [3], minDistanceYd: 7, maxDistanceYd: 10 });
    expect(r('goal_line')).toEqual({ maxYardsToGoal: 3 });
    expect(r('two_minute')).toEqual({ twoMinute: true });
    expect(r('sudden_change')).toBeNull();
    expect(r('last_play_short')).toBeNull();
    expect(dropped).toEqual(['sudden_change']);
  });
  it('keeps the priority order, links parents, caps the look columns and locks a mix per box', () => {
    const ids = sheet.boxes.map((b) => b.bucketId);
    expect(ids[0]).toBe(`offense:short_yardage:${calling.SHORT_YARDAGE_BOX}`);
    expect(ids.slice(1)).toEqual(['offense:goal_line', 'offense:red_zone', 'offense:short_yardage', 'offense:third_long', 'offense:two_minute', 'offense:first_10', 'offense:second_medium']);
    expect(sheet.boxes.find((b) => b.bucketId === 'offense:goal_line')!.parentId).toBe('offense:red_zone');
    expect(sheet.looks.length).toBe(calling.param('mix.maxLooks'));
    expect(sheet.looks.at(-1)).toBe('other');
    for (const b of sheet.boxes) {
      expect(Object.values(b.storedMix!).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 9);
      for (const id of b.callIds) expect(b.payoff[id]!.length).toBe(sheet.looks.length);
    }
    expect(sheet.boxes.find((b) => b.bucketId === 'offense:two_minute')!).toMatchObject({ clock: true, scriptable: false });
    expect(sheet.boxes.find((b) => b.bucketId === 'offense:third_long')!.scriptable).toBe(false);
    expect(sheet.boxes.find((b) => b.bucketId === 'offense:first_10')!.scriptable).toBe(true);
    expect(sheet.baseBoxByDown).toEqual({ '1': 'offense:first_10', '2': 'offense:second_medium', '3': 'offense:third_long', '4': 'offense:short_yardage', '0': 'offense:first_10' });
  });
  it('keeps a stored K3 mix when the sheet came locked', () => {
    const locked = { ...ai, lockedAt: 5, matrices: ai.matrices.map((m) => ({ ...m, sigmaStar: m.candidates.map(() => 1 / m.candidates.length) })) };
    const s = toCallingSheet(locked, { book }).sheet;
    const box = s.boxes.find((b) => b.bucketId === 'offense:red_zone')!;
    for (const id of box.callIds) expect(box.storedMix![id]).toBeCloseTo(1 / 3, 9);
  });
});

describe('whole game: both AI staffs call from the full playbook', () => {
  it('finishes a pro game with every scrimmage call a content play or defense', () => {
    const offLooks = ['cover3', 'cover1', 'cover4', 'cover2', 'other'];
    const defLooks = ['run_inside_zone_right', 'pass_slant_flat', 'pass_mesh', 'other'];
    const offAi = aiSheet('offense', {
      goal_line: ['run_iso_right', 'run_power_right', 'pass_slant_flat'],
      red_zone: ['pass_snag', 'pass_smash', 'run_duo_right', 'screen_tunnel'],
      short_yardage: ['run_power_right', 'qb_power_read', 'run_iso_right'],
      third_long: ['pass_dagger', 'pass_shallow_cross', 'screen_slow_rb', 'pass_sail'],
      third_medium: ['pass_snag', 'pass_mesh', 'pass_curl_flat'],
      third_short: ['run_duo_right', 'quick_stick', 'pass_slant_flat'],
      two_minute: ['quick_stick', 'pass_curl_flat', 'pass_smash', 'pass_dagger'],
      first_10: ['run_inside_zone_right', 'pass_slant_flat', 'pa_pop_pass', 'run_wide_zone_right', 'pass_yankee'],
      second_long: ['pass_shallow_cross', 'draw_rb', 'screen_bubble'],
      second_medium: ['run_split_zone_right', 'pass_mesh', 'rpo_glance'],
      second_short: ['run_counter_right', 'pass_post_wheel', 'run_dart_right'],
    }, offLooks, [0.35, 0.25, 0.2, 0.15, 0.05]);
    const defAi = aiSheet('defense', {
      red_zone: ['def_cover1_man_free', 'def_cover0_six_man', 'def_cover3_sky'],
      third_long: ['def_cover4_quarters', 'def_dime_cover2', 'def_cover3_fire_zone'],
      first_10: ['def_cover3_sky', 'def_cover4_palms', 'def_cover1_robber', 'def_34_cover3'],
      second_medium: ['def_nickel_cover1', 'def_cover3_fire3_sim', 'def_nickel_cover4'],
    }, defLooks, [0.4, 0.3, 0.2, 0.1]);
    const offSheet = toCallingSheet(offAi, { book }).sheet;
    const defSheet = toCallingSheet(defAi, { book }).sheet;

    const seen = { off: [] as string[], def: [] as string[], defaulted: 0 };
    const port = (side: 0 | 1) => coachCallerPort({
      geometry: GEOMETRY, regulationPeriods: REGULATION_PERIODS, lineupFor: () => lineupOf(side), playClockStartTenths: (v) => v.situation.playClockAtSnapTenths,
      draws: (v, ctx, kind) => draws([side, v.situation.gameId, v.situation.playNumber, ctx.caller.personId, kind]),
      setupFor: (ctx, s) => ({
        profile: profileOf(ctx.caller.personId, s === 'offense' ? 'offensiveCoordinator' : 'defensiveCoordinator'), headCoach: { leadProtection: 0, deficitUrgency: 0, lateDefenseRisk: 0 },
        zBoothEvaluation: 0, sheet: s === 'offense' ? offSheet : defSheet, scout: [], opponentCallerId: null, ownWindow: {}, math: DMATH,
      }),
    });
    const decider = (side: 0 | 1) => staff.createStaffDecider({
      side, chart: aiStaff(), geometry: GEOMETRY, lastDown: LAST_DOWN, instructions: [], caller: port(side), manager: manager(), user: null, draws: (scope) => draws([side, ...scope]), conservative,
    });
    for (let i = 0; i < 20; i++) {
      try {
        const input = gameInput(i);
        const result = flow.simulateGame(input, gameDeps(input, [decider(0), decider(1)]));
        for (const e of result.events) {
          if (e.type !== 'decision_made') continue;
          const s = e.decision.snappingCall, o = e.decision.opposingCall;
          // A call made after the deadline goes to the engine default (J11.6.1); those are counted, not checked.
          if (e.decision.actor.kind === 'default') { if (s?.unit === 'offense' || o?.unit === 'defense') seen.defaulted++; continue; }
          if (s?.unit === 'offense') seen.off.push(s.playContentId ?? 'none');
          if (o?.unit === 'defense') seen.def.push(o.callContentId ?? 'none');
        }
        break;
      } catch (e) { if (!isOvertimeFault(e)) throw e; }
    }
    expect(seen.off.length).toBeGreaterThan(40);
    expect(seen.def.length).toBeGreaterThan(40);
    for (const id of seen.off) expect(Object.keys(offSheet.calls)).toContain(id);
    for (const id of seen.def) expect(Object.keys(defSheet.calls)).toContain(id);
    expect(new Set(seen.off).size).toBeGreaterThan(8);
    expect(new Set(seen.def).size).toBeGreaterThan(4);
    // Most scrimmage calls are the coordinators' own; the rest were late (the window can open near the deadline).
    expect(seen.defaulted).toBeLessThan(seen.off.length + seen.def.length);
  });
});
