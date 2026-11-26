// PV-06 acceptance: 8 buses, ducking, pan, per-sound rate limiter, ranked queue, synthesized fallback,
// fake audio context, no sound when a bus is off.
import { describe, expect, it } from 'vitest';
import {
  AudioEngine, BUSES, BUS_DEFAULTS, CROWD_REACTION_RANK, DUCK_LEVEL, DUCK_MAX_HOLD, DUCK_RELEASE, Ducker, FakeAudioContext, FakeGain,
  FakeSource, LATE_DROP_SECONDS, MIX_BUSES, PAN_WIDTH, RankedQueue, RateLimiter, busSettingsFrom, createMusicOutput, panFor, recipeSeconds,
  variantCents, type AudioContextLike, type SoundDef, type SoundRecipe,
} from '../../src/audio/engine/index.ts';

const blip: SoundRecipe = { layers: [{ source: { kind: 'osc', wave: 'sine', freq: 880 }, env: { attack: 0.01, hold: 0.1, release: 0.09 } }] };
const thud: SoundRecipe = {
  layers: [
    { source: { kind: 'noise', colour: 'brown' }, env: { attack: 0.005, hold: 0.03, release: 0.12 }, filter: { type: 'lowpass', freq: 400, freqEnd: 120 } },
    { source: { kind: 'osc', wave: 'sine', freq: 90, freqEnd: 45 }, env: { attack: 0.005, hold: 0.02, release: 0.1 }, offset: 0.01 },
  ],
  variantsCents: [-100, 0, 100],
};
const whistle: SoundRecipe = { layers: [{ source: { kind: 'osc', wave: 'sine', freq: 2900, lfo: { rate: 30, depth: 60 } }, env: { attack: 0.02, hold: 0.5, release: 0.08 } }] };
const micTone: SoundRecipe = { layers: [{ source: { kind: 'osc', wave: 'triangle', freq: 660 }, env: { attack: 0.01, hold: 3.5, release: 0.2 } }] };
const crowdBed: SoundRecipe = { layers: [{ source: { kind: 'noise', colour: 'pink' }, env: { attack: 0.3, hold: 1, release: 0.3 }, filter: { type: 'bandpass', freq: 900, q: 0.7 } }] };

const SOUNDS: SoundDef[] = [
  { id: 'ui.confirm', bus: 'ui', recipe: blip, minGapMs: 120 },
  { id: 'contact.t1', bus: 'contact', recipe: thud, minGapMs: 90, rateGroup: 'contact' },
  { id: 'contact.t4', bus: 'contact', recipe: thud, minGapMs: 90, rateGroup: 'contact' },
  { id: 'officials.whistle', bus: 'officials', recipe: whistle, file: 'assets/audio/whistle.ogg' },
  { id: 'officials.mic', bus: 'officials', recipe: micTone, ducksCrowd: true },
  { id: 'ui.alert', bus: 'ui', recipe: blip, ducksCrowd: true },
];

function setup(opts: ConstructorParameters<typeof AudioEngine>[1] = {}): { ctx: FakeAudioContext; engine: AudioEngine } {
  const ctx = new FakeAudioContext();
  const engine = new AudioEngine(ctx, { sounds: SOUNDS, ...opts });
  return { ctx, engine };
}

/** The gain node for a bus: the node right after a panner on a path from a played source. */
function busOf(ctx: FakeAudioContext, src: FakeSource): FakeGain[] {
  return (ctx.pathTo(src) ?? []).filter((n): n is FakeGain => n instanceof FakeGain);
}

describe('buses', () => {
  it('has exactly the eight O5.3.2 buses', () => {
    expect([...BUSES]).toEqual(['master', 'crowd', 'officials', 'contact', 'cadence', 'ui', 'ambience', 'music']);
    expect(MIX_BUSES).toHaveLength(7);
  });

  it('routes every mix bus through master to the destination', () => {
    const { ctx, engine } = setup();
    for (const b of MIX_BUSES) {
      const id = `t.${b}`;
      engine.register({ id, bus: b, recipe: blip });
      const r = engine.play(id);
      expect(r.played).toBe(true);
    }
    const audible = ctx.audibleAt(0.05);
    expect(audible.length).toBe(MIX_BUSES.length);
  });

  it('makes no sound and creates no nodes when a bus is off', () => {
    const { ctx, engine } = setup();
    engine.setBus('ui', { volumePct: 100, on: false });
    const before = ctx.nodes.length;
    expect(engine.play('ui.confirm')).toEqual({ played: false, reason: 'bus-off' });
    expect(ctx.nodes.length).toBe(before);
    expect(engine.play('contact.t1').played).toBe(true);
  });

  it('makes no sound when master is off', () => {
    const { ctx, engine } = setup();
    engine.setBus('master', { volumePct: 80, on: false });
    const before = ctx.nodes.length;
    expect(engine.play('contact.t1')).toEqual({ played: false, reason: 'master-off' });
    expect(ctx.nodes.length).toBe(before);
  });

  it('applies bus volume (squared curve) on the path', () => {
    const { ctx, engine } = setup({ settings: { contact: { volumePct: 50, on: true } } });
    engine.play('contact.t1', { when: 0 });
    const src = ctx.sources()[0]!;
    const gains = busOf(ctx, src).map((g) => g.gain.valueAt(0));
    expect(gains).toContain(0.25);
  });

  it('unknown sounds, late requests and a suspended context make no sound', () => {
    const { ctx, engine } = setup();
    expect(engine.play('nope')).toEqual({ played: false, reason: 'unknown-sound' });
    ctx.advance(1);
    expect(engine.play('contact.t1', { when: 1 - LATE_DROP_SECONDS - 0.01 })).toEqual({ played: false, reason: 'late' });
    expect(engine.play('contact.t1', { when: 0.9 }).played).toBe(true);
    ctx.state = 'suspended';
    expect(engine.play('ui.confirm')).toEqual({ played: false, reason: 'suspended' });
  });

  it('schedules at the given engine-tick time, not when called', () => {
    const { ctx, engine } = setup();
    const r = engine.play('ui.confirm', { when: 2.5 });
    expect(r).toMatchObject({ played: true, startsAt: 2.5 });
    expect(ctx.audibleAt(2.4)).toHaveLength(0);
    expect(ctx.audibleAt(2.55)).toHaveLength(1);
  });

  it('refuses a sound without a recipe', () => {
    const { engine } = setup();
    expect(() => engine.register({ id: 'x', bus: 'ui', recipe: { layers: [] } })).toThrow(/recipe/);
  });
});

describe('settings mapping', () => {
  it('uses the eight-bus keys first, then the current keys, then defaults', () => {
    const store: Record<string, unknown> = { 'audio.whistleCrowdVolume': 40, 'audio.whistleCrowdOn': true, 'audio.alertsOn': false, 'audio.menuMusicOn': true, 'audio.crowdVolume': 70 };
    const s = busSettingsFrom((k) => store[k]);
    expect(s.crowd).toEqual({ volumePct: 70, on: true });
    expect(s.officials).toEqual({ volumePct: 40, on: true });
    expect(s.ui.on).toBe(false);
    expect(s.music.on).toBe(true);
    expect(s.ambience).toEqual(BUS_DEFAULTS.ambience);
    expect(BUS_DEFAULTS.ambience.on).toBe(false);
    expect(BUS_DEFAULTS.music.on).toBe(false);
  });
});

describe('panning (MB-8)', () => {
  it('pans by field x relative to the view centre, width 0.7', () => {
    expect(panFor(60, 60, 30)).toBe(0);
    expect(panFor(90, 60, 30)).toBeCloseTo(PAN_WIDTH);
    expect(panFor(15, 60, 30)).toBeCloseTo(-PAN_WIDTH);
    expect(panFor(75, 60, 30)).toBeCloseTo(0.35);
    expect(panFor(undefined, 60, 30)).toBe(0);
    expect(panFor(90, 60, 30, true)).toBe(0);
  });

  it('sets the panner from the event x and honours mono', () => {
    const { engine } = setup({ view: { centreX: 50, halfSpanYd: 20 } });
    expect(engine.play('contact.t1', { fieldX: 60 })).toMatchObject({ pan: 0.35 });
    engine.setMono(true);
    expect(engine.play('ui.confirm', { fieldX: 70 })).toMatchObject({ pan: 0 });
  });
});

describe('rate limiter (MB-9, MB-12)', () => {
  it('drops a request inside the gap, on the audio clock', () => {
    const r = new RateLimiter();
    expect(r.allow('ui', 0, 120)).toBe(true);
    expect(r.allow('ui', 0.1, 120)).toBe(false);
    expect(r.allow('ui', 0.121, 120)).toBe(true);
    expect(r.allow('other', 0.121, 120)).toBe(true);
  });

  it('makes a pile-up one sound: contact tiers share a group', () => {
    const { engine } = setup();
    expect(engine.play('contact.t1', { when: 1 }).played).toBe(true);
    expect(engine.play('contact.t4', { when: 1.05 })).toEqual({ played: false, reason: 'rate-limited' });
    expect(engine.play('contact.t4', { when: 1.2 }).played).toBe(true);
  });

  it('limits call confirms to one per 120 ms', () => {
    const { engine } = setup();
    const results = [0, 0.05, 0.1, 0.13, 0.2, 0.26].map((t) => engine.play('ui.confirm', { when: t }).played);
    expect(results).toEqual([true, false, false, true, false, true]);
  });
});

describe('ducking (MB-10)', () => {
  it('dips the crowd to half under a ducking sound, holds at most 2.5 s, returns over 1 s', () => {
    const { ctx, engine } = setup();
    const r = engine.play('officials.mic', { when: 1 });
    expect(r.played && r.endsAt).toBeGreaterThan(1 + DUCK_MAX_HOLD); // mic tone outlasts the cap
    const crowdDuck = (t: number): number => engine.crowdDuckAt(t);
    expect(crowdDuck(0.9)).toBe(1);
    expect(crowdDuck(1.5)).toBe(DUCK_LEVEL);
    expect(crowdDuck(1 + DUCK_MAX_HOLD)).toBe(DUCK_LEVEL);
    expect(crowdDuck(1 + DUCK_MAX_HOLD + DUCK_RELEASE / 2)).toBeCloseTo(0.75);
    expect(crowdDuck(1 + DUCK_MAX_HOLD + DUCK_RELEASE + 0.01)).toBe(1);
    // The scheduled param agrees with the model.
    engine.register({ id: 'crowd.probe', bus: 'crowd', recipe: crowdBed });
    engine.play('crowd.probe', { when: 1 });
    const probe = ctx.sources().at(-1)!;
    const duckNode = busOf(ctx, probe).at(-2)!; // ... bus volume, bus duck, master
    for (const t of [0.9, 1.5, 3.5, 4.0, 4.6]) expect(duckNode.gain.valueAt(t)).toBeCloseTo(crowdDuck(t), 5);
  });

  it('does not duck for ordinary sounds, and overlapping ducks extend within the cap', () => {
    const { engine } = setup();
    engine.play('officials.whistle', { when: 0 });
    expect(engine.crowdDuckAt(0.2)).toBe(1);
    engine.play('ui.alert', { when: 1 });
    const firstHold = engine.crowdDuckAt(1.1);
    expect(firstHold).toBe(DUCK_LEVEL);
    engine.play('ui.alert', { when: 1.15 });
    expect(engine.crowdDuckAt(1.3)).toBe(DUCK_LEVEL);
    expect(engine.crowdDuckAt(1.4)).toBeGreaterThan(DUCK_LEVEL); // released after the second alert ended
  });

  it('caps a chain of alerts at 2.5 s from the first trigger', () => {
    const d = new Ducker();
    d.trigger(0, 1);
    d.trigger(0.9, 2);
    d.trigger(1.9, 3.5);
    expect(d.window!.holdUntil).toBe(DUCK_MAX_HOLD);
  });
});

describe('synthesized fallback (MB-18)', () => {
  it('plays the recipe when no file is loaded, the file once decoded, the recipe again if the decode fails', async () => {
    const { engine } = setup();
    expect(engine.play('officials.whistle', { when: 0 })).toMatchObject({ played: true, source: 'synth' });
    const ok = setup({ loader: { load: async () => new ArrayBuffer(16) } }).engine;
    expect(await ok.preload()).toEqual({ loaded: ['assets/audio/whistle.ogg'], failed: [] });
    expect(ok.play('officials.whistle')).toMatchObject({ played: true, source: 'file' });
    const bad = setup({ loader: { load: async () => new ArrayBuffer(0) } }).engine;
    expect((await bad.preload()).failed).toEqual(['assets/audio/whistle.ogg']);
    expect(bad.play('officials.whistle')).toMatchObject({ played: true, source: 'synth' });
    const missing = setup({ loader: { load: async () => { throw new Error('404'); } } }).engine;
    await missing.preload();
    expect(missing.play('officials.whistle')).toMatchObject({ played: true, source: 'synth' });
  });

  it('every layer of a recipe becomes a scheduled source with the right length', () => {
    const { ctx, engine } = setup();
    const r = engine.play('contact.t1', { when: 0, variantDraw: 0.9 });
    expect(r.played && r.endsAt).toBeCloseTo(recipeSeconds(thud));
    const srcs = ctx.sources();
    expect(srcs).toHaveLength(2);
    for (const s of srcs) expect(s.stopAt).not.toBeNull();
    expect(variantCents(thud, 0.9)).toBe(100);
    expect(variantCents(thud, 0)).toBe(-100);
    expect(variantCents(blip, 0.5)).toBe(0);
  });

  it('builds a warble LFO into the oscillator detune', () => {
    const { ctx, engine } = setup();
    engine.play('officials.whistle', { when: 0 });
    expect(ctx.sources().filter((s) => s.kind === 'oscillator')).toHaveLength(2);
  });

  it('noise is deterministic: same samples in two contexts', () => {
    const a = new FakeAudioContext(); const b = new FakeAudioContext();
    new AudioEngine(a, { sounds: SOUNDS }).play('contact.t1');
    new AudioEngine(b, { sounds: SOUNDS }).play('contact.t1');
    const bufA = (a.sources().find((s) => s.kind === 'bufferSource') as unknown as { buffer: { getChannelData(c: number): Float32Array } }).buffer.getChannelData(0);
    const bufB = (b.sources().find((s) => s.kind === 'bufferSource') as unknown as { buffer: { getChannelData(c: number): Float32Array } }).buffer.getChannelData(0);
    expect(bufA.length).toBeGreaterThan(0);
    expect(Array.from(bufA.slice(0, 64))).toEqual(Array.from(bufB.slice(0, 64)));
    expect(Math.max(...Array.from(bufA).map(Math.abs))).toBeLessThanOrEqual(1.5);
  });

  it('disconnects a voice when it ends', () => {
    const { ctx, engine } = setup();
    engine.play('ui.confirm', { when: 0 });
    ctx.advance(1);
    expect(ctx.audibleAt(ctx.currentTime)).toHaveLength(0);
    const panners = ctx.nodes.filter((n) => n.kind === 'panner');
    expect(panners.every((p) => p.disconnected)).toBe(true);
  });
});

describe('beds', () => {
  it('sustains a synth bed until stopped and eases its level', () => {
    const { ctx, engine } = setup();
    const bed = engine.startBed('crowd', { bus: 'crowd', recipe: crowdBed }, 0.4, 0.5);
    expect(bed.source).toBe('synth');
    ctx.advance(30);
    expect(ctx.audibleAt(30)).toHaveLength(1);
    bed.setLevel(0.9, 1);
    const out = ctx.nodes.filter((n): n is FakeGain => n instanceof FakeGain).find((g) => g.gain.events.some((e) => e.v === 0.9))!;
    expect(out.gain.valueAt(30.5)).toBeCloseTo(0.65);
    expect(out.gain.valueAt(31.5)).toBeCloseTo(0.9);
    bed.stop(0.5);
    expect(ctx.audibleAt(31)).toHaveLength(0);
  });

  it('a bed on an off bus is silent and comes back when the bus turns on', () => {
    const { ctx, engine } = setup({ settings: { ambience: { volumePct: 100, on: false } } });
    const bed = engine.startBed('rain', { bus: 'ambience', recipe: crowdBed });
    expect(bed.source).toBe('none');
    expect(ctx.sources()).toHaveLength(0);
    engine.setBus('ambience', { volumePct: 100, on: true });
    expect(bed.source).toBe('synth');
    engine.setBus('ambience', { volumePct: 100, on: false });
    expect(bed.source).toBe('none');
    ctx.advance(1);
    expect(ctx.audibleAt(1)).toHaveLength(0);
  });
});

describe('music output (PV-11 interface)', () => {
  const track = { id: 'title', title: 'Title', file: 'assets/music/title.ogg', loopSeconds: 16 };

  it('loops the file on the music bus with loop end at loopSeconds and fades on switch and stop', async () => {
    const ctx = new FakeAudioContext({ decode: () => ctx.createBuffer(2, 8000 * 20, 8000) });
    const engine = new AudioEngine(ctx, { settings: { music: { volumePct: 100, on: true } }, loader: { load: async () => new ArrayBuffer(8) } });
    const music = createMusicOutput(engine);
    music.play(track);
    expect(engine.bed('music')!.source).toBe('none'); // still decoding
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(engine.bed('music')!.source).toBe('file');
    const src = ctx.sources().find((s) => s.kind === 'bufferSource') as unknown as { loop: boolean; loopEnd: number; stopAt: number | null };
    expect(src.loop).toBe(true);
    expect(src.loopEnd).toBe(16);
    music.play(track); // same track: nothing new
    expect(ctx.sources().filter((s) => s.kind === 'bufferSource')).toHaveLength(1);
    music.stop();
    expect(src.stopAt).toBeCloseTo(0.6);
    expect(music.current).toBeNull();
  });

  it('is silent when the music bus is off (the default)', async () => {
    const ctx = new FakeAudioContext();
    const engine = new AudioEngine(ctx, { settings: busSettingsFrom(() => undefined), loader: { load: async () => new ArrayBuffer(8) } });
    createMusicOutput(engine).play(track);
    await new Promise((r) => setTimeout(r, 0));
    expect(ctx.sources()).toHaveLength(0);
  });
});

describe('ranked crowd queue (MB-7)', () => {
  const q = (): RankedQueue<(typeof CROWD_REACTION_RANK)[number]> => new RankedQueue(CROWD_REACTION_RANK);

  it('plays the first reaction of a play; a higher one on the same play cuts in; a lower one is dropped', () => {
    const rq = q();
    expect(rq.offer({ kind: 'bigGain', play: 'p1', at: 0, seconds: 3 }).action).toBe('play');
    const cut = rq.offer({ kind: 'touchdown', play: 'p1', at: 1, seconds: 4 });
    expect(cut).toMatchObject({ action: 'cut', replaced: { kind: 'bigGain' } });
    expect(rq.offer({ kind: 'sack', play: 'p1', at: 2, seconds: 2 })).toMatchObject({ action: 'drop', reason: 'lower-same-play' });
  });

  it('a lower reaction from the next play waits, then plays when the current ends; a stale one is dropped', () => {
    const rq = q();
    rq.offer({ kind: 'touchdown', play: 'p1', at: 0, seconds: 3 });
    expect(rq.offer({ kind: 'sack', play: 'p2', at: 2, seconds: 2 }).action).toBe('wait');
    expect(rq.pump(2.5)).toBeNull();
    expect(rq.pump(3)).toMatchObject({ kind: 'sack', at: 3 });
    const rq2 = q();
    rq2.offer({ kind: 'touchdown', play: 'p1', at: 0, seconds: 5 });
    rq2.offer({ kind: 'sack', play: 'p2', at: 1, seconds: 2 });
    expect(rq2.pump(5)).toBeNull(); // waited 4 s > 2 s
  });

  it('a higher reaction from another play cuts in; one reaction per play; unranked kinds are dropped', () => {
    const rq = q();
    rq.offer({ kind: 'sack', play: 'p1', at: 0, seconds: 3 });
    expect(rq.offer({ kind: 'turnover', play: 'p2', at: 1, seconds: 3 }).action).toBe('cut');
    expect(rq.offer({ kind: 'reviewReversal', play: 'p2', at: 5, seconds: 2 })).toMatchObject({ action: 'drop', reason: 'play-already-reacted' });
    expect(rq.offer({ kind: 'cheer' as never, play: 'p3', at: 9, seconds: 1 })).toMatchObject({ action: 'drop', reason: 'unranked' });
  });
});

// Compile-time check: a real browser AudioContext satisfies the engine's context type.
type RealFits = AudioContext extends AudioContextLike ? true : false;
export const realFits: RealFits = true;
