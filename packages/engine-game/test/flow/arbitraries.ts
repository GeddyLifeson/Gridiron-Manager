// Generators for the game flow property tests: arbitrary play results and arbitrary coaches.
import fc from 'fast-check';
import type { Contract } from '@gm/engine-core';
import { defaultOpposingCall, defaultSnappingCall, type FlowEnv } from '../../src/flow/index.ts';
import { chartDecider, fakeGame, type FakeGame, type FakeGameOptions } from './fakes.ts';

/**
 * A coach who does anything: any option offered, any unit on any down (a kickoff on third down, a
 * kneel on a try), any number of players from none to too many, any tempo, an answer at any point
 * of the play clock, a malformed answer, or no answer at all. Driven by a list of numbers. After
 * ARBITRARY_DECISIONS answers the coach turns sensible, because two coaches who punt on every down
 * of an untimed overtime never finish a game, in this engine or on a field.
 */
const ARBITRARY_DECISIONS = 500;
export function anyDecider(side: Contract.Side, env: FlowEnv, input: Contract.GameInput, choices: readonly number[]): Contract.Decider {
  let k = side * 7;
  const next = () => choices[k++ % choices.length]!;
  const OFFENSE = ['run', 'dropback_pass', 'kneel', 'spike', 'screen', 'qb_run'] as const;
  const KICKS = ['punt', 'field_goal', 'try_kick', 'kickoff', 'onside_kick', 'safety_kick'] as const;
  const TEMPO = ['huddle', 'no_huddle', 'hurry_up'] as const;
  const sensible = chartDecider(side, env, input);
  let asked = 0;
  return {
    side,
    decide(view) {
      if (++asked > ARBITRARY_DECISIONS) return sensible.decide(view);
      const { request, situation } = view;
      const c = next();
      if (c % 11 === 0) return null;
      const players = input.teams[side].players.slice(0, next() % 14).map((p) => ({ playerId: p.playerId, role: p.position }));
      const base: Contract.Decision = {
        requestId: request.requestId, type: request.type, side, optionId: null, snappingCall: null, opposingCall: null,
        acceptedAtPlayClockTenths: c % 3 === 0 ? null : next() % 450, actor: { kind: 'ai', personId: null },
      };
      if (c % 13 === 0) return { ...base, optionId: 'not_an_option', type: 'timeout' };
      if (request.type === 'snapping_call') {
        const model = defaultSnappingCall(env, { ...situation, playKind: 'scrimmage', down: 1 }, players);
        const kick: Contract.KickCall = { unit: 'kick', kickKind: KICKS[next() % KICKS.length]!, callContentId: null, contentHash: null, direction: null, players };
        if (c % 4 === 0 || model.unit !== 'offense') return { ...base, snappingCall: kick };
        if (c % 4 === 1) return { ...base, snappingCall: defaultSnappingCall(env, situation, players) };
        return { ...base, snappingCall: { ...model, kind: OFFENSE[next() % OFFENSE.length]!, tempo: TEMPO[next() % TEMPO.length]! } };
      }
      if (request.type === 'opposing_call') return { ...base, opposingCall: defaultOpposingCall(env, c % 5 === 0 ? { ...situation, playKind: 'kickoff' } : situation, players) };
      return { ...base, optionId: request.options.length > 0 ? request.options[next() % request.options.length]!.optionId : null };
    },
  };
}

const unit = fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true });
export const gameArb = fc.record({
  seed: fc.integer({ min: 0, max: 1_000_000 }),
  base: fc.constantFrom('pro_2026' as const, 'college_2026' as const),
  format: fc.constantFrom('timed_period' as const, 'alternating_series_25' as const),
  gameType: fc.constantFrom('regular' as const, 'postseason' as const),
  periodS: fc.integer({ min: 15, max: 200 }),
  overtimeS: fc.integer({ min: 15, max: 120 }),
  twoMinuteS: fc.integer({ min: 1, max: 120 }),
  plays: fc.array(fc.array(unit, { minLength: 6, maxLength: 6 }), { minLength: 1, maxLength: 80 }),
  choices: fc.array(fc.nat(10_000), { minLength: 1, maxLength: 60 }),
  crewPace: fc.double({ min: 0.5, max: 2, noNaN: true }),
});
export type GameCase = typeof gameArb extends fc.Arbitrary<infer T> ? T : never;

/** Arbitrary results for the first plays (the list is played this many times over), then seeded draws so that every game ends. */
const ARBITRARY_PLAYS = 2;

function caseOptions(c: GameCase): FakeGameOptions {
  return {
    seed: c.seed, base: c.base, format: c.format, gameType: c.gameType,
    rulesOver: { 'clock.period_length_s': c.periodS, 'fixture.two_minute_s': c.twoMinuteS, ...(c.format === 'timed_period' ? { 'overtime.period_length_s': c.overtimeS } : {}) },
    paramsOver: { 'flow.maxPlays': 5000 },
    numbers: (sit) => (sit.playNumber <= ARBITRARY_PLAYS * c.plays.length ? c.plays[(sit.playNumber - 1) % c.plays.length] : undefined),
    deciders: (env, input) => [anyDecider(0, env, input, c.choices), anyDecider(1, env, input, c.choices)],
  };
}

export function build(c: GameCase): FakeGame {
  const game = fakeGame(caseOptions(c));
  return { ...game, input: { ...game.input, crew: { ...game.input.crew, pace: c.crewPace } } };
}

