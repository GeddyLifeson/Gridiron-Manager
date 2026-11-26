// G-60 acceptance (R1.2.6 gate item 6, Q1.5.2): a FULL game on pro_2026 with side 0 called only through keys.
// Offense, defense, special teams, the prompts and a timeout all go through the live key map and the console;
// the other side is the calibration chart caller. Every user call reaches the engine at the play-clock reading
// equal to the reading when the console opened minus the real time the keys took: the clock never stopped.
import { describe, it, expect } from 'vitest';
import { DMATH, field, seedFromHex, streamSource } from '@gm/engine-core';
import { flow, stats } from '@gm/engine-game';
import { calibration } from '@gm/headless';
import * as officiating from '@gm/officiating';
import { resolver } from '@gm/resolver-reference';
import { resolveRuleSet } from '@gm/rules-data';
import { ATTRIBUTE_IDS, NEUTRAL_ENVIRONMENT, type Decision, type GameDeps, type GameInput, type ParamFile, type ParamTable, type Side, type SimTeam } from '@gm/schema';
import { GameCallingSession, playClockAt, type LineupFor } from '../../src/commands/game-calling/index.ts';
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

function setup(seedHex: string) {
  const rules = resolveRuleSet('pro_2026');
  const params = paramTable();
  const geometry = field.fieldGeometry(rules);
  const input: GameInput = {
    gameId: 1, ruleSetId: 'pro_2026', gameType: 'regular', teams: [team(0), team(1)], crew: officiating.crew.neutralCrew(1),
    environment: NEUTRAL_ENVIRONMENT, seedHex, fidelityTier: 'B',
  };
  const roster = (s: Side) => calibration.depthRoster(input.teams[s].depth);
  const regulationPeriods = rules.num('clock.periods');
  const deps: GameDeps = {
    rules, params, geometry, streams: streamSource(seedFromHex(seedHex)), math: DMATH, resolver: resolver.REFERENCE_RESOLVER,
    officiating: officiating.facade.createOfficiating(),
    deciders: [
      calibration.createChartCaller({ side: 0, geometry, roster: roster(0), regulationPeriods }),
      calibration.createChartCaller({ side: 1, geometry, roster: roster(1), regulationPeriods }),
    ],
  };
  const lineup: LineupFor = (unit) => roster(0)(unit, null);
  return { input, deps, lineup };
}

const KEY_MS = 250; // virtual time per key press: a named test assumption, not a measured value
const LIVE_MS = 6000; // virtual time from a committed call to the next dead ball: a named test assumption

describe('G-60 full game through the console keys', () => {
  it('plays a whole pro_2026 game with side 0 called only by keys, and the play clock never stops', () => {
    const { input, deps, lineup } = setup('6d0c9a1f3b2e4c5d');
    const session = new GameCallingSession({ input, deps, userSide: 0, console: testConsoleConfig(), lineup, resolve, keyIntervalMs: KEY_MS, startMs: 0, liveMs: () => LIVE_MS, bookLine: () => '4th and 1: go. Longer: kick' });
    session.start();

    const confirms = new Map<number, { openClock: number; openMs: number; enterMs: number }>();
    const units = new Set<string>();
    const prompts = new Set<string>();
    let timeouts = 0;
    let pick = 0;
    let lastOpen = -1;
    let stuck = 0;
    let queuedSent = 0;
    let alertedFourths = 0;
    let lateWindows = 0;
    let lateTimeouts = 0;
    let lateTimeoutAt: { at: number; granted: boolean; deadline: number | null } | null = null;

    for (let guard = 0; guard < 20000 && !session.final; guard++) {
      const s = session.driver.state;
      // The play is running on screen: queue the next call for the second-down and third-down boxes (I2.3.6).
      if (session.holding) {
        const keys = s.cfg.keys.offense!;
        if (s.sent?.unit === 'offense' && s.queue.length === 0) session.pressAll([...keys.box['second']!, 'Digit2', ...keys.box['third']!, 'Digit1']);
        session.wait(LIVE_MS);
        continue;
      }
      const p = session.pending;
      // The late-timeout window (after the calls, before the snap; engine PR 146): one timeout in the third quarter.
      if (p?.late) {
        lateWindows++;
        if (lateTimeouts === 0 && session.game.period === 3 && s.open && !s.timeoutThisDeadBall) {
          const before = session.events.filter((e) => e.type === 'timeout_charged' && e.side === 0).length;
          const at = playClockAt(s, session.driver.nowMs + KEY_MS);
          session.press('KeyT');
          const charged = session.events.filter((e) => e.type === 'timeout_charged' && e.side === 0).length;
          lateTimeoutAt = { at, granted: charged > before, deadline: p.request.deadlinePlayClockTenths };
          lateTimeouts++;
          continue;
        }
        session.wait(1000);
        continue;
      }
      if (!p || !s.open) throw new Error('session waits with no open request');
      const id = p.request.requestId;
      if (id === lastOpen) { if (++stuck > 3) { session.settle(); continue; } } else { stuck = 0; lastOpen = id; }
      if (s.step === 'prompt') {
        prompts.add(p.request.type);
        session.press(p.request.type === 'challenge' ? 'Digit1' : 'Enter');
        continue;
      }
      if (s.step === 'fourth') {
        const toGoal = s.open.situation.toGoal;
        const offense = s.open.request.type === 'snapping_call';
        session.press(offense ? (toGoal <= 30 ? 'Digit3' : 'Digit2') : (toGoal <= 30 ? 'Digit3' : 'Digit2'));
        continue;
      }
      if (s.step !== 'select') { session.settle(); continue; }
      units.add(s.open.unit);
      if (s.alerted !== null && s.open.kind === 'fourth_down') alertedFourths++;
      // Third down far from the goal: pre-commit the punt (I4.1.1).
      if (s.open.request.type === 'snapping_call' && s.open.situation.down === 3 && s.open.situation.toGoal > 45 && s.precommit === 'decide_then') session.press('KeyK');
      // Queued call preselected: one key sends it.
      if (s.notice === 'console.queuedReady' && s.selected) {
        session.press('Enter');
        confirms.set(id, { openClock: p.playClockTenths, openMs: p.openedAtMs, enterMs: session.driver.nowMs });
        queuedSent++;
        session.settle();
        continue;
      }
      // One timeout in the second quarter, from the offense's console while the timeout window is open.
      if (timeouts === 0 && p.preview && session.game.period === 2 && s.open.unit === 'offense') {
        session.press(s.open.insideTwoMinute ? 'Hold+KeyT' : 'KeyT');
        timeouts++;
        continue;
      }
      const sheet = s.cfg.sheets[s.open.unit]!;
      const box = sheet.boxes.find((b) => b.id === s.focus.boxId);
      const count = box?.entries.length ?? 0;
      if (count === 0) { session.settle(); continue; }
      const digit = (pick++ % Math.min(count, 9)) + 1;
      session.press(`Digit${digit}`);
      if (s.open.unit === 'offense' && pick % 5 === 0) session.press('KeyF');
      const before = session.driver.state;
      if (!before.open) continue;
      session.press('Enter');
      confirms.set(id, { openClock: p.playClockTenths, openMs: p.openedAtMs, enterMs: session.driver.nowMs });
      session.settle();
    }

    if (!session.final) { const s = session.driver.state; throw new Error(JSON.stringify({ step: s.step, unit: s.open?.unit, kind: s.open?.kind, req: session.pending?.request, focus: s.focus, sel: s.selected, notice: s.notice, log: s.log.slice(-12) })); }
    expect(session.final).toBe(true);
    expect([...units].sort()).toEqual(['defense', 'offense', 'special']);
    expect(prompts.has('toss_call') || prompts.has('toss_choice') || prompts.has('try_choice')).toBe(true);
    expect(timeouts).toBe(1);
    expect(queuedSent).toBeGreaterThan(5);
    expect(alertedFourths).toBeGreaterThan(0);
    expect(session.events.some((e) => e.type === 'timeout_charged' && e.side === 0)).toBe(true);

    // Every user call: accepted at the open reading minus the elapsed key time, as the engine logged it.
    const made = new Map<number, Decision>();
    for (const e of session.events) if (e.type === 'decision_made') made.set(e.decision.requestId, e.decision);
    // With the engine's late timeout (PR 146) the window opens before every snap and T in it is granted.
    if (lateWindows > 0) {
      expect(lateTimeoutAt).not.toBeNull();
      expect(lateTimeoutAt!.granted).toBe(lateTimeoutAt!.at >= (lateTimeoutAt!.deadline ?? 0) && lateTimeoutAt!.at > 0);
      const late = [...made.values()].find((d) => d.side === 0 && d.type === 'timeout' && d.optionId === 'timeout' && d.acceptedAtPlayClockTenths === lateTimeoutAt!.at);
      expect(late).toBeDefined();
    }
    let checked = 0;
    let late = 0;
    for (const a of session.answers) {
      const c = confirms.get(a.request.requestId);
      if (!c) continue;
      const expected = c.openClock - Math.floor((c.enterMs - c.openMs) / 100);
      const logged = made.get(a.request.requestId)!;
      // A confirm after the deadline is too late: the default plays (J11.6.1). That is the clock running, not a fault.
      if (logged.actor.kind === 'default') { expect(expected).toBeLessThanOrEqual(flow.flowParam(deps, 'callDeadlinePlayClockTenths')); late++; continue; }
      expect(logged.acceptedAtPlayClockTenths).toBe(expected);
      expect(logged.actor.kind).toBe('user');
      // A call made while the timeout window was open reaches the call request at the same reading.
      if (a.request.type === 'timeout') {
        const call = session.answers.find((x) => x.request.requestId > a.request.requestId && (x.request.type === 'snapping_call' || x.request.type === 'opposing_call'));
        if (call && call.decision.actor.kind === 'user') expect(made.get(call.request.requestId)!.acceptedAtPlayClockTenths).toBe(expected);
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(50);
    expect(late).toBeLessThan(checked / 10);
    // The user's calls were played as calls, not defaults.
    const userCalls = [...made.values()].filter((d) => d.side === 0 && (d.type === 'snapping_call' || d.type === 'opposing_call'));
    expect(userCalls.filter((d) => d.actor.kind === 'user').length).toBeGreaterThan(userCalls.length * 0.9);
  }, 120_000);
});
