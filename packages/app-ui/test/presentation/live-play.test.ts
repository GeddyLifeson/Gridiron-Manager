// Live play on the game screen: each play reaches the sound stage once, with its snap on the moment
// the field view's playback reaches tick 0, at real or double speed.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { realGame } from '@gm/headless';
import { TICKS_PER_SECOND } from '@gm/schema';
import { FakeAudioContext } from '../../src/audio/engine/index.ts';
import { SoundStage, settingsGetter } from '../../src/audio/stage/index.ts';
import { LivePlay, contactsOf, handOver, tick0At, type LivePlayLike } from '../../src/presentation/live/index.ts';
import { presentationLive } from '@gm/app-services';

const { livePlay } = presentationLive;

/** Trajectory format 1 (engine-core recorder layout), all players still: enough for timing tests. */
function encodeV1(firstTick: number, officials: number, ticks: readonly { players: { x: number; y: number }[]; ball: { kind: number; x: number; y: number; height: number; carrier: number } }[]) {
  const out: number[] = [officials];
  const put = (d: number) => { let v = d < 0 ? -2 * d - 1 : 2 * d; while (v >= 128) { out.push((v % 128) + 128); v = Math.floor(v / 128); } out.push(v); };
  const lx = new Array(22).fill(0), ly = new Array(22).fill(0);
  let bx = 0, by = 0, bh = 0;
  for (const t of ticks) {
    t.players.forEach((p, s) => {
      const x = Math.round(p.x * 100), y = Math.round(p.y * 100);
      put(x - lx[s]); put(y - ly[s]); put(0); put(0); lx[s] = x; ly[s] = y;
      out.push(0, 128); // move mode, no contest (-128)
    });
    out.push(t.ball.kind);
    const x = Math.round(t.ball.x * 100), y = Math.round(t.ball.y * 100), h = Math.round(t.ball.height * 100);
    put(x - bx); put(y - by); put(h - bh); bx = x; by = y; bh = h;
    out.push(t.ball.carrier);
  }
  return { formatVersion: 1, firstTick, tickCount: ticks.length, buffer: Uint8Array.from(out) };
}

const g = realGame.createRealGame('pro_2026');
const input = g.input(0, '00000000000a11ce');
const game = g.simulate(input);

/** Stand-in trajectory from 2 s before the snap (real tick-engine film has the same shape). */
function trajectory(x: number, y: number) {
  const players = Array.from({ length: 22 }, (_, s) => ({ x: x + (s < 11 ? -1 : 1), y: y + (s % 11) - 5, }));
  const frame = { players, ball: { kind: 0, x, y, height: 1, carrier: 2 } };
  return encodeV1(-20, 0, Array.from({ length: 80 }, () => frame));
}

function play(i: number): LivePlayLike {
  const record = game.records[i]!;
  return livePlay({ record, trajectory: trajectory(record.situation.ballX, record.situation.ballY), teams: input.teams, ticksPerSecond: TICKS_PER_SECOND, environment: input.environment, userSide: 0, rules: g.rules }) as unknown as LivePlayLike;
}

function stage() {
  const ac = new FakeAudioContext();
  const s = new SoundStage({ ctx: ac, settings: settingsGetter({ 'audio.masterOn': true, 'accessibility.captions': 'on' }) });
  s.setPlace({ hub: 'game', inGame: true, offseason: false });
  return { ac, s };
}

describe('hand-over to the sound stage', () => {
  it('places tick 0 after the pre-snap film, at real and double speed', () => {
    expect(tick0At(10, -20, 10)).toBe(12);
    expect(tick0At(10, -20, 10, 2)).toBe(11);
    expect(tick0At(10, 0, 10)).toBe(10);
  });

  it('plays the snap on the moment playback reaches tick 0', () => {
    const { ac, s } = stage();
    ac.currentTime = 5;
    const p = play(3);
    const report = handOver(s, p);
    expect(report.bed.action).toBe('set');
    const field = [];
    while (ac.currentTime < 20) { ac.currentTime = Math.round((ac.currentTime + 0.05) * 100) / 100; field.push(...s.frame().field); }
    expect(p.feed.cues.some((c) => c.kind === 'snap')).toBe(true);
    expect(p.feed.cues.some((c) => c.kind === 'whistle')).toBe(true);
    const snap = field.find((e) => e.kind === 'snap');
    if (p.feed.cues.some((c) => c.kind === 'snap')) expect(snap?.at).toBeCloseTo(7, 6);
    const whistle = p.feed.cues.find((c) => c.kind === 'whistle');
    if (whistle) expect(field.find((e) => e.kind === 'whistle')?.at).toBeCloseTo(7 + whistle.tick / TICKS_PER_SECOND, 6);
  });

  it('at double speed every cue lands at half the time', () => {
    const { ac, s } = stage();
    const p = play(3);
    handOver(s, p, 2);
    const field = [];
    while (ac.currentTime < 15) { ac.currentTime = Math.round((ac.currentTime + 0.05) * 100) / 100; field.push(...s.frame().field); }
    const whistle = p.feed.cues.find((c) => c.kind === 'whistle');
    if (whistle) expect(field.find((e) => e.kind === 'whistle')?.at).toBeCloseTo(1 + whistle.tick / TICKS_PER_SECOND / 2, 6);
  });

  it('every play of a real game hands over without a refused feed and with a crowd level', () => {
    const { ac, s } = stage();
    for (let i = 0; i < game.records.length; i++) {
      const r = handOver(s, play(i));
      expect(r.bed.action).toBe('set');
      ac.currentTime += 8;
      s.frame();
    }
  });
});

describe('the live play view', () => {
  it('shows the waiting line before the first play', () => {
    expect(renderToStaticMarkup(createElement(LivePlay, { play: null, stage: null, waiting: 'Waiting for the kickoff', geometry: g.deps(input).geometry, userSide: 0, home: { primary: '#123456', alternate: '#ffffff' }, away: { primary: '#654321', alternate: '#000000' } } as never))).toContain('Waiting for the kickoff');
  });

  it('passes contact tiers to the field only when the engine sent them', () => {
    const p = play(3);
    expect(p.feed.missing).toContain('contactTier');
    expect(contactsOf(p.feed)).toBeUndefined();
    const withContact = { ...p.feed, missing: [], cues: [{ kind: 'contact', seq: 0, tick: 4, x: 30, y: 20, tier: 3, slots: [1, 12] }] } as unknown as LivePlayLike['feed'];
    expect(contactsOf(withContact)).toEqual([{ kind: 'contact', tick: 4, x: 30, y: 20, tier: 3, slots: [1, 12] }]);
  });
});
