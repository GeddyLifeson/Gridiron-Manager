// Recipe to Web Audio graph (plan section 5.1, MB-18). Builds the synthesized voice for one sound into
// a given output node. Noise is generated from a fixed seed, never platform random (plan section 6),
// so an offline render of a recipe is the same bytes every time.
import type {
  AudioBufferLike, AudioContextLike, AudioNodeLike, Envelope, NoiseColour, RecipeLayer, ScheduledSourceLike, SoundRecipe,
} from './types.ts';

/** Seconds of looped noise per colour. Long enough that the loop is not heard in a crowd bed. */
export const NOISE_SECONDS = 2;
/** Floor for exponential ramps (they cannot reach 0). */
const EPS = 0.0001;

export function envelopeSeconds(env: Envelope): number { return env.attack + env.hold + env.release; }

/** Length of a recipe in seconds: the latest layer end. */
export function recipeSeconds(recipe: SoundRecipe): number {
  let end = 0;
  for (const l of recipe.layers) end = Math.max(end, (l.offset ?? 0) + envelopeSeconds(l.env));
  return end;
}

/** Picks the pitch variant in cents from a draw in [0, 1). No variants or no draw gives 0 or the first. */
export function variantCents(recipe: SoundRecipe, draw: number | undefined): number {
  const v = recipe.variantsCents;
  if (!v || v.length === 0) return 0;
  if (draw === undefined) return v[0]!;
  const i = Math.min(v.length - 1, Math.max(0, Math.floor(draw * v.length)));
  return v[i]!;
}

/** xorshift32 with a fixed seed per colour: deterministic noise. */
function noiseSamples(colour: NoiseColour, n: number): Float32Array {
  const out = new Float32Array(n);
  let s = colour === 'white' ? 0x9e3779b9 : colour === 'pink' ? 0x7f4a7c15 : 0x2545f491;
  const next = (): number => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 * 2 - 1; };
  if (colour === 'white') { for (let i = 0; i < n; i++) out[i] = next(); return out; }
  if (colour === 'brown') {
    let last = 0;
    for (let i = 0; i < n; i++) { last = (last + 0.02 * next()) / 1.02; out[i] = last * 3.5; }
    return out;
  }
  // Pink: Paul Kellet's economy filter.
  let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = next();
    b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
    out[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
  }
  return out;
}

const noiseCache = new WeakMap<AudioContextLike, Map<NoiseColour, AudioBufferLike>>();

export function noiseBuffer(ctx: AudioContextLike, colour: NoiseColour): AudioBufferLike {
  let byColour = noiseCache.get(ctx);
  if (!byColour) { byColour = new Map(); noiseCache.set(ctx, byColour); }
  let buf = byColour.get(colour);
  if (!buf) {
    const n = Math.round(ctx.sampleRate * NOISE_SECONDS);
    buf = ctx.createBuffer(1, n, ctx.sampleRate);
    buf.getChannelData(0).set(noiseSamples(colour, n));
    byColour.set(colour, buf);
  }
  return buf;
}

/** Schedules attack, hold, release on a gain param starting at `t0`. */
function applyEnvelope(param: { setValueAtTime(v: number, t: number): unknown; linearRampToValueAtTime(v: number, t: number): unknown }, env: Envelope, t0: number, gain: number): void {
  const peak = (env.peak ?? 1) * gain;
  param.setValueAtTime(0, t0);
  param.linearRampToValueAtTime(peak, t0 + env.attack);
  param.setValueAtTime(peak, t0 + env.attack + env.hold);
  param.linearRampToValueAtTime(0, t0 + envelopeSeconds(env));
}

export interface SynthVoice { sources: ScheduledSourceLike[]; endsAt: number }

function buildLayer(ctx: AudioContextLike, layer: RecipeLayer, out: AudioNodeLike, start: number, cents: number): ScheduledSourceLike[] {
  const t0 = start + (layer.offset ?? 0);
  const dur = envelopeSeconds(layer.env);
  const t1 = t0 + dur;
  const amp = ctx.createGain();
  applyEnvelope(amp.gain, layer.env, t0, layer.gain ?? 1);
  let head: AudioNodeLike = amp;
  if (layer.filter) {
    const f = ctx.createBiquadFilter();
    f.type = layer.filter.type;
    f.frequency.setValueAtTime(layer.filter.freq, t0);
    if (layer.filter.freqEnd !== undefined) f.frequency.linearRampToValueAtTime(layer.filter.freqEnd, t1);
    f.Q.setValueAtTime(layer.filter.q ?? 1, t0);
    f.connect(amp);
    head = f;
  }
  amp.connect(out);
  const made: ScheduledSourceLike[] = [];
  const src = layer.source;
  if (src.kind === 'osc') {
    const o = ctx.createOscillator();
    o.type = src.wave;
    o.frequency.setValueAtTime(src.freq, t0);
    if (src.freqEnd !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(EPS, src.freqEnd), t1);
    o.detune.setValueAtTime((src.detuneCents ?? 0) + cents, t0);
    o.connect(head);
    if (src.lfo && src.lfo.depth > 0 && src.lfo.rate > 0) {
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(src.lfo.rate, t0);
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(src.lfo.depth, t0);
      lfo.connect(depth);
      depth.connect(o.detune);
      lfo.start(t0); lfo.stop(t1);
      made.push(lfo);
    }
    o.start(t0); o.stop(t1);
    made.push(o);
  } else {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx, src.colour);
    n.loop = true;
    // Pitch variants shift noise by playback rate, the same number of cents.
    if (cents !== 0) n.playbackRate.setValueAtTime(2 ** (cents / 1200), t0);
    n.connect(head);
    n.start(t0); n.stop(t1);
    made.push(n);
  }
  return made;
}

/** Builds the whole recipe into `out`, starting at audio time `start`. */
export function buildRecipe(ctx: AudioContextLike, recipe: SoundRecipe, out: AudioNodeLike, start: number, cents = 0): SynthVoice {
  const master = ctx.createGain();
  master.gain.setValueAtTime(recipe.gain ?? 1, start);
  master.connect(out);
  const sources: ScheduledSourceLike[] = [];
  for (const layer of recipe.layers) sources.push(...buildLayer(ctx, layer, master, start, cents));
  return { sources, endsAt: start + recipeSeconds(recipe) };
}

/**
 * Sustained version for beds (crowd, rain, wind): each layer runs its attack, then holds at its peak
 * with no release and no stop time. The caller stops the sources and fades the output.
 */
export function buildSustained(ctx: AudioContextLike, recipe: SoundRecipe, out: AudioNodeLike, start: number): ScheduledSourceLike[] {
  const master = ctx.createGain();
  master.gain.setValueAtTime(recipe.gain ?? 1, start);
  master.connect(out);
  const sources: ScheduledSourceLike[] = [];
  for (const layer of recipe.layers) {
    const t0 = start + (layer.offset ?? 0);
    const amp = ctx.createGain();
    const peak = (layer.env.peak ?? 1) * (layer.gain ?? 1);
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(peak, t0 + Math.max(0.01, layer.env.attack));
    amp.connect(master);
    let head: AudioNodeLike = amp;
    if (layer.filter) {
      const f = ctx.createBiquadFilter();
      f.type = layer.filter.type;
      f.frequency.setValueAtTime(layer.filter.freq, t0);
      f.Q.setValueAtTime(layer.filter.q ?? 1, t0);
      f.connect(amp);
      head = f;
    }
    const src = layer.source;
    if (src.kind === 'osc') {
      const o = ctx.createOscillator();
      o.type = src.wave;
      o.frequency.setValueAtTime(src.freq, t0);
      o.detune.setValueAtTime(src.detuneCents ?? 0, t0);
      o.connect(head);
      if (src.lfo && src.lfo.depth > 0 && src.lfo.rate > 0) {
        const lfo = ctx.createOscillator();
        lfo.frequency.setValueAtTime(src.lfo.rate, t0);
        const depth = ctx.createGain();
        depth.gain.setValueAtTime(src.lfo.depth, t0);
        lfo.connect(depth);
        depth.connect(o.detune);
        lfo.start(t0);
        sources.push(lfo);
      }
      o.start(t0);
      sources.push(o);
    } else {
      const n = ctx.createBufferSource();
      n.buffer = noiseBuffer(ctx, src.colour);
      n.loop = true;
      n.connect(head);
      n.start(t0);
      sources.push(n);
    }
  }
  return sources;
}
