// Audio engine contract (PV-06; O5.3.2, MB-7, MB-8, MB-9, MB-10, MB-12, MB-18). This file is the
// interface the recipe (PV-07), crowd (PV-08), cadence (PV-09), ambience (PV-10) and music (PV-11)
// packages build against. It names no football fact; it is plumbing for sounds whose information is
// listed in the PV-02 cue table.
//
// Timing rule (plan rule 3): the engine never decides when a game sound happens. Callers pass the
// audio-clock time of the engine tick (`when`); the engine only schedules it. Nothing here reads the
// wall clock or platform random (plan section 6).

/** The eight mixer groups of O5.3.2 (plan 4.1). `master` feeds the output; the other seven feed `master`. */
export const BUSES = ['master', 'crowd', 'officials', 'contact', 'cadence', 'ui', 'ambience', 'music'] as const;
export type BusId = (typeof BUSES)[number];
export type MixBus = Exclude<BusId, 'master'>;
export const MIX_BUSES: readonly MixBus[] = BUSES.filter((b): b is MixBus => b !== 'master');

/** One bus's user setting: volume 0 to 100 and an off switch. Off means no node is created at all. */
export interface BusSetting { volumePct: number; on: boolean }

// ---------------------------------------------------------------------------------------------
// Minimal Web Audio surface. Structural subsets of the DOM types, so a real `AudioContext` fits
// (checked at compile time in test/audio-engine/context-fit.test.ts) and `FakeAudioContext` fits too.
// ---------------------------------------------------------------------------------------------

export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  exponentialRampToValueAtTime(value: number, time: number): unknown;
  setTargetAtTime(target: number, time: number, timeConstant: number): unknown;
  cancelScheduledValues(time: number): unknown;
}

export interface AudioNodeLike {
  connect(destination: AudioNodeLike | AudioParamLike): unknown;
  disconnect(): void;
}

export interface GainNodeLike extends AudioNodeLike { readonly gain: AudioParamLike }
export interface StereoPannerNodeLike extends AudioNodeLike { readonly pan: AudioParamLike }
export interface BiquadFilterNodeLike extends AudioNodeLike {
  type: BiquadFilterType;
  readonly frequency: AudioParamLike;
  readonly Q: AudioParamLike;
}

export interface ScheduledSourceLike extends AudioNodeLike {
  start(when?: number): void;
  stop(when?: number): void;
  onended: ((this: never, ev: Event) => unknown) | null;
}

export interface OscillatorNodeLike extends ScheduledSourceLike {
  type: OscillatorType;
  readonly frequency: AudioParamLike;
  readonly detune: AudioParamLike;
}

export interface AudioBufferLike {
  readonly duration: number;
  readonly length: number;
  readonly sampleRate: number;
  readonly numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

export interface AudioBufferSourceNodeLike extends ScheduledSourceLike {
  buffer: AudioBufferLike | null;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  readonly playbackRate: AudioParamLike;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: AudioNodeLike;
  readonly state: AudioContextState;
  resume(): Promise<void>;
  createGain(): GainNodeLike;
  createStereoPanner(): StereoPannerNodeLike;
  createBiquadFilter(): BiquadFilterNodeLike;
  createOscillator(): OscillatorNodeLike;
  createBufferSource(): AudioBufferSourceNodeLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  decodeAudioData(data: ArrayBuffer): Promise<AudioBufferLike>;
}

// ---------------------------------------------------------------------------------------------
// Recipes: a sound as data (plan section 5.1). PV-07 writes these in packages/app-ui/src/audio/recipes/.
// Every registered sound must have one: it is the synthesized fallback when a recorded file is missing,
// late or fails to decode (MB-18), and the only source in v1.
// ---------------------------------------------------------------------------------------------

export type NoiseColour = 'white' | 'pink' | 'brown';

/** Attack, hold and release in seconds, peak 0 to 1. Total length is attack + hold + release. */
export interface Envelope { attack: number; hold: number; release: number; peak?: number }

export interface FilterSpec {
  type: 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'peaking';
  /** Hz at the layer's start. */
  freq: number;
  /** Hz at the layer's end (linear sweep over the envelope). */
  freqEnd?: number;
  q?: number;
}

/** Frequency wobble, e.g. a pea whistle's warble (plan 2.1): `rate` Hz, `depth` in cents. */
export interface Lfo { rate: number; depth: number }

export interface OscLayer {
  kind: 'osc';
  wave: 'sine' | 'square' | 'sawtooth' | 'triangle';
  /** Hz at the start. */
  freq: number;
  /** Hz at the end (exponential glide over the envelope). */
  freqEnd?: number;
  detuneCents?: number;
  lfo?: Lfo;
}

export interface NoiseLayer { kind: 'noise'; colour: NoiseColour }

export interface RecipeLayer {
  source: OscLayer | NoiseLayer;
  env: Envelope;
  /** Seconds after the sound's start. */
  offset?: number;
  /** Linear gain 0 to 1 for this layer. */
  gain?: number;
  filter?: FilterSpec;
}

export interface SoundRecipe {
  layers: RecipeLayer[];
  /** Linear gain applied to the whole sound, 0 to 1. Default 1. */
  gain?: number;
  /** Pitch variants (MB-9): each play draws one detune from this list in cents, using `cosmetic.audio`. */
  variantsCents?: number[];
}

// ---------------------------------------------------------------------------------------------
// Registry rows: what the engine knows about each sound id.
// ---------------------------------------------------------------------------------------------

export interface SoundDef {
  id: string;
  bus: MixBus;
  /** Synthesized source and fallback. Required (MB-18). */
  recipe: SoundRecipe;
  /** Optional recorded or rendered file (plan 5.2 and 5.3), path under assets/. Needs a LICENSES.json row. */
  file?: string;
  /**
   * Minimum gap in milliseconds between two plays sharing `rateGroup` (or this id). A request inside
   * the gap is dropped, so a pile-up is one sound (MB-9) and chorded calls are not a stutter (MB-12).
   */
  minGapMs?: number;
  /** Sounds that share a limiter, e.g. every contact tier shares `contact`. Default: the id. */
  rateGroup?: string;
  /** True for the referee mic tone, play clock warning and alerts: dips the crowd bus (MB-10). */
  ducksCrowd?: boolean;
}

export interface PlayOptions {
  /** Audio-clock time to start, from the engine tick. Default: now. */
  when?: number;
  /** Event's field x in yards, for panning (MB-8). Omit for centred UI sounds. */
  fieldX?: number;
  /** Extra linear gain 0 to 1, e.g. contact tier loudness. */
  gain?: number;
  /** A draw in [0, 1) from `cosmetic.audio`, picks the pitch variant. Default: first variant. */
  variantDraw?: number;
  /**
   * Audio-clock time to cut the sound short (the lane plan's `endMs` when a better-ranked stinger cuts in,
   * MB-7). The sound fades out over a few ms ending here. Ignored if it is after the sound's own end.
   */
  stopAt?: number;
}

/** Why a request made no sound. Tests and the captions strip read this. */
export type PlayOutcome =
  | { played: true; source: 'file' | 'synth'; startsAt: number; endsAt: number; pan: number }
  | { played: false; reason: 'unknown-sound' | 'bus-off' | 'master-off' | 'rate-limited' | 'suspended' | 'late' };

/** Loads asset bytes (shell supplies it: fetch in the browser, the file bridge on desktop). */
export interface AssetLoader { load(path: string): Promise<ArrayBuffer> }
