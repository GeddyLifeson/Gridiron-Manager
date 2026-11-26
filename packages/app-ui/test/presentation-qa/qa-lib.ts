// PV-17 shared helpers for the presentation QA suite. Test code only: nothing here ships.
//
// The offline mix: the audio engine runs against a FakeAudioContext (no sound is made), every sound it
// accepts is recorded, and `mixdown` renders those sounds with the same recipe renderer the loudness tests
// use, applies the bus volumes and the crowd duck the engine scheduled, and sums them. Then the tests
// measure levels, ducking and overlap on real sample data instead of on graph structure alone.
import { AudioEngine, FakeAudioContext, FakeParam, variantCents, MIX_BUSES, type MixBus, type PlayOptions, type PlayOutcome, type SoundDef } from '../../src/audio/engine/index.ts';
import { gainToDb, renderRecipe, toSoundDefs } from '../../src/audio/recipes/index.ts';

/** Sample rate of the offline mix. Low on purpose: every recipe is band-limited well under 8 kHz at this rate's Nyquist, and a game-length mix stays small. */
export const MIX_RATE = 16_000;

export interface Played { id: string; bus: MixBus; startsAt: number; endsAt: number; gain: number; pan: number; draw: number | undefined }

export interface Rig { ctx: FakeAudioContext; engine: AudioEngine; defs: Map<string, SoundDef>; played: Played[]; refused: { id: string; reason: string }[] }

/** An engine on a fake context with every recipe (gated ones too) and a recorder around `play`. */
export function rig(opts: ConstructorParameters<typeof AudioEngine>[1] = {}): Rig {
  const ctx = new FakeAudioContext({ sampleRate: MIX_RATE });
  const defsArr = toSoundDefs({ includeGated: true });
  const engine = new AudioEngine(ctx, { sounds: defsArr, ...opts });
  const defs = new Map(defsArr.map((d) => [d.id, d]));
  const played: Played[] = [];
  const refused: Rig['refused'] = [];
  const original = engine.play.bind(engine);
  engine.play = (id: string, o: PlayOptions = {}): PlayOutcome => {
    const out = original(id, o);
    if (out.played) played.push({ id, bus: defs.get(id)!.bus, startsAt: out.startsAt, endsAt: out.endsAt, gain: o.gain ?? 1, pan: out.pan, draw: o.variantDraw });
    else refused.push({ id, reason: out.reason });
    return out;
  };
  return { ctx, engine, defs, played, refused };
}

/**
 * The crowd bus's duck gain at time `t`, read from the automation the engine scheduled on the fake context.
 * (`engine.crowdDuckAt` remembers only the latest dip, so it cannot answer for an earlier time.) This
 * reaches into the engine's private bus table on purpose: it is the one way to ask what was really scheduled.
 */
export function duckAt(r: Rig, t: number): number {
  const buses = (r.engine as unknown as { buses: Map<string, { duck: { gain: FakeParam } }> }).buses;
  return buses.get('crowd')!.duck.gain.valueAt(t);
}

/** Bus volume as the engine applies it (squared percentage, off is zero). */
export const busGain = (pct: number, on: boolean): number => (on ? (Math.max(0, Math.min(100, pct)) / 100) ** 2 : 0);

export interface BedSpec { id: string; bus: MixBus; from: number; to: number; level: number }
export interface Mix { rate: number; seconds: number; master: Float32Array; buses: Record<MixBus, Float32Array> }

/**
 * Renders what the engine scheduled. `beds` are held sounds (crowd bed) at a fixed level; the crowd duck
 * is read from the engine (`crowdDuckAt`) so the mix agrees with what the engine decided.
 */
export function mixdown(r: Rig, seconds: number, beds: readonly BedSpec[] = []): Mix {
  const n = Math.ceil(seconds * MIX_RATE);
  const buses = Object.fromEntries(MIX_BUSES.map((b) => [b, new Float32Array(n)])) as Record<MixBus, Float32Array>;
  const add = (bus: MixBus, x: Float32Array, startS: number, gain: number) => {
    const out = buses[bus];
    const s0 = Math.round(startS * MIX_RATE);
    for (let i = 0; i < x.length && s0 + i < n; i++) if (s0 + i >= 0) out[s0 + i] = out[s0 + i]! + x[i]! * gain;
  };
  for (const p of r.played) {
    const def = r.defs.get(p.id)!;
    const cents = variantCents(def.recipe, p.draw);
    add(p.bus, renderRecipe(def.recipe, { sampleRate: MIX_RATE, cents }), p.startsAt, p.gain);
  }
  for (const b of beds) {
    const def = r.defs.get(b.id)!;
    const x = renderRecipe(def.recipe, { sampleRate: MIX_RATE, sustained: true, seconds: 4 });
    const len = Math.round((b.to - b.from) * MIX_RATE);
    const looped = new Float32Array(len);
    for (let i = 0; i < len; i++) looped[i] = x[i % x.length]!;
    add(b.bus, looped, b.from, b.level);
  }
  const master = new Float32Array(n);
  for (const b of MIX_BUSES) {
    const s = r.engine.busSetting(b);
    const g = busGain(s.volumePct, s.on) * busGain(r.engine.busSetting('master').volumePct, r.engine.busSetting('master').on);
    const x = buses[b];
    for (let i = 0; i < n; i++) {
      const duck = b === 'crowd' ? duckAt(r, i / MIX_RATE) : 1;
      x[i] = x[i]! * g * duck;
      master[i] = master[i]! + x[i]!;
    }
  }
  return { rate: MIX_RATE, seconds, master, buses };
}

/** RMS of `x` between two times, in dBFS (-Infinity for silence). */
export function rmsDb(x: Float32Array, fromS: number, toS: number, rate = MIX_RATE): number {
  const a = Math.max(0, Math.floor(fromS * rate)), b = Math.min(x.length, Math.ceil(toS * rate));
  if (b <= a) return -Infinity;
  let s = 0;
  for (let i = a; i < b; i++) s += x[i]! * x[i]!;
  return gainToDb(Math.sqrt(s / (b - a)));
}

export function peakOf(x: Float32Array, fromS = 0, toS = Infinity, rate = MIX_RATE): number {
  const a = Math.max(0, Math.floor(fromS * rate)), b = Math.min(x.length, Math.ceil(toS * rate));
  let p = 0;
  for (let i = a; i < b; i++) p = Math.max(p, Math.abs(x[i]!));
  return gainToDb(p);
}

/** Pairs of sounds that sound at the same time (`slack` seconds of grace for float edges). */
export function overlaps(list: readonly { id: string; startsAt: number; endsAt: number }[], slack = 1e-6): [string, string][] {
  const sorted = [...list].sort((a, b) => a.startsAt - b.startsAt);
  const out: [string, string][] = [];
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length; j++) {
    if (sorted[j]!.startsAt >= sorted[i]!.endsAt - slack) break;
    out.push([sorted[i]!.id, sorted[j]!.id]);
  }
  return out;
}
