import { describe, expect, it } from 'vitest';
import { decodeTrajectory, Playback, ReplayAllowance, PlaybackRuleError, stills, buildCues, activeCues, cueDisplaySeconds, CUE_FOR, type Cue } from '../../src/field-view/index.ts';
import { fixturePlay } from './fixtures.ts';

const FPS = 60;

describe('playback timing (I9.1.2, O2.3.4)', () => {
  const play = fixturePlay();
  const f = decodeTrajectory(play.trajectory);

  it('ends within one frame of trajectory length divided by speed, at each speed', () => {
    for (const [mode, speed] of [['live', 1], ['live', 2], ['film', 0.5], ['film', 1], ['film', 2]] as const) {
      const pb = new Playback(f, play.ticksPerSecond, mode, speed);
      let frames = 0, finished = 0;
      pb.onFinished(() => finished++);
      while (!pb.finished && frames < 100000) { pb.advance(1 / FPS); frames++; }
      const expected = f.tickCount / play.ticksPerSecond / speed;
      expect(Math.abs(frames / FPS - expected), `${mode} ${speed}`).toBeLessThanOrEqual(1 / FPS + 1e-9);
      expect(finished).toBe(1);
    }
  });

  it('offers only real time and double speed in a game, and no pause, step or scrub', () => {
    const pb = new Playback(f, 10, 'live');
    expect(() => pb.setSpeed(0.5)).toThrow(PlaybackRuleError);
    expect(() => pb.pause()).toThrow(/film and practice/);
    expect(() => pb.step(1)).toThrow(PlaybackRuleError);
    expect(() => pb.seek(0)).toThrow(PlaybackRuleError);
    pb.skipToResult();
    expect(pb.finished).toBe(true);
    expect(pb.tick).toBe(f.firstTick + f.tickCount - 1);
  });

  it('steps and scrubs in film', () => {
    const pb = new Playback(f, 10, 'film', 0.5);
    pb.step(1);
    expect(pb.tick).toBe(f.firstTick + 1);
    expect(pb.playing).toBe(false);
    pb.seek(5); expect(pb.tick).toBe(5);
    pb.seek(9999); expect(pb.tick).toBe(f.firstTick + f.tickCount - 1);
    pb.play(); pb.advance(0.1); expect(pb.tick).toBeGreaterThan(f.firstTick + f.tickCount - 2);
  });
});

describe('the sideline replay (I9.3.1)', () => {
  const play = fixturePlay();
  const f = decodeTrajectory(play.trajectory);
  it('replays the last play once, at real speed only, and no earlier play', () => {
    const r = new ReplayAllowance();
    r.newPlay('p1');
    const rp = r.take('p1', f, 10);
    expect(rp.mode).toBe('replay');
    expect(() => rp.setSpeed(2)).toThrow(PlaybackRuleError);
    rp.stop();
    expect(rp.finished).toBe(true);
    expect(() => r.take('p1', f, 10)).toThrow(/used/);
    r.newPlay('p2');
    expect(r.canReplay('p1')).toBe(false);
    expect(() => r.take('p1', f, 10)).toThrow(/only the last play/);
  });
  it('offers it once more during a review stoppage', () => {
    const r = new ReplayAllowance();
    r.newPlay('p1'); r.take('p1', f, 10);
    r.reviewStoppage('p1');
    expect(r.canReplay('p1')).toBe(true);
  });
});

describe('event cues (I9.1.2, O6.4.1)', () => {
  const play = fixturePlay();
  const cues = buildCues(play.events, play.ticksPerSecond);
  it('makes one cue per drawable event, at its tick and spot, and nothing else', () => {
    const drawable = play.events.filter((e) => CUE_FOR[e.kind]);
    expect(cues.length).toBe(drawable.length);
    for (const c of cues) {
      expect(play.events).toContain(c.event);
      expect(c.fromTick).toBe(c.event.tick);
      expect(c.toTick - c.fromTick).toBeCloseTo(4, 9); // 0.4 s at 10 ticks per second
    }
    const buf: Cue[] = [];
    for (let t = -20; t < 60; t += 0.1) {
      const n = activeCues(cues, t, buf);
      for (let i = 0; i < n; i++) expect(t >= buf[i]!.event.tick && t < buf[i]!.event.tick + 4).toBe(true);
    }
  });
  it('halves every cue on screen at double speed', () => {
    expect(cueDisplaySeconds(2)).toBeCloseTo(cueDisplaySeconds(1) / 2, 12);
  });
});

describe('reduced motion stills (O2.3.4)', () => {
  it('picks the snap, the catch and the whistle', () => {
    const play = fixturePlay();
    const s = stills(decodeTrajectory(play.trajectory), play.events);
    expect(s.map((x) => [x.label, x.tick])).toEqual([['snap', 0], ['decisive', 25], ['whistle', 33]]);
  });
});
