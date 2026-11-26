// Live play: the trajectory tap on the game's resolver and the per-play field play and presentation feed.
import { describe, expect, it } from 'vitest';
import { flow } from '@gm/engine-game';
import { realGame } from '@gm/headless';
import type { PlayInput, Resolver } from '@gm/schema';
import { TICKS_PER_SECOND } from '@gm/schema';
import { LivePlayQueue, liveMsFrom, liveNoise, livePlay, liveSlots, liveTap } from '../../src/presentation/live/index.ts';
import { encodeV1 } from '../read-models/film/fixtures.ts';

/** A two-frame stand-in trajectory with all 22 players at the spot (test data, not a real play). */
function standIn(x: number, y: number) {
  const players = Array.from({ length: 22 }, (_, s) => ({ x: x + (s < 11 ? -1 : 1), y: y + (s % 11) - 5, heading: 0, gaze: 0, mode: 0, advantage: 0.1 }));
  const frame = { players, ball: { kind: 0, x, y, height: 1, carrier: 2 }, officials: [] };
  return encodeV1(-5, 0, [frame, frame]);
}

/** The reference resolver makes no trajectory; this one adds a one-frame stand-in when asked for full detail, so the tap has something to keep. */
function withTrajectory(inner: Resolver, asked: string[]): Resolver {
  return {
    ...inner,
    simulatePlay(input: PlayInput) {
      asked.push(input.options.detail);
      const r = inner.simulatePlay(input);
      if (input.options.detail !== 'full') return r;
      const s = input.situation;
      return { ...r, trajectory: standIn(s.ballX, s.ballY) };
    },
  };
}

describe('live tap and live play on a real game', () => {
  const g = realGame.createRealGame('pro_2026');
  const input = g.input(0, '00000000000a11ce');
  const plain = g.simulate(input);
  const asked: string[] = [];
  const base = g.deps(input);
  const tap = liveTap(withTrajectory(base.resolver, asked));
  const tapped = flow.simulateGame(input, { ...base, resolver: tap.resolver });

  it('asks the resolver for full detail and leaves the game unchanged', () => {
    expect(asked.length).toBeGreaterThan(0);
    expect(new Set(asked)).toEqual(new Set(['full']));
    expect(tapped.records.map((r) => r.stateHash)).toEqual(plain.records.map((r) => r.stateHash));
  });

  it('keeps every play\'s trajectory by play number, and forgets old ones on request', () => {
    for (const r of tapped.records) expect(tap.trajectory(r.index), `play ${r.index}`).not.toBeNull();
    const last = tapped.records[tapped.records.length - 1]!.index;
    tap.dropBefore(last);
    expect(tap.trajectory(1)).toBeNull();
    expect(tap.trajectory(last)).not.toBeNull();
  });

  it('builds the field play and the feed for every play of the game', () => {
    const teams = input.teams;
    let withNoise = 0;
    for (const record of tapped.records) {
      const trajectory = standIn(record.situation.ballX, record.situation.ballY);
      const p = livePlay({ record, trajectory, teams, ticksPerSecond: TICKS_PER_SECOND, environment: input.environment, userSide: 0, rules: g.rules });
      expect(p.playId).toBe(`${record.gameId}:${record.index}`);
      expect(p.feed.playId).toBe(p.playId);
      expect(p.film.visibility).toBe('user-visible');
      expect(p.feed.visibility).toBe('user-visible');
      expect(p.film.slots).toHaveLength(22);
      // The feed's camera cues are the film's events (one filter for live play and film), flags aside.
      const camera = p.feed.cues.filter((c) => !['contact', 'cadence', 'relay', 'ruling', 'flag'].includes(c.kind)).map((c) => `${c.kind}@${c.tick}`);
      expect(camera).toEqual(p.film.events.filter((e) => e.kind !== 'flag').map((e) => `${e.kind}@${e.tick}`));
      if (p.feed.conditions.noise !== null) withNoise++;
      expect(p.feed.missing).not.toContain('noise');
    }
    expect(withNoise).toBe(tapped.records.length);
  });

  it('takes the noise from the engine\'s own J12.6.1 function on the play\'s situation', () => {
    const record = tapped.records[10]!;
    const n = liveNoise(record, input.environment, g.rules);
    expect(n).toBeGreaterThanOrEqual(0);
    expect(n).toBeLessThanOrEqual(1);
    const p = livePlay({ record, trajectory: standIn(record.situation.ballX, record.situation.ballY), teams: input.teams, ticksPerSecond: TICKS_PER_SECOND, environment: input.environment, userSide: 0, rules: g.rules });
    expect(p.feed.conditions.noise).toBe(n);
  });

  it('puts the snapping unit in slots 0 to 10 and the other in 11 to 21, with roster jerseys', () => {
    const record = tapped.records[5]!;
    const slots = liveSlots(record, input.teams);
    const off = record.situation.offense;
    expect(slots.slice(0, 11).every((s) => s.side === off)).toBe(true);
    expect(slots.slice(11).every((s) => s.side !== off)).toBe(true);
    const first = slots[0]!;
    expect(first.jersey).toBe(input.teams[off as 0 | 1].players.find((p) => p.playerId === first.personId)!.jersey);
  });

  it('the queue turns a game\'s events into live plays once each, in order, carrying a review', () => {
    const asked2: string[] = [];
    const tap2 = liveTap(withTrajectory(base.resolver, asked2));
    const game = flow.simulateGame(input, { ...base, resolver: tap2.resolver });
    const q = new LivePlayQueue({ tap: tap2, teams: input.teams, ticksPerSecond: TICKS_PER_SECOND, environment: () => input.environment, userSide: 0, rules: g.rules, keep: 1000 });
    const r5 = game.records[4]!;
    const events = game.records.slice(0, 10).flatMap((record) => (record === r5
      ? [{ type: 'review_resolved', request: { source: 'booth', side: null, aspects: [] }, reversed: true, record }, { type: 'play_resolved', record }]
      : [{ type: 'play_resolved', record }])) as unknown as Parameters<LivePlayQueue['take']>[0];
    const first = q.take(events.slice(0, 4));
    const rest = q.take(events);
    expect([...first, ...rest].map((p) => p.playNumber)).toEqual(game.records.slice(0, 10).map((r) => r.index));
    expect(q.take(events)).toEqual([]);
    const reviewed = [...first, ...rest].find((p) => p.playNumber === r5.index)!;
    expect(reviewed.feed.cues.some((c) => c.kind === 'ruling' && (c.ruling === 'review_reversed'))).toBe(true);
  });

  it('holds the console for as long as the play runs on screen', () => {
    const ms = liveMsFrom(tap, TICKS_PER_SECOND);
    const last = tapped.records[tapped.records.length - 1]!;
    expect(ms(last)).toBe(Math.round((2 / TICKS_PER_SECOND) * 1000));
    expect(ms(null)).toBe(0);
  });
});
