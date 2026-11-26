// PV-08 crowd driver tests (plans/presentation-build-plan.md section 8 acceptance): the bed level
// tracks `noise` over a recorded real game, reactions follow ruling events only, the home and road
// perspective is right, and there is one reaction per play.
//
// `recorded-game.json` is a real pro game from the headless engine, built into PV-00 feeds by the
// app-services adapter with the engine's own J12.6.1 noise (scripts/audio/record-crowd-game.ts).
// Hand-made feeds below are test data only: no number in them is a real-world claim.
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { AudioEngine, FakeAudioContext, type EngineOptions, type FakeSource } from '../../../src/audio/engine/index.ts';
import { toSoundDefs } from '../../../src/audio/recipes/index.ts';
import {
  BIG_GAIN_YARDS, CROWD_FEED_FORMAT, CrowdDriver, isRuling, pickReaction, reactionCandidates,
  type CrowdCue, type CrowdFeed, type CrowdRulingKind, type CrowdSide,
} from '../../../src/audio/crowd/index.ts';
import RECORDED from './recorded-game.json' with { type: 'json' };

const RULINGS: readonly CrowdRulingKind[] = ['touchdown', 'field_goal_good', 'field_goal_missed', 'safety', 'try_good', 'try_failed',
  'interception', 'fumble_lost', 'turnover_on_downs', 'sack', 'incomplete', 'first_down', 'touchback', 'penalty', 'review_upheld', 'review_reversed'];

/** Checks the recorded JSON against the driver's input shape at run time (JSON imports are loosely typed). */
function asFeeds(raw: unknown): CrowdFeed[] {
  const plays = (raw as { plays: unknown[] }).plays;
  return plays.map((p) => {
    const f = p as CrowdFeed;
    expect(f.formatVersion).toBe(CROWD_FEED_FORMAT);
    expect(typeof f.playId).toBe('string');
    expect(f.ticksPerSecond).toBeGreaterThan(0);
    expect([0, 1]).toContain(f.perspective.homeSide);
    expect(f.conditions.noise === null || (f.conditions.noise >= 0 && f.conditions.noise <= 1)).toBe(true);
    for (const c of f.cues) {
      expect(Number.isInteger(c.tick)).toBe(true);
      if (isRuling(c)) { expect(RULINGS).toContain(c.ruling); expect([0, 1, null]).toContain(c.favours); }
    }
    return f;
  });
}

const GAME = asFeeds(RECORDED);

function setup(settings?: EngineOptions['settings']) {
  const ctx = new FakeAudioContext();
  const engine = new AudioEngine(ctx, { sounds: toSoundDefs(), ...(settings ? { settings } : {}) });
  const driver = new CrowdDriver(engine);
  return { ctx, engine, driver };
}

let seqN = 0;
const ruling = (tick: number, r: CrowdRulingKind, favours: CrowdSide | null): CrowdCue => ({ kind: 'ruling', seq: seqN++, tick, ruling: r, favours });
const cam = (tick: number, kind: string, x: number): CrowdCue => ({ kind, seq: seqN++, tick, x });

function feed(o: { cues?: CrowdCue[]; noise?: number | null; yards?: number; noPlay?: boolean; userSide?: CrowdSide | null; playId?: string } = {}): CrowdFeed {
  return {
    formatVersion: 1, playId: o.playId ?? '9:1', ticksPerSecond: 10,
    perspective: { homeSide: 0, userSide: o.userSide === undefined ? 0 : o.userSide },
    conditions: { noise: o.noise === undefined ? 0.6 : o.noise },
    result: { yardsGained: o.yards ?? 4, noPlay: o.noPlay ?? false },
    cues: o.cues ?? [cam(0, 'snap', 40), cam(40, 'tackle', 44), cam(41, 'whistle', 44)],
    missing: [],
  };
}

const pearson = (a: number[], b: number[]): number => {
  const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { sab += (a[i]! - ma) * (b[i]! - mb); saa += (a[i]! - ma) ** 2; sbb += (b[i]! - mb) ** 2; }
  return sab / Math.sqrt(saa * sbb);
};

/** Replays the recorded game: 30 s between plays, each play handed over 2 s before its tick 0. */
function replay(games: CrowdFeed[], settings?: Parameters<typeof setup>[0]) {
  const { ctx, engine, driver } = setup(settings);
  driver.startGame();
  const bedSources = ctx.sources().slice() as FakeSource[];
  const rows = games.map((f) => {
    ctx.advance(30);
    const tick0At = ctx.currentTime + 2;
    const before = new Set(ctx.sources());
    const report = driver.play(f, { tick0At });
    const lastAt = tick0At + (f.cues.length ? f.cues[f.cues.length - 1]!.tick : 0) / f.ticksPerSecond;
    const firstAt = Math.min(tick0At, tick0At + (f.cues.length ? f.cues[0]!.tick : 0) / f.ticksPerSecond);
    const gain = (t: number) => (bedSources.length ? ctx.pathGain(bedSources[0]!, t) : 0);
    const newSources = ctx.sources().filter((s) => !before.has(s));
    return { f, report, tick0At, firstAt, atFirst: gain(firstAt), atSnap: gain(tick0At), atEnd: gain(lastAt), newSources };
  });
  return { ctx, engine, driver, rows, bedSources };
}

describe('recorded game fixture', () => {
  it('comes from the recorder script and a real engine game with noise on every play', () => {
    expect(existsSync('../../scripts/audio/record-crowd-game.ts') || existsSync('scripts/audio/record-crowd-game.ts')).toBe(true);
    expect(RECORDED.source.ruleSetId).toBe('pro_2026');
    expect(GAME.length).toBeGreaterThan(100);
    expect(GAME.every((f) => f.conditions.noise !== null && !f.missing.includes('noise'))).toBe(true);
    // The situation terms of J12.6.1 make the level move during the game: several distinct values.
    expect(new Set(GAME.map((f) => f.conditions.noise)).size).toBeGreaterThanOrEqual(3);
  });
});

describe('bed level tracks noise (MB-6)', () => {
  it('correlates with noise over the recorded game at the snap of every play', () => {
    const { rows, bedSources } = replay(GAME);
    expect(bedSources.length).toBeGreaterThan(0);
    const noise = rows.map((r) => r.f.conditions.noise!);
    const atSnap = rows.map((r) => r.atSnap);
    expect(pearson(noise, atSnap)).toBeGreaterThan(0.999);
    // Same scale throughout: the bed's audible gain is noise times one fixed recipe gain.
    const k = atSnap.find((g, i) => noise[i]! > 0)! / noise[atSnap.findIndex((g, i) => noise[i]! > 0)]!;
    for (const r of rows) expect(r.atSnap).toBeCloseTo(r.f.conditions.noise! * k, 6);
  });

  it('eases only between plays: the level is reached by the first cue and holds through the play', () => {
    const { rows } = replay(GAME);
    for (const r of rows) {
      expect(r.report.bed.action).toBe('set');
      if (r.report.bed.action === 'set') expect(r.report.bed.rampEndsAt).toBeLessThanOrEqual(r.firstAt + 1e-9);
      expect(r.atFirst).toBeCloseTo(r.atSnap, 9);
      expect(r.atEnd).toBeCloseTo(r.atSnap, 9);
    }
  });

  it('rises for the visitor on third down in a close game and falls when the home offense has the ball', () => {
    const { rows } = replay(GAME);
    const why = (RECORDED.plays as { why: { down: number | null; offense: number; homeMargin: number } }[]).map((p) => p.why);
    const road3rd = rows.filter((r, i) => why[i]!.offense === 1 && (why[i]!.down ?? 0) >= 3 && Math.abs(why[i]!.homeMargin) <= 8);
    const homeBall = rows.filter((r, i) => why[i]!.offense === 0);
    expect(road3rd.length).toBeGreaterThan(5);
    const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
    expect(mean(road3rd.map((r) => r.atSnap))).toBeGreaterThan(2 * mean(homeBall.map((r) => r.atSnap)));
  });

  it('holds the last level when a feed has no noise value, and never uses a guess', () => {
    const { ctx, driver } = setup();
    driver.startGame();
    driver.play(feed({ noise: 0.7 }), { tick0At: 2 });
    ctx.advance(30);
    const r = driver.play(feed({ noise: null, playId: '9:2' }), { tick0At: 32 });
    expect(r.bed).toEqual({ action: 'held', level: 0.7 });
    expect(driver.bedLevel).toBe(0.7);
  });

  it('starts silent before any noise value', () => {
    const { ctx, driver } = setup();
    driver.startGame();
    const bed = ctx.sources()[0]!;
    ctx.advance(5);
    expect(ctx.pathGain(bed, 5)).toBe(0);
    expect(driver.play(feed({ noise: null }), { tick0At: 7 }).bed).toEqual({ action: 'held', level: 0 });
  });

  it('refuses a feed format it does not know', () => {
    const { driver } = setup();
    const r = driver.play({ ...feed(), formatVersion: 2 }, { tick0At: 1 });
    expect(r).toEqual({ playId: '9:1', bed: { action: 'refused' }, reaction: null });
  });

  it('is silent with the crowd bus off, and comes back at the current level when it turns on', () => {
    const { ctx, engine, driver } = setup({ crowd: { volumePct: 100, on: false } });
    driver.startGame();
    const r = driver.play(feed({ noise: 0.8, cues: [cam(0, 'snap', 40), ruling(30, 'touchdown', 0)] }), { tick0At: 2 });
    expect(ctx.sources()).toHaveLength(0);
    expect(r.reaction?.outcome).toEqual({ played: false, reason: 'bus-off' });
    engine.setBus('crowd', { volumePct: 100, on: true });
    ctx.advance(10);
    expect(ctx.audibleAt(10).length).toBeGreaterThan(0);
  });
});

describe('reactions follow ruling events only (B11, MB-7)', () => {
  it('a play with no ruling cue gets no reaction, however far it went', () => {
    const f = feed({ yards: 60, cues: [cam(0, 'snap', 20), cam(80, 'tackle', 80), cam(81, 'whistle', 80)] });
    expect(reactionCandidates(f)).toEqual([]);
    expect(pickReaction(f)).toBeNull();
  });

  it('every reaction in the recorded game starts on the tick of a ruling cue in its own feed', () => {
    const { rows } = replay(GAME);
    let played = 0;
    for (const r of rows) {
      const rx = r.report.reaction;
      if (!rx) continue;
      expect(r.f.cues).toContain(rx.pick.cue);
      expect(rx.at).toBeCloseTo(r.tick0At + rx.pick.cue.tick / r.f.ticksPerSecond, 9);
      if (rx.outcome?.played) { played++; expect(rx.outcome.startsAt).toBeCloseTo(rx.at, 9); }
    }
    expect(played).toBeGreaterThan(5);
  });

  it('a big gain needs a first-down ruling for home and the yards; a no-play gets none', () => {
    const fd = [cam(0, 'snap', 30), ruling(50, 'first_down', 0)];
    expect(pickReaction(feed({ cues: fd, yards: BIG_GAIN_YARDS }))?.kind).toBe('bigGain');
    expect(pickReaction(feed({ cues: fd, yards: BIG_GAIN_YARDS - 0.5 }))).toBeNull();
    expect(pickReaction(feed({ cues: fd, yards: 40, noPlay: true }))).toBeNull();
  });

  it('pans by the last camera position at or before the ruling (MB-8)', () => {
    const p = pickReaction(feed({ cues: [cam(0, 'snap', 30), cam(60, 'tackle', 72), ruling(61, 'sack', 0), cam(70, 'outOfBounds', 10)] }));
    expect(p?.fieldX).toBe(72);
  });
});

describe('home and road perspective', () => {
  const td = (favours: CrowdSide) => [cam(0, 'snap', 70), ruling(55, 'touchdown', favours)];
  it('the home crowd cheers a home touchdown and is quiet for a road one', () => {
    expect(pickReaction(feed({ cues: td(0) }))?.kind).toBe('touchdown');
    expect(pickReaction(feed({ cues: td(1) }))).toBeNull();
  });

  it('the user side never changes what the crowd does', () => {
    for (const cues of [td(0), td(1), [ruling(10, 'penalty', 1)], [ruling(10, 'interception', 0)]]) {
      const a = pickReaction(feed({ cues, userSide: 0 })), b = pickReaction(feed({ cues, userSide: 1 })), c = pickReaction(feed({ cues, userSide: null }));
      expect(b?.kind).toBe(a?.kind);
      expect(c?.kind).toBe(a?.kind);
    }
  });

  it('a flag against home draws disapproval; a flag against the road side or offsetting fouls draw nothing', () => {
    expect(pickReaction(feed({ cues: [ruling(10, 'penalty', 1)] }))?.kind).toBe('flagAgainstHome');
    expect(pickReaction(feed({ cues: [ruling(10, 'penalty', 0)] }))).toBeNull();
    expect(pickReaction(feed({ cues: [ruling(10, 'penalty', null)] }))).toBeNull();
  });

  it('turnovers, sacks and review reversals cheer only when good for home', () => {
    for (const [r, kind] of [['interception', 'turnover'], ['fumble_lost', 'turnover'], ['turnover_on_downs', 'turnover'], ['safety', 'turnover'], ['sack', 'sack'], ['review_reversed', 'reviewReversal']] as const) {
      expect(pickReaction(feed({ cues: [ruling(20, r, 0)] }))?.kind).toBe(kind);
      expect(pickReaction(feed({ cues: [ruling(20, r, 1)] }))).toBeNull();
    }
  });

  it('the recorded game: no cheer for a ruling good for the road side', () => {
    const { rows } = replay(GAME);
    for (const r of rows) {
      const rx = r.report.reaction;
      if (!rx) continue;
      if (rx.pick.kind === 'flagAgainstHome') expect(rx.pick.cue.favours).toBe(1);
      else expect(rx.pick.cue.favours).toBe(0);
    }
  });
});

describe('one reaction per play', () => {
  it('picks the highest-ranked reaction of the play and sounds only that one', () => {
    const { ctx, driver } = setup();
    driver.startGame();
    const f = feed({ yards: 45, cues: [cam(0, 'snap', 30), ruling(40, 'first_down', 0), ruling(70, 'touchdown', 0), ruling(71, 'penalty', 1)] });
    const before = ctx.sources().length;
    const r = driver.play(f, { tick0At: 2 });
    expect(r.reaction?.pick.kind).toBe('touchdown');
    expect(r.reaction?.decision).toBe('play');
    const started = ctx.sources().slice(before);
    expect(new Set(started.map((s) => s.startAt))).toEqual(new Set([2 + 7]));
  });

  it('the recorded game: at most one reaction sound per play', () => {
    const { rows } = replay(GAME);
    for (const r of rows) {
      const starts = new Set(r.newSources.map((s) => s.startAt));
      expect(starts.size).toBeLessThanOrEqual(1);
      if (r.report.reaction?.outcome?.played) expect(starts.size).toBe(1);
      else expect(starts.size).toBe(0);
    }
  });

  it('a later play whose reaction is lower than one still sounding waits, then plays when it ends', () => {
    const { ctx, driver } = setup();
    driver.startGame();
    const first = driver.play(feed({ playId: '9:1', cues: [ruling(0, 'touchdown', 0)] }), { tick0At: 1 });
    expect(first.reaction?.decision).toBe('play');
    const ends = first.reaction?.outcome?.played ? first.reaction.outcome.endsAt : 0;
    const second = driver.play(feed({ playId: '9:2', cues: [ruling(0, 'sack', 0)] }), { tick0At: 2 });
    expect(second.reaction?.decision).toBe('wait');
    ctx.advance(ends - ctx.currentTime + 0.01);
    expect(driver.pump(ctx.currentTime)).toBeNull(); // waited longer than 2 s: the moment passed (RankedQueue)
    // A short wait does play.
    const { ctx: c2, driver: d2 } = setup();
    d2.startGame();
    const a = d2.play(feed({ playId: '9:1', cues: [ruling(0, 'sack', 0)] }), { tick0At: 1 });
    const aEnd = a.reaction?.outcome?.played ? a.reaction.outcome.endsAt : 0;
    const b = d2.play(feed({ playId: '9:2', cues: [ruling(0, 'penalty', 1)] }), { tick0At: aEnd - 0.5 });
    expect(b.reaction?.decision).toBe('wait');
    c2.advance(aEnd - c2.currentTime + 0.01);
    const out = d2.pump(c2.currentTime);
    expect(out?.played).toBe(true);
  });
});

describe('cosmetic variety', () => {
  it('takes one draw per reaction from the play stream; same draws give the same sound', () => {
    const run = (draw: number) => {
      const { ctx, driver } = setup();
      driver.startGame();
      let calls = 0;
      driver.play(feed({ cues: [ruling(10, 'touchdown', 0)] }), { tick0At: 1, audioDraw: () => { calls++; return draw; } });
      // Noise layers shift pitch by playback rate (engine synth.ts); record each source's rate events.
      const detune = ctx.sources().slice(1).map((s) => JSON.stringify((s as unknown as { playbackRate?: { events: unknown[] } }).playbackRate?.events ?? []));
      return { calls, detune };
    };
    const a = run(0.1), b = run(0.1), c = run(0.95);
    expect(a.calls).toBe(1);
    expect(a.detune).toEqual(b.detune);
    expect(a.detune).not.toEqual(c.detune);
  });
});
