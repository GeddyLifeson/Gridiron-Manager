// Q1.1.1 rule cases for B10 (pro overtime) and B13.7.1 (college overtime), and the J11.8.2 acceptance:
// scripted overtime games under each format end by the correct rule. FIXTURE rule sets
// (test/kick/fixture.ts). The driver below plays a list of named plays through OvertimeRules the way
// the game state machine will: it applies each play to the state, asks `afterPossession`, and follows
// the step. A play that the state does not allow (a snap when a kickoff is due) fails the test.
import { describe, expect, it } from 'vitest';
import {
  OvertimeState, OvertimeStep, ParamFile, RuleKeyManifest, otherSide,
  type GameState, type PlayOutcome, type RuleSet, type ScoreEvent, type Side,
} from '@gm/schema';
import { createOvertimeRules, RULE_KEYS, PARAMS } from '../../src/overtime/index.ts';
import { CENTRE_Y, COLLEGE, COLLEGE_VALUES, PRO, PRO_VALUES, fixtureRuleSet, makeCtx, makeState, opp, own } from '../kick/fixture.ts';

const ot = createOvertimeRules();

type PlayName =
  | 'kickoff' | 'kickoff_td' | 'kick_recovered' | 'gain' | 'td' | 'fg' | 'missed_fg' | 'punt' | 'downs' | 'int' | 'pick6'
  | 'safety' | 'muffed_punt' | 'double_change' | 'try_kick' | 'try_kick_no_points' | 'try_two' | 'try_fail' | 'def_try' | 'no_play' | 'expire';

const FREE = ['kickoff', 'kickoff_td', 'kick_recovered'];
const TRIES = ['try_kick', 'try_kick_no_points', 'try_two', 'try_fail', 'def_try'];

class Sim {
  state: GameState;
  result: 'final_win' | 'final_tie' | null = null;
  played = 0;
  readonly rules: RuleSet;

  constructor(rules: RuleSet, gameType: GameState['gameType'], first: Side = 0, sameEnd = false) {
    this.rules = rules;
    this.state = makeState({ gameType, period: 5, score: [20, 20], overtime: null, attackDir: sameEnd ? [1, 1] : [1, -1] });
    expect(ot.start(this.state, this.ctx())).toEqual({ next: 'toss', restart: null, state: null });
    this.state = { ...this.state, overtime: ot.begin(1, first, first) };
    this.follow(ot.start(this.state, this.ctx()));
  }

  ctx() { return makeCtx({ rules: this.rules, offense: this.state.possession, playKind: this.state.nextPlayKind, state: { ...this.state } }); }

  /** Applies an overtime step the way the state machine will. */
  follow(step: OvertimeStep): void {
    OvertimeStep.parse(step);
    if (step.next === 'final_win' || step.next === 'final_tie') { this.result = step.next; this.state = { ...this.state, overtime: step.state }; return; }
    this.state = { ...this.state, overtime: step.state };
    if (step.restart) this.state = { ...this.state, possession: step.restart.side, nextPlayKind: step.restart.playKind, ballX: step.restart.ballX };
    if (step.next === 'next_ot_period') {
      this.state = { ...this.state, period: this.state.period + 1 };
      // Alternating series start each period with a fresh series; a timed period carries on.
      if (this.rules.opt('overtime.format') === 'alternating_series_25') this.follow(ot.start(this.state, this.ctx()));
    }
  }

  play(name: PlayName): this {
    if (this.result) throw new Error(`script plays "${name}" after the game ended`);
    this.played++;
    if (name === 'expire') { this.follow(ot.periodExpired(this.state, this.ctx())); return this; }
    const before = this.state;
    const kind = before.nextPlayKind;
    const O = before.possession, D = otherSide(O);
    const want = FREE.includes(name) ? ['kickoff', 'safety_kick'] : TRIES.includes(name) ? ['try'] : name === 'no_play' ? [kind] : ['scrimmage'];
    if (!want.includes(kind)) throw new Error(`script plays "${name}" but the state calls for a ${kind}`);
    const ctx = this.ctx();
    const score: [number, number] = [before.score[0], before.score[1]];
    const out: PlayOutcome = { resultType: 'run', noPlay: false, snappingSide: O, possessionAfter: O, changeOfPossession: false, spotX: 60, spotY: CENTRE_Y,
      previousSpotX: before.ballX, score: null, touchback: false, endedOutOfBounds: false, incomplete: false, runnerDownInBounds: true, yardsGained: 0,
      injuryStoppage: [], enforcement: null };
    let possession: Side = O;
    let next: GameState['nextPlayKind'] = 'scrimmage';
    const scored = (type: ScoreEvent['type'], side: Side, points: number): void => { out.score = { type, side, points, scorerId: null }; score[side] += points; };
    const turnover = (): void => { out.possessionAfter = D; out.changeOfPossession = true; possession = D; };
    switch (name) {
      case 'kickoff': out.resultType = 'kickoff'; turnover(); break;
      case 'kickoff_td': out.resultType = 'kickoff'; turnover(); scored('touchdown', D, 6); next = 'try'; break;
      case 'kick_recovered': out.resultType = 'kickoff'; break;
      case 'gain': break;
      case 'td': scored('touchdown', O, 6); next = 'try'; break;
      case 'fg': out.resultType = 'field_goal_good'; scored('field_goal', O, 3); next = 'kickoff'; break;
      case 'missed_fg': out.resultType = 'field_goal_missed'; turnover(); break;
      case 'punt': out.resultType = 'punt'; turnover(); break;
      case 'downs': possession = D; break; // SeriesRules gives the ball over; the outcome itself shows no change
      case 'int': out.resultType = 'interception'; turnover(); break;
      case 'pick6': out.resultType = 'interception'; turnover(); scored('touchdown', D, 6); next = 'try'; break;
      case 'safety': scored('safety', D, 2); next = 'safety_kick'; break;
      case 'muffed_punt': out.resultType = 'punt'; out.changeOfPossession = true; break;
      case 'double_change': out.resultType = 'interception'; out.changeOfPossession = true; break;
      case 'try_kick': out.resultType = 'try_good'; scored('try_kick', O, 1); next = 'kickoff'; break;
      case 'try_kick_no_points': out.resultType = 'try_good'; scored('try_kick', O, 0); next = 'kickoff'; break;
      case 'try_two': out.resultType = 'try_good'; scored('try_two', O, 2); next = 'kickoff'; break;
      case 'try_fail': out.resultType = 'try_failed'; next = 'kickoff'; break;
      case 'def_try': out.resultType = 'try_failed'; scored('defensive_try', D, 2); next = 'kickoff'; break;
      case 'no_play': out.resultType = 'no_play'; out.noPlay = true; next = kind; break;
    }
    this.state = { ...before, score, possession, nextPlayKind: next };
    this.follow(ot.afterPossession(this.state, out, ctx));
    return this;
  }

  get winner(): Side | null { return this.state.score[0] === this.state.score[1] ? null : this.state.score[0] > this.state.score[1] ? 0 : 1; }
}

interface Case { name: string; plays: PlayName[]; result: 'final_win' | 'final_tie' | null; winner?: Side; score?: [number, number]; first?: Side }

/** Plays the script. The game must still be going before the last play and must end, or not, as the case says. */
function runCase(rules: RuleSet, gameType: GameState['gameType'], c: Case, sameEnd = false): Sim {
  const sim = new Sim(rules, gameType, c.first ?? 0, sameEnd);
  for (const p of c.plays) sim.play(p);
  expect(sim.played).toBe(c.plays.length);
  expect(sim.result).toBe(c.result);
  if (c.result === 'final_win') expect(sim.winner).toBe(c.winner);
  if (c.result === 'final_tie') expect(sim.winner).toBeNull();
  if (c.score) expect(sim.state.score).toEqual(c.score);
  if (sim.state.overtime) OvertimeState.parse(sim.state.overtime);
  return sim;
}

describe('overtime module contract', () => {
  it('exports a valid rule-key manifest and parameter file, and both fixtures define every key', () => {
    const keys = RuleKeyManifest.parse(RULE_KEYS);
    ParamFile.parse(PARAMS);
    expect(new Set(keys.map((k) => k.key)).size).toBe(keys.length);
    for (const k of keys) for (const values of [PRO_VALUES, COLLEGE_VALUES]) {
      expect(values[k.key], k.key).toBeDefined();
      if (k.type === 'option') expect(k.options).toContain(values[k.key]);
    }
  });

  it('a play that does not count changes nothing', () => {
    const sim = new Sim(PRO, 'regular').play('kickoff');
    const log = sim.state.overtime;
    sim.play('no_play');
    expect(sim.state.overtime).toEqual(log);
    expect(sim.result).toBeNull();
  });
});

// Team 0 receives the overtime kickoff unless a case says otherwise. Regulation ended 20 to 20.
const TIMED_BOTH: Case[] = [
  { name: 'B10.2.1: field goal, then field goal, then next score wins', plays: ['kickoff', 'fg', 'kickoff', 'fg', 'kickoff', 'gain', 'fg'], result: 'final_win', winner: 0, score: [26, 23] },
  { name: 'B10.2.1: touchdown and extra point, then the second team scores a touchdown and makes a two-point try: second team wins', plays: ['kickoff', 'td', 'try_kick', 'kickoff', 'td', 'try_two'], result: 'final_win', winner: 1, score: [27, 28] },
  { name: 'B10.4.1: opening kickoff muffed and recovered by the kicking team, which then kicks a field goal: game over', plays: ['kick_recovered', 'gain', 'fg'], result: 'final_win', winner: 1, score: [20, 23] },
  { name: 'B10.4.1: first possession ends in an interception returned for a touchdown: game over, defense wins, no try', plays: ['kickoff', 'gain', 'pick6'], result: 'final_win', winner: 1, score: [20, 26] },
  { name: 'B10.4.1: first possession punt, second team field goal: game over', plays: ['kickoff', 'punt', 'gain', 'fg'], result: 'final_win', winner: 1, score: [20, 23] },
  { name: 'B10.2.1 item 2: the kicking team scores a safety on the first possession and wins at once', plays: ['kickoff', 'safety'], result: 'final_win', winner: 1, score: [20, 22] },
  { name: 'B10.4.1: the second team fails on downs while behind: the first team wins', plays: ['kickoff', 'td', 'try_kick', 'kickoff', 'gain', 'downs'], result: 'final_win', winner: 0, score: [27, 20] },
  { name: 'B10.4.2: second team trailing by 3 throws an interception: game over', plays: ['kickoff', 'fg', 'kickoff', 'int'], result: 'final_win', winner: 0, score: [23, 20] },
  { name: 'B10.4.2 item 1: points on the down count: the second team\'s pass is returned for a touchdown, no try', plays: ['kickoff', 'fg', 'kickoff', 'pick6'], result: 'final_win', winner: 0, score: [29, 20] },
  { name: 'B10.4.1: a touchdown each with the extra point is a tie after both possessions, then sudden death', plays: ['kickoff', 'td', 'try_kick', 'kickoff', 'td', 'try_kick', 'kickoff', 'gain', 'fg'], result: 'final_win', winner: 0, score: [30, 27] },
  { name: 'B10.5.1 item 4: the second team scores a touchdown to trail by one and misses the try: the first team wins', plays: ['kickoff', 'td', 'try_kick', 'kickoff', 'td', 'try_fail'], result: 'final_win', winner: 0, score: [27, 26] },
  { name: 'B10.5.1 item 4: a second-team touchdown that puts it ahead ends the game with no try', plays: ['kickoff', 'fg', 'kickoff', 'td'], result: 'final_win', winner: 1, score: [23, 26] },
  { name: 'B10.4.1: neither team scores on its first possession; the next touchdown wins with no try', plays: ['kickoff', 'punt', 'punt', 'td'], result: 'final_win', winner: 0, score: [26, 20] },
  { name: 'B10.4.1 item 3: a punt muffed by the second team and recovered by the kicking team is its opportunity: next score wins', plays: ['kickoff', 'muffed_punt', 'fg'], result: 'final_win', winner: 0, score: [23, 20] },
  { name: 'B10.4.2 item 4: a double change of possession gives the second team its possession: next score wins', plays: ['kickoff', 'double_change', 'gain', 'fg'], result: 'final_win', winner: 0, score: [23, 20] },
  { name: 'a kickoff returned for a touchdown is the first possession; the second team still gets the ball', plays: ['kickoff_td', 'try_kick', 'kickoff', 'missed_fg'], result: 'final_win', winner: 0, score: [27, 20] },
  { name: 'a defensive two-point return on the first team\'s try does not use up the second team\'s possession', plays: ['kickoff', 'td', 'def_try', 'kickoff', 'fg'], result: 'final_win', winner: 0, score: [26, 25] },
  { name: 'a first-possession touchdown does not end the game', plays: ['kickoff', 'td', 'try_kick', 'kickoff', 'gain'], result: null, score: [27, 20] },
  { name: 'a first-possession field goal does not end the game', plays: ['kickoff', 'fg'], result: null },
  { name: 'the second team may answer a field goal with a field goal and play on', plays: ['kickoff', 'fg', 'kickoff', 'fg', 'kickoff', 'punt', 'punt'], result: null },
  { name: 'the toss winner may choose to kick: the other team has the first possession', plays: ['kickoff', 'punt', 'fg'], result: 'final_win', winner: 0, score: [23, 20], first: 1 },
];

const REGULAR_ONLY: Case[] = [
  { name: 'B10.2.1: opening drive uses 10:00 and ends in a field goal as time expires: first team wins', plays: ['kickoff', 'gain', 'fg', 'expire'], result: 'final_win', winner: 0, score: [23, 20] },
  { name: 'B10.2.1: 10:00 expires tied: tie', plays: ['kickoff', 'gain', 'punt', 'gain', 'expire'], result: 'final_tie', score: [20, 20] },
  { name: 'B10.2.1 item 5: time expires while the second team\'s first possession is still going: the team ahead wins', plays: ['kickoff', 'td', 'try_kick', 'kickoff', 'gain', 'expire'], result: 'final_win', winner: 0 },
  { name: 'B10.2.1 item 5: time expires tied after a field goal each: tie', plays: ['kickoff', 'fg', 'kickoff', 'fg', 'kickoff', 'expire'], result: 'final_tie', score: [23, 23] },
];

const POSTSEASON_ONLY: Case[] = [
  { name: 'B10.3.1: opening drive lasts 15:00 and ends with a touchdown on the last play: the second team still gets its possession in the next period', plays: ['kickoff', 'gain', 'td', 'try_kick', 'expire', 'kickoff', 'gain'], result: null, score: [27, 20] },
  { name: 'B10.3.1: that possession then fails: the first team wins', plays: ['kickoff', 'td', 'try_kick', 'expire', 'kickoff', 'gain', 'downs'], result: 'final_win', winner: 0 },
  { name: 'B10.3.1 item 4: a period that ends tied is followed by another; the next score wins', plays: ['kickoff', 'punt', 'punt', 'expire', 'gain', 'fg'], result: 'final_win', winner: 0, score: [23, 20] },
  { name: 'B10.3.1 item 4: there is no limit on periods and no tie', plays: ['kickoff', 'punt', 'punt', 'expire', 'punt', 'expire', 'punt', 'expire', 'punt', 'expire', 'punt', 'expire'], result: null, score: [20, 20] },
  { name: 'B10.3.1: time expiring during the second team\'s first possession does not end the game', plays: ['kickoff', 'fg', 'kickoff', 'gain', 'expire', 'gain', 'td'], result: 'final_win', winner: 1, score: [23, 26] },
];

describe('B10.2.1 regular season overtime, timed period (pro fixture)', () => {
  for (const c of [...TIMED_BOTH, ...REGULAR_ONLY]) it(c.name, () => { runCase(PRO, 'regular', c); });

  it('one period of 10:00, two timeouts each, none carried over (B10.5.1 acceptance)', () => {
    const sim = new Sim(PRO, 'regular');
    // A team that ended regulation with three unused timeouts starts overtime with two.
    const state = { ...sim.state, timeoutsLeft: [3, 3] as [number, number] };
    expect(ot.timeoutsPerTeam(state, sim.ctx())).toBe(2);
    expect(ot.timeoutsRenewed(state, sim.ctx())).toBe(true);
    expect(ot.periodLengthTenths(state, sim.ctx())).toBe(6000);
    expect(ot.intermissionTenths(state, sim.ctx())).toBe(1800);
    expect(ot.twoMinuteWarning(sim.ctx())).toBe(true);
  });

  it('B10.4.1: the status strip follows first possession, second possession, sudden death', () => {
    const sim = new Sim(PRO, 'regular');
    expect(ot.phase(sim.state, sim.ctx())).toBe('not_started');
    sim.play('kickoff');
    expect(ot.phase(sim.state, sim.ctx())).toBe('first_possession');
    sim.play('fg').play('kickoff');
    expect(ot.phase(sim.state, sim.ctx())).toBe('second_possession');
    sim.play('fg').play('kickoff');
    expect(ot.phase(sim.state, sim.ctx())).toBe('sudden_death');
    const noScore = new Sim(PRO, 'regular').play('kickoff').play('punt');
    expect(ot.phase(noScore.state, noScore.ctx())).toBe('sudden_death');
  });

  it('the overtime kickoff is by the team that does not have the first possession, from its 35, and carries a penalty from the end of regulation (B10.5.1 item 6)', () => {
    const base = makeState({ period: 5, overtime: ot.begin(1, 1, 1) });
    const step = ot.start(base, makeCtx({ rules: PRO, state: base }));
    expect(step).toMatchObject({ next: 'kickoff', restart: { playKind: 'kickoff', side: 0, ballX: own(35) } });
    const penalised = makeState({ ...base, carriedPenalty: { against: 0, yards: 15, to: 'kickoff' } });
    expect(ot.start(penalised, makeCtx({ rules: PRO, state: penalised })).restart!.ballX).toBe(own(20));
    // Without the field geometry the step still says what is next.
    expect(ot.start(base, { rules: PRO, params: makeCtx({ rules: PRO }).params })).toMatchObject({ next: 'kickoff', restart: null });
  });
});

describe('B10.3.1 postseason overtime, timed periods until a winner (pro fixture)', () => {
  for (const c of [...TIMED_BOTH, ...POSTSEASON_ONLY]) it(c.name, () => { runCase(PRO, 'postseason', c); });

  it('15:00 periods, three timeouts per half of two periods, two-minute break between periods', () => {
    const sim = new Sim(PRO, 'postseason');
    const at = (otPeriod: number) => ({ ...sim.state, overtime: ot.begin(otPeriod, 0, 0) });
    expect(ot.periodLengthTenths(sim.state, sim.ctx())).toBe(9000);
    expect(ot.timeoutsPerTeam(sim.state, sim.ctx())).toBe(3);
    expect([1, 2, 3, 4, 5].map((p) => ot.timeoutsRenewed(at(p), sim.ctx()))).toEqual([true, false, true, false, true]);
    expect(ot.intermissionTenths(at(1), sim.ctx())).toBe(1800);
    expect(ot.intermissionTenths(at(2), sim.ctx())).toBe(1200);
  });

  it('items 9 and 10: the toss loser chooses first at the third period unless the winner deferred; a new toss after the fourth', () => {
    const sim = new Sim(PRO, 'postseason');
    const at = (otPeriod: number) => ({ ...sim.state, overtime: ot.begin(otPeriod, 1, 1) });
    const opening = (p: number, deferred = false) => ot.periodOpening(at(p), deferred, sim.ctx());
    expect(opening(1)).toEqual({ kind: 'choice', side: 1 });
    expect(opening(2)).toEqual({ kind: 'carry_over' });
    expect(opening(3)).toEqual({ kind: 'choice', side: 0 });
    expect(opening(4)).toEqual({ kind: 'carry_over' });
    expect(opening(5)).toEqual({ kind: 'toss' });
    expect(opening(7)).toEqual({ kind: 'choice', side: 0 });
    expect(opening(1, true)).toEqual({ kind: 'choice', side: 0 });
    expect(opening(3, true)).toEqual({ kind: 'choice', side: 1 });
    // The regular season has one period and no later choice.
    const regular = new Sim(PRO, 'regular');
    expect(ot.periodOpening(regular.state, false, regular.ctx())).toEqual({ kind: 'choice', side: 0 });
  });
});

// Team 0 has the first series of the first period. Both teams attack the east goal.
const ALTERNATING: Case[] = [
  { name: 'first period: field goal, then the other team fails: game over', plays: ['gain', 'fg', 'gain', 'downs'], result: 'final_win', winner: 0, score: [23, 20] },
  { name: 'first period: a touchdown does not end the game; the other team answers with a touchdown and a two-point try to win', plays: ['td', 'try_kick', 'td', 'try_two'], result: 'final_win', winner: 1, score: [27, 28] },
  { name: 'B13.7.1 item 6: the defense scores on the first series: the game ends at once, no try', plays: ['gain', 'pick6'], result: 'final_win', winner: 1, score: [20, 26] },
  { name: 'B13.7.1 item 6: the defense scores on the second series: the game ends', plays: ['fg', 'pick6'], result: 'final_win', winner: 0, score: [29, 20] },
  { name: 'acceptance 2: in the second period the kick may still be called, and a made kick scores nothing', plays: ['fg', 'fg', 'td', 'try_kick_no_points', 'td', 'try_two'], result: 'final_win', winner: 0, score: [31, 29] },
  { name: 'second period: touchdowns with failed two-point tries tie it again and a third period follows', plays: ['int', 'missed_fg', 'td', 'try_fail', 'td', 'try_fail'], result: null, score: [26, 26] },
  { name: 'acceptance 3: the third period consists of single plays from the try spot; one made, one missed, game over', plays: ['int', 'downs', 'missed_fg', 'int', 'try_two', 'try_fail'], result: 'final_win', winner: 0, score: [22, 20] },
  { name: 'item 5: teams alternate two-point plays until one leads after equal tries', plays: ['int', 'int', 'int', 'int', 'try_two', 'try_two', 'try_fail', 'try_fail', 'try_fail', 'try_two'], result: 'final_win', winner: 1, score: [22, 24] },
  { name: 'a defensive score on a try-only play counts but the other team still gets its try', plays: ['int', 'int', 'int', 'int', 'def_try', 'try_fail'], result: 'final_win', winner: 1, score: [20, 22] },
  { name: 'a defensive score on a try-only play can be answered in kind', plays: ['int', 'int', 'int', 'int', 'def_try', 'def_try'], result: null, score: [22, 22] },
  { name: 'a defensive two-point return on the try after a touchdown does not end the game', plays: ['td', 'def_try', 'td', 'try_kick'], result: 'final_win', winner: 1, score: [26, 29] },
  { name: 'a scoreless first series does not end the game; a field goal by the second team does', plays: ['gain', 'gain', 'missed_fg', 'gain', 'fg'], result: 'final_win', winner: 1, score: [20, 23] },
  { name: 'the first series may be given to the other team', plays: ['fg', 'int'], result: 'final_win', winner: 1, score: [20, 23], first: 1 },
];

describe('B13.7.1 overtime by alternating series (college fixture)', () => {
  for (const type of ['regular', 'postseason'] as const) {
    describe(`${type} game`, () => {
      for (const c of ALTERNATING) it(c.name, () => { runCase(COLLEGE, type, c, true); });
    });
  }

  it('item 2: each series starts first and 10 at the opponent 25, with no game clock and the play clock running', () => {
    const sim = new Sim(COLLEGE, 'regular', 0, true);
    expect(sim.state).toMatchObject({ possession: 0, nextPlayKind: 'scrimmage', ballX: opp(25) });
    expect(ot.periodLengthTenths(sim.state, sim.ctx())).toBe(0);
    const step = ot.afterPossession({ ...sim.state, possession: 1 }, { ...baseOutcome(0), possessionAfter: 1, changeOfPossession: true }, sim.ctx());
    expect(step).toEqual({ next: 'series', state: { otPeriod: 1, tossWinner: 0, firstPossession: 0, possessions: [{ side: 0, points: 0, ended: true }, { side: 1, points: 0, ended: false }] },
      restart: { playKind: 'scrimmage', side: 1, ballX: opp(25), ballY: CENTRE_Y, playClockTenths: 250 } });
    // Nothing expires: there is no clock.
    expect(ot.periodExpired(sim.state, sim.ctx()).next).toBe('series');
  });

  it('acceptance 3: from the third period the restart is a try from the 3', () => {
    const sim = new Sim(COLLEGE, 'regular', 0, true);
    for (const p of ['int', 'int', 'int', 'int'] as const) sim.play(p);
    expect(sim.state.overtime).toMatchObject({ otPeriod: 3 });
    expect(sim.state).toMatchObject({ nextPlayKind: 'try', ballX: opp(3), possession: 0 });
    sim.play('try_two');
    expect(sim.state).toMatchObject({ nextPlayKind: 'try', ballX: opp(3), possession: 1 });
  });

  it('item 1: the order of series alternates by period, and the toss loser has first choice in even periods', () => {
    const sim = new Sim(COLLEGE, 'regular', 0, true);
    sim.play('int').play('int');
    expect(sim.state.overtime).toMatchObject({ otPeriod: 2, firstPossession: 1, tossWinner: 0 });
    expect(sim.state.possession).toBe(1);
    const at = (otPeriod: number) => ({ ...sim.state, overtime: ot.begin(otPeriod, 0, 0) });
    expect([1, 2, 3, 4].map((p) => ot.periodOpening(at(p), false, sim.ctx()))).toEqual([
      { kind: 'choice', side: 0 }, { kind: 'choice', side: 1 }, { kind: 'choice', side: 0 }, { kind: 'choice', side: 1 }]);
  });

  it('item 7: one timeout per team in each extra period, none carried over (status: Rulebook only, case book not read)', () => {
    const sim = new Sim(COLLEGE, 'regular', 0, true);
    const at = (otPeriod: number) => ({ ...sim.state, overtime: ot.begin(otPeriod, 0, 0) });
    for (const p of [1, 2, 3, 4]) {
      expect(ot.timeoutsPerTeam(at(p), sim.ctx())).toBe(1);
      expect(ot.timeoutsRenewed(at(p), sim.ctx())).toBe(true);
    }
  });

  it('acceptance 1: a game never ends tied, over 300 generated games', () => {
    // A small fixed generator, so the test is the same on every run (the rules themselves draw nothing).
    let seed = 20261126;
    const rand = (n: number): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
    for (let game = 0; game < 300; game++) {
      const sim = new Sim(COLLEGE, 'regular', rand(2) as Side, true);
      for (let i = 0; i < 400 && !sim.result; i++) {
        const kind = sim.state.nextPlayKind;
        const late = sim.state.overtime!.otPeriod >= 2;
        const menu: PlayName[] = kind === 'try'
          ? (late ? ['try_two', 'try_fail', 'try_fail', 'def_try', 'try_kick_no_points'] : ['try_kick', 'try_two', 'try_fail'])
          : ['gain', 'gain', 'td', 'fg', 'missed_fg', 'downs', 'int', 'pick6', 'no_play'];
        sim.play(menu[rand(menu.length)]!);
      }
      expect(sim.result).toBe('final_win');
      expect(sim.winner).not.toBeNull();
    }
  });
});

describe('J11.8.2: the format is data, never the level', () => {
  it('a rule set of level "pro" with the alternating keys plays alternating series, and the reverse', () => {
    const swapped = fixtureRuleSet('fixture_swapped', 'pro', COLLEGE_VALUES);
    for (const c of ALTERNATING) runCase(swapped, 'regular', c, true);
    const reverse = fixtureRuleSet('fixture_reverse', 'college', PRO_VALUES);
    for (const c of [...TIMED_BOTH, ...REGULAR_ONLY]) runCase(reverse, 'regular', c);
  });

  it('the period limit is a key: with no limit a regular-season game cannot tie; with a limit of two it ties after the second', () => {
    const tied: PlayName[] = ['kickoff', 'punt', 'punt', 'expire'];
    const unlimited = fixtureRuleSet('fixture_unlimited', 'pro', { ...PRO_VALUES, 'overtime.regular.max_periods': 0 });
    expect(runCase(unlimited, 'regular', { name: '', plays: tied, result: null }).state.overtime!.otPeriod).toBe(2);
    const two = fixtureRuleSet('fixture_two', 'pro', { ...PRO_VALUES, 'overtime.regular.max_periods': 2 });
    runCase(two, 'regular', { name: '', plays: [...tied, 'punt', 'expire'], result: 'final_tie' });
  });
});

function baseOutcome(side: Side): PlayOutcome {
  return { resultType: 'interception', noPlay: false, snappingSide: side, possessionAfter: side, changeOfPossession: false, spotX: 60, spotY: CENTRE_Y,
    previousSpotX: 60, score: null, touchback: false, endedOutOfBounds: false, incomplete: false, runnerDownInBounds: true, yardsGained: 0,
    injuryStoppage: [], enforcement: null };
}
