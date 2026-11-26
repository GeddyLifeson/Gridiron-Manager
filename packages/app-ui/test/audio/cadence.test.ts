// PV-09 cadence and call relay audio: tones on the engine's ticks, a silent count is silent, hard counts
// are heard, a garbled relay plays the broken tone, and road-noise masking comes from the mix only.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AudioEngine, FakeAudioContext, type EngineOptions, type FakeSource } from '../../src/audio/engine/index.ts';
import { RECIPE_BY_ID, toSoundDefs } from '../../src/audio/recipes/index.ts';
import { CadenceDriver, linearTickClock, planCadence, type CadenceFeedLike } from '../../src/audio/cadence/index.ts';

const TPS = 20;

function feed(cues: CadenceFeedLike['cues'], over: Partial<CadenceFeedLike> = {}): CadenceFeedLike {
  return { formatVersion: 1, visibility: 'user-visible', playId: '7:12', ticksPerSecond: TPS, perspective: { homeSide: 0, userSide: 0 }, cues, missing: [], ...over };
}

/** A typical pre-snap: the user's relay, then the count (two voiced calls, a hard count, the snap). */
const PRESNAP: CadenceFeedLike['cues'] = [
  { kind: 'relay', seq: 0, tick: -400, side: 0, outcome: 'clean' },
  { kind: 'cadence', seq: 1, tick: -40, side: 0, count: 'voiced' },
  { kind: 'cadence', seq: 2, tick: -30, side: 0, count: 'voiced' },
  { kind: 'cadence', seq: 3, tick: -20, side: 0, count: 'hard' },
  { kind: 'snap', seq: 4, tick: 0 },
];

function rig(settings: EngineOptions['settings'] = {}) {
  const ac = new FakeAudioContext();
  const engine = new AudioEngine(ac, { sounds: toSoundDefs(), settings });
  return { ac, engine };
}

/** Start times of every oscillator or noise source that feeds the cadence bus. */
const starts = (ac: FakeAudioContext): number[] => [...new Set(ac.sources().map((s) => s.startAt!))].sort((a, b) => a - b);

describe('planCadence', () => {
  it('maps counts and relays to the PV-07 recipes and the PV-02 captions', () => {
    const plan = planCadence(feed([...PRESNAP, { kind: 'cadence', seq: 5, tick: -10, side: 0, count: 'silent' }, { kind: 'relay', seq: 6, tick: -300, side: 0, outcome: 'garbled' }]));
    expect(plan.map((p) => [p.seq, p.soundId, p.caption])).toEqual([
      [0, 'cadence.relay.clean', 'call received'],
      [1, 'cadence.voiced', 'count'],
      [2, 'cadence.voiced', 'count'],
      [3, 'cadence.hard', 'hard count'],
      [5, null, 'silent count'],
      [6, 'cadence.relay.garbled', 'call garbled'],
    ]);
    expect(plan.find((p) => p.seq === 5)!.silentReason).toBe('silent-count');
  });

  it("plays only the user's own relay; the other sideline's relay and a spectator's are not heard", () => {
    const cues: CadenceFeedLike['cues'] = [{ kind: 'relay', seq: 0, tick: -300, side: 0, outcome: 'clean' }, { kind: 'relay', seq: 1, tick: -300, side: 1, outcome: 'garbled' }];
    expect(planCadence(feed(cues)).map((p) => p.soundId)).toEqual(['cadence.relay.clean', null]);
    expect(planCadence(feed(cues)).map((p) => p.silentReason)).toEqual([undefined, 'not-users-relay']);
    expect(planCadence(feed(cues, { perspective: { homeSide: 0, userSide: 1 } })).map((p) => p.soundId)).toEqual([null, 'cadence.relay.garbled']);
    expect(planCadence(feed(cues, { perspective: { homeSide: 0, userSide: null } })).map((p) => p.soundId)).toEqual([null, null]);
  });

  it("hears both offenses' counts (they are on the field), whoever the user is", () => {
    const cues: CadenceFeedLike['cues'] = [{ kind: 'cadence', seq: 0, tick: -20, side: 1, count: 'hard' }];
    expect(planCadence(feed(cues)).map((p) => p.soundId)).toEqual(['cadence.hard']);
    expect(planCadence(feed(cues, { perspective: { homeSide: 0, userSide: null } })).map((p) => p.soundId)).toEqual(['cadence.hard']);
  });

  it('refuses a feed version it does not know, and a feed that is not user-visible', () => {
    expect(() => planCadence(feed(PRESNAP, { formatVersion: 2 }))).toThrow(/format/);
    expect(() => planCadence({ ...feed(PRESNAP), visibility: 'truth' as 'user-visible' })).toThrow(/user-visible/);
  });
});

describe('CadenceDriver on the PV-06 engine', () => {
  it('starts each tone on the audio time of its engine tick', () => {
    const { ac, engine } = rig();
    const driver = new CadenceDriver({ engine });
    const clock = linearTickClock(30, TPS);
    const events = driver.update(feed(PRESNAP), clock, 100);
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2, 3]);
    expect(events.map((e) => e.at)).toEqual([10, 28, 28.5, 29]);
    for (const e of events) expect(e.outcome).toMatchObject({ played: true, source: 'synth', startsAt: e.at });
    expect(starts(ac)).toEqual([10, 10.13, 28, 28.5, 29]); // the clean relay's second tone sits 0.13 s in, by recipe
  });

  it('a silent count makes no sound at all, but is reported with its caption', () => {
    const { ac, engine } = rig();
    const driver = new CadenceDriver({ engine });
    const events = driver.update(feed([{ kind: 'cadence', seq: 0, tick: -10, side: 0, count: 'silent' }]), linearTickClock(5, TPS), 5);
    expect(events).toHaveLength(1);
    expect(events[0]!.outcome).toEqual({ played: false, reason: 'silent-count' });
    expect(events[0]!.caption).toBe('silent count');
    expect(ac.sources()).toHaveLength(0);
  });

  it('a hard count is heard right after a voiced call, and louder', () => {
    const { ac, engine } = rig();
    const driver = new CadenceDriver({ engine });
    const cues: CadenceFeedLike['cues'] = [
      { kind: 'cadence', seq: 0, tick: -6, side: 0, count: 'voiced' },
      { kind: 'cadence', seq: 1, tick: -3, side: 0, count: 'hard' }, // 0.15 s later
    ];
    const events = driver.update(feed(cues), linearTickClock(1, TPS), 1);
    expect(events.map((e) => e.outcome.played)).toEqual([true, true]);
    const peak = (from: number) => Math.max(...ac.sources().filter((s) => s.startAt === from).map((s) => ac.pathGain(s, from + 0.05)));
    expect(peak(events[1]!.at)).toBeGreaterThan(peak(events[0]!.at));
  });

  it('a garbled relay plays the broken tone, a clean one the clean tone', () => {
    const { ac, engine } = rig();
    const driver = new CadenceDriver({ engine });
    driver.update(feed([{ kind: 'relay', seq: 0, tick: -300, side: 0, outcome: 'garbled' }], { playId: 'g:1' }), linearTickClock(20, TPS), 20);
    const garbled = ac.sources().length;
    expect(garbled).toBe(RECIPE_BY_ID.get('cadence.relay.garbled')!.recipe.layers.length);
    driver.update(feed([{ kind: 'relay', seq: 0, tick: -300, side: 0, outcome: 'clean' }], { playId: 'g:2' }), linearTickClock(40, TPS), 40);
    expect(ac.sources().length - garbled).toBe(RECIPE_BY_ID.get('cadence.relay.clean')!.recipe.layers.length);
    expect(ac.sources().some((s) => s.kind === 'bufferSource')).toBe(true); // the hiss in the garbled tone
  });

  it('handles each cue once, schedules only inside the look-ahead, and replans on a new play', () => {
    const { engine } = rig();
    const driver = new CadenceDriver({ engine, lookaheadSeconds: 0.2 });
    const clock = linearTickClock(30, TPS); // cues due at 10, 28, 28.5, 29
    expect(driver.update(feed(PRESNAP), clock, 9).map((e) => e.seq)).toEqual([]);
    expect(driver.update(feed(PRESNAP), clock, 9.85).map((e) => e.seq)).toEqual([0]);
    expect(driver.update(feed(PRESNAP), clock, 9.9).map((e) => e.seq)).toEqual([]);
    expect(driver.update(feed(PRESNAP), clock, 28.4).map((e) => e.seq)).toEqual([1, 2]);
    expect(driver.update(feed(PRESNAP), clock, 40).map((e) => e.seq)).toEqual([3]);
    expect(driver.update(feed(PRESNAP), clock, 41)).toEqual([]);
    expect(driver.update(feed(PRESNAP, { playId: '7:13' }), linearTickClock(60, TPS), 60).map((e) => e.seq)).toEqual([0, 1, 2, 3]);
  });

  it('a cue that comes due too late is dropped by the engine, never played late', () => {
    const { ac, engine } = rig();
    ac.advance(29.1);
    const driver = new CadenceDriver({ engine });
    const events = driver.update(feed(PRESNAP), linearTickClock(30, TPS), 29.1);
    expect(events.map((e) => [e.seq, e.outcome.played ? 'played' : e.outcome.reason])).toEqual([[0, 'late'], [1, 'late'], [2, 'late'], [3, 'played']]);
    expect(Math.min(...ac.sources().map((s) => s.startAt!))).toBeGreaterThanOrEqual(29.1);
  });

  it('with the cadence bus off nothing is built', () => {
    const { ac, engine } = rig({ cadence: { volumePct: 100, on: false } });
    const events = new CadenceDriver({ engine }).update(feed(PRESNAP), linearTickClock(30, TPS), 100);
    expect(events.every((e) => !e.outcome.played && e.outcome.reason === 'bus-off')).toBe(true);
    expect(ac.sources()).toHaveLength(0);
  });

  it('pitch variants come from the injected cosmetic.audio draw, one per audible cue, so a replay sounds the same', () => {
    const run = () => {
      const { ac, engine } = rig();
      const seq = [0.1, 0.7, 0.4, 0.95, 0.2];
      let i = 0;
      const draws: number[] = [];
      const driver = new CadenceDriver({ engine, draw: () => { const v = seq[i++ % seq.length]!; draws.push(v); return v; } });
      driver.update(feed([...PRESNAP, { kind: 'cadence', seq: 5, tick: -10, side: 0, count: 'silent' }]), linearTickClock(30, TPS), 100);
      const detunes = ac.sources().filter((s): s is FakeSource & { detune: { valueAt(t: number): number } } => 'detune' in s).map((s) => s.detune.valueAt(s.startAt!));
      return { draws, detunes };
    };
    const a = run();
    expect(a.draws).toEqual([0.1, 0.7, 0.4, 0.95]); // relay + three counts; the silent count draws nothing
    expect(run()).toEqual(a);
  });

  it('reports missing feed sources it reads instead of guessing', () => {
    const { engine } = rig();
    const driver = new CadenceDriver({ engine });
    const f = feed([], { missing: ['noise', 'cadence', 'relay'] });
    expect(driver.missing(f)).toEqual(['cadence', 'relay']);
    expect(driver.update(f, linearTickClock(0, TPS), 10)).toEqual([]);
  });
});

describe('road noise masks the count through the mix, not by a rule', () => {
  it('the count is scheduled at the same level whatever the crowd; only the crowd bed changes', () => {
    const levels = [0.1, 0.95].map((noise) => {
      const { ac, engine } = rig({ crowd: { volumePct: 100, on: true } });
      const bed = RECIPE_BY_ID.get('crowd.bed')!;
      engine.startBed('crowd', { bus: 'crowd', recipe: bed.recipe }, noise, 0.01);
      const before = new Set(ac.sources());
      const [e] = new CadenceDriver({ engine }).update(feed([{ kind: 'cadence', seq: 0, tick: -10, side: 1, count: 'voiced' }]), linearTickClock(5, TPS), 5);
      const count = ac.sources().filter((s) => !before.has(s));
      const bedSrc = [...before];
      return { count: Math.max(...count.map((s) => ac.pathGain(s, e!.at + 0.05))), bed: Math.max(...bedSrc.map((s) => ac.pathGain(s, e!.at + 0.05))) };
    });
    expect(levels[1]!.count).toBeCloseTo(levels[0]!.count, 9);
    expect(levels[1]!.bed).toBeGreaterThan(levels[0]!.bed * 5);
  });

  it('the driver source never reads noise or crowd state', () => {
    const src = readFileSync(new URL('../../src/audio/cadence/cadence.ts', import.meta.url), 'utf8');
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/**')).join('\n');
    expect(code).not.toMatch(/noise|conditions|crowd/i);
  });
});
