// Plain TypeScript render of a recipe, matching what the audio engine's `buildRecipe` and
// `buildSustained` (PV-06, `../engine/synth.ts`) schedule in Web Audio, so the loudness tests run in
// Node with no browser. `scripts/audio/render-recipes.ts` renders the same recipes in Chromium's
// OfflineAudioContext and checks the two agree within 1 dB.

import { envelopeSeconds, noiseBuffer, recipeSeconds } from '../engine/synth.ts';
import type { AudioBufferLike, AudioContextLike, Envelope, FilterSpec, NoiseColour, RecipeLayer, SoundRecipe } from '../engine/types.ts';

export const SAMPLE_RATE = 48_000;
/** Web Audio's render quantum; time-varying filter coefficients are refreshed this often. */
const QUANTUM = 128;
const TAU = 2 * Math.PI;

export const dbToGain = (db: number): number => Math.pow(10, db / 20);
export const gainToDb = (g: number): number => (g > 0 ? 20 * Math.log10(g) : -Infinity);

/** The engine's own noise buffers, built through a minimal context so the bytes are identical. */
function engineNoise(colour: NoiseColour, sampleRate: number): Float32Array {
  const ctx = {
    sampleRate,
    createBuffer: (_c: number, length: number, sr: number): AudioBufferLike => {
      const data = new Float32Array(length);
      return { duration: length / sr, length, sampleRate: sr, numberOfChannels: 1, getChannelData: () => data };
    },
  } as unknown as AudioContextLike;
  return noiseBuffer(ctx, colour).getChannelData(0);
}

/** Linear attack, hold, linear release, as the engine schedules it. `sustained` holds after attack. */
function envAt(e: Envelope, t: number, sustained: boolean): number {
  const peak = e.peak ?? 1;
  const attack = sustained ? Math.max(0.01, e.attack) : e.attack;
  if (t < 0) return 0;
  if (t < attack) return (peak * t) / attack;
  if (sustained) return peak;
  if (t < attack + e.hold) return peak;
  const end = envelopeSeconds(e);
  if (t >= end) return 0;
  return e.release > 0 ? peak * (1 - (t - attack - e.hold) / e.release) : 0;
}

/** Biquad coefficients as the Web Audio spec defines them (lowpass and highpass Q in dB, bandpass Q
 * linear), normalised by a0. */
export function biquad(type: FilterSpec['type'], freqHz: number, q: number, sampleRate: number): [number, number, number, number, number] {
  const f = Math.min(Math.max(freqHz, 10), sampleRate / 2 - 1);
  const w0 = (TAU * f) / sampleRate;
  const cos = Math.cos(w0), sin = Math.sin(w0);
  if (type === 'bandpass' || type === 'notch' || type === 'peaking') {
    const alpha = sin / (2 * q);
    const a0 = 1 + alpha;
    if (type === 'bandpass') return [alpha / a0, 0, -alpha / a0, (-2 * cos) / a0, (1 - alpha) / a0];
    if (type === 'notch') return [1 / a0, (-2 * cos) / a0, 1 / a0, (-2 * cos) / a0, (1 - alpha) / a0];
    return [1, 0, 0, 0, 0]; // peaking with the default 0 dB gain is a pass-through
  }
  const alpha = sin / (2 * Math.pow(10, q / 20));
  const a0 = 1 + alpha;
  const b = type === 'lowpass' ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2] : [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  return [b[0]! / a0, b[1]! / a0, b[2]! / a0, (-2 * cos) / a0, (1 - alpha) / a0];
}

/** Band-limited waveform table normalised to peak 1, as Web Audio normalises its periodic waves. */
function waveTable(wave: 'sine' | 'square' | 'sawtooth' | 'triangle', maxFreq: number, sampleRate: number): Float32Array {
  const size = 4096;
  const table = new Float32Array(size);
  const n = wave === 'sine' ? 1 : Math.max(1, Math.min(256, Math.floor(sampleRate / 2 / maxFreq)));
  for (let k = 1; k <= n; k++) {
    let c = 0;
    if (wave === 'sine') c = k === 1 ? 1 : 0;
    else if (wave === 'square') c = k % 2 ? 4 / (Math.PI * k) : 0;
    else if (wave === 'sawtooth') c = ((k % 2 ? 1 : -1) * 2) / (Math.PI * k);
    else c = k % 2 ? ((8 / (Math.PI * Math.PI)) * (((k - 1) / 2) % 2 ? -1 : 1)) / (k * k) : 0;
    if (c) for (let i = 0; i < size; i++) table[i] = table[i]! + c * Math.sin((TAU * k * i) / size);
  }
  let peak = 0;
  for (let i = 0; i < size; i++) peak = Math.max(peak, Math.abs(table[i]!));
  for (let i = 0; i < size; i++) table[i] = table[i]! / peak;
  return table;
}

function renderLayer(layer: RecipeLayer, out: Float32Array, sampleRate: number, cents: number, sustained: boolean): void {
  const start = Math.round((layer.offset ?? 0) * sampleRate);
  const dur = envelopeSeconds(layer.env);
  const gain = layer.gain ?? 1;
  const src = layer.source;
  const ratio = Math.pow(2, cents / 1200);
  const fl = layer.filter;
  let co = fl ? biquad(fl.type, fl.freq, fl.q ?? 1, sampleRate) : null;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  let phase = 0;
  const osc = src.kind === 'osc' ? src : null;
  const table = osc ? waveTable(osc.wave, Math.max(osc.freq, osc.freqEnd ?? 0) * ratio * Math.pow(2, (osc.lfo?.depth ?? 0) / 1200), sampleRate) : null;
  const noise = src.kind === 'noise' ? engineNoise(src.colour, sampleRate) : null;
  let noisePos = 0;
  // Noise pitch variants: the engine sets playbackRate on one-shots only.
  const noiseRate = sustained ? 1 : ratio;
  for (let i = start; i < out.length; i++) {
    const t = (i - start) / sampleRate;
    if (!sustained && t >= dur) break;
    if (fl && fl.freqEnd !== undefined && !sustained && (i - start) % QUANTUM === 0) {
      co = biquad(fl.type, fl.freq + (fl.freqEnd - fl.freq) * Math.min(1, t / dur), fl.q ?? 1, sampleRate);
    }
    let x: number;
    if (osc && table) {
      let f = osc.freq;
      if (osc.freqEnd !== undefined && !sustained) f = osc.freq * Math.pow(Math.max(1e-4, osc.freqEnd) / osc.freq, Math.min(1, t / dur));
      const det = (osc.detuneCents ?? 0) + (sustained ? 0 : cents) + (osc.lfo ? osc.lfo.depth * Math.sin(TAU * osc.lfo.rate * t) : 0);
      const p = (phase - Math.floor(phase)) * table.length;
      const j = Math.floor(p), fr = p - j;
      x = table[j % table.length]! * (1 - fr) + table[(j + 1) % table.length]! * fr;
      phase += (f * Math.pow(2, det / 1200)) / sampleRate;
    } else {
      const n = noise!;
      const j = Math.floor(noisePos), fr = noisePos - j;
      x = n[j % n.length]! * (1 - fr) + n[(j + 1) % n.length]! * fr;
      noisePos += noiseRate;
    }
    if (co) {
      const y = co[0] * x + co[1] * x1 + co[2] * x2 - co[3] * y1 - co[4] * y2;
      x2 = x1; x1 = x; y2 = y1; y1 = y; x = y;
    }
    out[i] = out[i]! + x * envAt(layer.env, t, sustained) * gain;
  }
}

export interface RenderOptions {
  sampleRate?: number;
  /** Pitch variant in cents (from `variantCents`). */
  cents?: number;
  /** Seconds to render; default the recipe length (beds: 4 s). */
  seconds?: number;
  /** Render as a held bed, the way `buildSustained` plays it. */
  sustained?: boolean;
}

/** Mono samples of `recipe` (its `gain` applied). */
export function renderRecipe(recipe: SoundRecipe, opts: RenderOptions = {}): Float32Array {
  const sampleRate = opts.sampleRate ?? SAMPLE_RATE;
  const sustained = opts.sustained ?? false;
  const seconds = opts.seconds ?? (sustained ? 4 : recipeSeconds(recipe));
  const out = new Float32Array(Math.ceil(seconds * sampleRate));
  for (const layer of recipe.layers) renderLayer(layer, out, sampleRate, opts.cents ?? 0, sustained);
  const g = recipe.gain ?? 1;
  if (g !== 1) for (let i = 0; i < out.length; i++) out[i] = out[i]! * g;
  return out;
}
