// Item 2b of plans/head-coach-nuance.md: the head coach watches his staff run the game and takes a unit when he says
// so. Coordinators call their own units by default and the head coach keeps game management (Marlon 2026-11-26 19:15
// UTC). A unit changes hands only on his word, at a dead ball; watching paces the staff's snaps (I9.4.1); simulating
// and watching with everything handed over reach the same game (J14.4.1).
import { describe, it, expect } from 'vitest';
import { DMATH, field, seedFromHex, streamSource, stream } from '@gm/engine-core';
import { flow, stats } from '@gm/engine-game';
import { calibration } from '@gm/headless';
import { staff } from '@gm/coach-ai';
import * as officiating from '@gm/officiating';
import { resolver } from '@gm/resolver-reference';
import { resolveRuleSet } from '@gm/rules-data';
import { ATTRIBUTE_IDS, NEUTRAL_ENVIRONMENT, type Decision, type GameDeps, type GameInput, type ParamFile, type ParamTable, type Side, type SimTeam } from '@gm/schema';
import {
  GameCallingSession, chartCallerStaff, chartKeeping, placeholderStaffChart, placeholderStaffIds, type LineupFor, type SeatStaff, type SeatUnit, type WatchOptions,
} from '../../src/commands/game-calling/index.ts';
import { resolve, testConsoleConfig } from './fixtures.ts';

const PARAM_FILES: readonly ParamFile[] = [
  officiating.clock.PARAMS, officiating.series.PARAMS, officiating.scrimmage.PARAMS, officiating.fouls.PARAMS, officiating.crew.PARAMS,
  officiating.replay.PARAMS, officiating.kick.PARAMS, officiating.restart.PARAMS, officiating.overtime.PARAMS, resolver.PARAMS, flow.PARAMS, stats.PARAMS,
  calibration.PARAMS,
];
function paramTable(): ParamTable {
  const map = new Map<string, number>();
  for (const f of PARAM_FILES) for (const p of f.params) map.set(p.name, p.value);
  return { version: 'test', has: (k) => map.has(k), num: (k) => { const v = map.get(k); if (v === undefined) throw new Error(k); return v; } };
}

/** PLACEHOLDER teams: four units of eleven at one attribute value, no real or generated people. */
function team(side: Side): SimTeam {
  const units = ['offense', 'defense', 'kick', 'return'] as const;
  const players: SimTeam['players'][number][] = [];
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

const SEED_HEX = '6d0c9a1f3b2e4c5d';
const ID = placeholderStaffIds(1);

function setup() {
  const rules = resolveRuleSet('pro_2026');
  const params = paramTable();
  const geometry = field.fieldGeometry(rules);
  const input: GameInput = {
    gameId: 1, ruleSetId: 'pro_2026', gameType: 'regular', teams: [team(0), team(1)], crew: officiating.crew.neutralCrew(1),
    environment: NEUTRAL_ENVIRONMENT, seedHex: SEED_HEX, fidelityTier: 'B',
  };
  const roster = (s: Side) => calibration.depthRoster(input.teams[s].depth);
  const regulationPeriods = rules.num('clock.periods');
  const deps = (): GameDeps => ({
    rules, params, geometry, streams: streamSource(seedFromHex(SEED_HEX)), math: DMATH, resolver: resolver.REFERENCE_RESOLVER,
    officiating: officiating.facade.createOfficiating(),
    deciders: [
      calibration.createChartCaller({ side: 0, geometry, roster: roster(0), regulationPeriods }),
      calibration.createChartCaller({ side: 1, geometry, roster: roster(1), regulationPeriods }),
    ],
  });
  const lineup: LineupFor = (unit, personnel, detail) => roster(0)(unit, personnel, detail);
  const seat = (d: GameDeps): SeatStaff => ({
    chart: placeholderStaffChart({ teamId: 1, level: 'pro', seed: seedFromHex(SEED_HEX) }),
    ...chartCallerStaff(d.deciders[0], lineup),
    draws: (scope) => stream(seedFromHex(SEED_HEX), 'coachAI', ['test', ...scope]),
  });
  const session = (keep?: readonly SeatUnit[], watch?: WatchOptions, liveMs?: number) => {
    const d = deps();
    return new GameCallingSession({
      input, deps: d, userSide: 0, console: testConsoleConfig(), lineup, resolve, keyIntervalMs: 250, startMs: 0,
      ...(liveMs === undefined ? {} : { liveMs: () => liveMs }),
      staff: { seat: seat(d), ...(keep ? { keep } : {}), ...(watch ? { watch } : {}) },
    });
  };
  return { input, deps, session };
}

const ours = (s: GameCallingSession): Decision[] => s.events.flatMap((e) => (e.type === 'decision_made' && e.decision.side === 0 ? [e.decision] : []));
const hashOf = (s: GameCallingSession) => {
  const recs = s.events.filter((e) => e.type === 'play_resolved');
  const last = recs[recs.length - 1];
  return last && last.type === 'play_resolved' ? last.record.stateHash : '';
};
/** Let every prompt run to its deadline: the console's default answers, the staff's for his fourth-down choice. */
function runOut(s: GameCallingSession, stepMs = 5000): void {
  for (let i = 0; i < 40_000 && !s.final; i++) { s.wait(stepMs); s.resumeWatch(); }
}

describe('coordinators call their own units unless the head coach says otherwise', () => {
  it('by default the OC, DC and special teams coach call; the head coach keeps game management', () => {
    const { session } = setup();
    const s = session();
    expect(s.keptUnits).toEqual(['management']);
    const c = s.callers();
    expect(c.offense).toEqual({ isUser: false, personId: ID.offense });
    expect(c.defense).toEqual({ isUser: false, personId: ID.defense });
    expect(c.special_teams).toEqual({ isUser: false, personId: ID.specialTeams });
    expect(c.management.isUser).toBe(true);
    s.start();
    runOut(s);
    expect(s.final).toBe(true);
    const calls = ours(s).filter((d) => d.type === 'snapping_call' || d.type === 'opposing_call');
    expect(calls.length).toBeGreaterThan(100);
    const rows = new Map(s.staffRows().map((r) => [r.requestId, r]));
    const holder: Record<string, number> = { [staff.DUTY.callOffense]: ID.offense, [staff.DUTY.callDefense]: ID.defense, [staff.DUTY.callSpecialTeams]: ID.specialTeams };
    const by = new Set<number>();
    for (const d of calls) {
      if (d.actor.kind === 'default') continue;
      const duty = rows.get(d.requestId)!.duty;
      expect(d.actor).toEqual({ kind: 'staff', personId: holder[duty] });
      by.add(d.actor.personId!);
    }
    expect([...by].sort()).toEqual([ID.offense, ID.defense, ID.specialTeams].sort());
    // Every call of his side is logged to somebody (K6.1.1 acceptance).
    expect(staff.unloggedDecisions(ours(s), 0, s.staffRows())).toEqual([]);
    expect(s.takeovers).toEqual([]);
  });

  it('the console opens only on what he holds: management prompts and his fourth-down choice', () => {
    const { session } = setup();
    const s = session();
    s.start();
    const opened = new Set<string>();
    for (let i = 0; i < 40_000 && !s.final; i++) {
      const p = s.pending;
      if (p) opened.add(p.lastDown ? 'last_down' : p.preview ? 'call_preview' : p.request.type);
      s.wait(5000);
    }
    expect(opened.has('call_preview')).toBe(false);
    expect(opened.has('snapping_call') || opened.has('opposing_call')).toBe(false);
    expect(opened.has('last_down')).toBe(true);
  });
});

describe('taking a unit and handing it back (I9.4.2 proposed)', () => {
  it('he takes the defense at a dead ball: its calls wait on his console until he hands it back to the DC', () => {
    const { session } = setup();
    const s = session(['management']);
    s.start();
    s.takeOver('defense');
    expect(s.callers().defense.isUser).toBe(true);
    expect(s.takeovers).toHaveLength(1);
    expect(s.takeovers[0]).toMatchObject({ unit: 'defense', to: 'user', coordinatorId: ID.defense });
    // Run until the console opens on a defensive call: the flow waits for him, not the DC.
    let sawDefense = false;
    for (let i = 0; i < 20_000 && !s.final && !sawDefense; i++) {
      if (s.pending && !s.pending.lastDown && s.driver.state.open?.unit === 'defense') sawDefense = true;
      else s.wait(5000);
    }
    expect(sawDefense).toBe(true);
    const before = ours(s).length;
    s.handBack('defense');
    expect(s.callers().defense).toEqual({ isUser: false, personId: ID.defense });
    expect(s.takeovers.at(-1)).toMatchObject({ unit: 'defense', to: 'staff', coordinatorId: ID.defense });
    // The DC answered the call the console had open.
    const next = ours(s).slice(before).find((d) => d.type === 'opposing_call');
    expect(next?.actor).toEqual({ kind: 'staff', personId: ID.defense });
    runOut(s);
    expect(s.final).toBe(true);
  });

  it('keeping a unit before the game is the same as taking it: nothing moves on its own', () => {
    const { session } = setup();
    const s = session(['offense', 'management']);
    expect(s.callers().offense.isUser).toBe(true);
    s.start();
    runOut(s);
    const offense = ours(s).filter((d) => d.snappingCall?.unit === 'offense');
    for (const d of offense) expect(d.actor.kind === 'user' || d.actor.kind === 'default').toBe(true);
    expect(s.keptUnits).toEqual(['offense', 'management']);
  });

  it('a unit nobody on the staff holds cannot be handed back', () => {
    const { session } = setup();
    const s = session(['management']);
    const base = placeholderStaffChart({ teamId: 1, level: 'pro', seed: seedFromHex(SEED_HEX) });
    expect(chartKeeping(base, new Set()).assignments[staff.DUTY.gameManagement]).toBeDefined();
    expect(() => s.handBack('offense')).not.toThrow(); // not held by him: nothing to do
  });
});

describe('simulating and watching reach the same game (J14.4.1)', () => {
  it('with everything handed to the staff the game runs straight to the end, the same as the chart callers alone', () => {
    const { input, deps, session } = setup();
    const s = session([]);
    s.start();
    expect(s.final).toBe(true);
    const plain = flow.simulateGame(input, deps());
    expect(hashOf(s)).toBe(plain.records[plain.records.length - 1]!.stateHash);
  });

  it('watching paces each play by its time on screen and lands on the same final state', () => {
    const { input, deps, session } = setup();
    const s = session([], { mode: 'watch', stopRules: [], betweenPlaysMs: 500 }, 3000);
    s.start();
    expect(s.final).toBe(false);
    const plays = () => s.events.filter((e) => e.type === 'play_resolved').length;
    // The first hold comes before any play has run (only the gap between plays); the next after the opening kick.
    expect(s.watching).toMatchObject({ untilMs: 500, paused: false });
    s.wait(499);
    expect(plays()).toBe(0);
    s.wait(1);
    expect(plays()).toBe(1);
    expect(s.watching?.untilMs).toBe(500 + 3000 + 500);
    s.wait(3499);
    expect(plays()).toBe(1);
    s.wait(1);
    expect(plays()).toBe(2);
    runOut(s, 1000);
    const plain = flow.simulateGame(input, deps());
    expect(hashOf(s)).toBe(plain.records[plain.records.length - 1]!.stateHash);
  });

  it('double speed halves the time on screen; summary runs straight on', () => {
    const { session } = setup();
    const d = session([], { mode: 'double', stopRules: [] }, 3000);
    d.start(); // no gap between plays: the opening kick runs at once, then shows for half its 3 s
    expect(d.watching?.untilMs).toBe(1500);
    const m = session([], { mode: 'summary', stopRules: [] }, 3000);
    m.start();
    expect(m.final).toBe(true);
  });

  it('a stop rule halts the summary until he goes on', () => {
    const { session } = setup();
    const s = session([], { mode: 'summary', stopRules: [{ kind: 'down', downs: [3] }] }, 3000);
    s.start();
    expect(s.final).toBe(false);
    expect(s.watching).toMatchObject({ paused: true, reason: 'down' });
    expect(s.situation().down).toBe(3);
    const n = s.events.length;
    s.wait(60_000);
    expect(s.events.length).toBe(n);
    s.resumeWatch();
    expect(s.events.length).toBeGreaterThan(n);
  });

  it('simulate to the half hands everything over and gives his units back when it stops', () => {
    const { session } = setup();
    const s = session(['management']);
    s.start();
    s.simulateTo('half');
    expect(s.final || s.situation().period >= 3).toBe(true);
    expect(s.keptUnits).toEqual(['management']);
  });
});

describe('the sideline seat (E7.5.1, plans/head-coach-nuance.md item 2)', () => {
  it('a head coach who calls every unit himself gets management items late, after his call; with coordinators calling he gets them at once', () => {
    const { session } = setup();
    const caller = session(['offense', 'defense', 'special_teams', 'management']);
    caller.start();
    runOut(caller);
    expect(caller.final).toBe(true);
    expect(caller.attentionHolds).toBeGreaterThan(0);
    const delegated = session();
    delegated.start();
    runOut(delegated);
    expect(delegated.attentionHolds).toBe(0);
  });
});
