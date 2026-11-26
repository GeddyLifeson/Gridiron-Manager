// The audio engine (PV-06; O5.3.2). One Web Audio graph:
//
//   voice -> panner -> bus volume -> bus duck -> master -> destination
//
// with the eight buses of plan 4.1, crowd ducking (MB-10), field panning (MB-8), a per-group rate
// limiter (MB-9, MB-12) and a recorded-file path that always falls back to the sound's recipe (MB-18).
// A bus that is off creates no nodes at all, so "off" is silence by construction, not by a zero gain.
//
// Timing: every `when` is audio-clock seconds supplied by the caller from the engine tick (plan rule 3).
// A request that arrives too late is dropped rather than played late, because a late whistle or hit
// misreports when it happened.
import { DUCK_ATTACK, DUCK_LEVEL, DUCK_RELEASE, Ducker, RateLimiter, panFor } from './mix.ts';
import { buildRecipe, buildSustained, recipeSeconds, variantCents } from './synth.ts';
import {
  BUSES, MIX_BUSES,
  type AssetLoader, type AudioBufferLike, type AudioContextLike, type BusId, type BusSetting, type GainNodeLike, type MixBus,
  type PlayOptions, type PlayOutcome, type ScheduledSourceLike, type SoundDef, type SoundRecipe,
} from './types.ts';

/** A request more than this many seconds behind the audio clock is dropped, not played late. */
export const LATE_DROP_SECONDS = 0.25;
/** Default fade for loops and beds on stop or switch, seconds (PV-11 asked for a short fade). */
export const DEFAULT_FADE_SECONDS = 0.6;

/** A looping sound: the crowd bed, weather beds, menu music. */
export interface BedDef {
  bus: MixBus;
  /** Synthesized bed: every layer sustains after its attack until stopped. Required unless `file` is set and silence is an acceptable fallback (music only). */
  recipe?: SoundRecipe;
  file?: string;
  /** Loop end in seconds for a file (PV-11: whole bars, so a render's tail is cut). Default: the file's length. */
  loopSeconds?: number;
  /** Fixed level match in dB on top of the level (PV-11 per-loop `gainDb`). Default 0. */
  gainDb?: number;
}

export interface BedHandle {
  readonly key: string;
  /** Linear level 0 to 1, eased over `rampSeconds` (the crowd bed eases between plays only). */
  setLevel(level: number, rampSeconds?: number, when?: number): void;
  stop(fadeSeconds?: number): void;
  /** What is sounding: the file, the synthesized fallback, or nothing (bus off, or a file-only bed whose file failed). */
  readonly source: 'file' | 'synth' | 'none';
}

export interface EngineOptions {
  sounds?: readonly SoundDef[];
  loader?: AssetLoader;
  /** Field view for panning: centre x and half the visible width, in yards. */
  view?: { centreX: number; halfSpanYd: number };
  settings?: Partial<Record<BusId, BusSetting>>;
  mono?: boolean;
}

export interface PreloadResult { loaded: string[]; failed: string[] }

interface Bus { volume: GainNodeLike; duck: GainNodeLike; setting: BusSetting }

interface BedState {
  key: string;
  def: BedDef;
  level: number;
  out: GainNodeLike | null;
  sources: ScheduledSourceLike[];
  source: 'file' | 'synth' | 'none';
}

function bedGain(state: { level: number; def: BedDef }): number {
  return state.level * 10 ** ((state.def.gainDb ?? 0) / 20);
}

const DEFAULT_SETTING: BusSetting = { volumePct: 100, on: true };

function gainFromPct(pct: number): number {
  const p = Math.max(0, Math.min(100, pct)) / 100;
  // Perceptual curve: squared, so 50% sounds about half as loud rather than barely quieter.
  return p * p;
}

export class AudioEngine {
  readonly ctx: AudioContextLike;
  private readonly master: GainNodeLike;
  private masterSetting: BusSetting;
  private readonly buses = new Map<MixBus, Bus>();
  private readonly sounds = new Map<string, SoundDef>();
  private readonly buffers = new Map<string, AudioBufferLike>();
  private readonly limiter = new RateLimiter();
  private readonly ducker = new Ducker();
  private readonly beds = new Map<string, BedState>();
  private readonly loader: AssetLoader | undefined;
  private view: { centreX: number; halfSpanYd: number };
  private mono: boolean;

  constructor(ctx: AudioContextLike, opts: EngineOptions = {}) {
    this.ctx = ctx;
    this.loader = opts.loader;
    this.view = opts.view ?? { centreX: 60, halfSpanYd: 60 };
    this.mono = opts.mono ?? false;
    this.masterSetting = { ...DEFAULT_SETTING, ...opts.settings?.master };
    this.master = ctx.createGain();
    this.master.gain.setValueAtTime(this.masterSetting.on ? gainFromPct(this.masterSetting.volumePct) : 0, ctx.currentTime);
    this.master.connect(ctx.destination);
    for (const b of MIX_BUSES) {
      const setting = { ...DEFAULT_SETTING, ...opts.settings?.[b] };
      const volume = ctx.createGain();
      const duck = ctx.createGain();
      volume.gain.setValueAtTime(setting.on ? gainFromPct(setting.volumePct) : 0, ctx.currentTime);
      duck.gain.setValueAtTime(1, ctx.currentTime);
      volume.connect(duck);
      duck.connect(this.master);
      this.buses.set(b, { volume, duck, setting });
    }
    for (const s of opts.sounds ?? []) this.register(s);
  }

  // ----- registry -----

  register(def: SoundDef): void {
    if (!def.recipe || def.recipe.layers.length === 0) throw new Error(`sound ${def.id}: a recipe with at least one layer is required (MB-18 fallback)`);
    if (!(MIX_BUSES as readonly string[]).includes(def.bus)) throw new Error(`sound ${def.id}: unknown bus ${def.bus}`);
    this.sounds.set(def.id, def);
  }

  has(id: string): boolean { return this.sounds.has(id); }
  sound(id: string): SoundDef | undefined { return this.sounds.get(id); }

  /** Loads and decodes every registered file (sounds and the given beds). A failure leaves the recipe in charge. */
  async preload(extraFiles: readonly string[] = []): Promise<PreloadResult> {
    const files = new Set<string>(extraFiles);
    for (const s of this.sounds.values()) if (s.file) files.add(s.file);
    const result: PreloadResult = { loaded: [], failed: [] };
    for (const f of files) {
      if (this.buffers.has(f)) { result.loaded.push(f); continue; }
      if (!this.loader) { result.failed.push(f); continue; }
      try {
        const bytes = await this.loader.load(f);
        this.buffers.set(f, await this.ctx.decodeAudioData(bytes));
        result.loaded.push(f);
      } catch {
        result.failed.push(f);
      }
    }
    return result;
  }

  // ----- settings -----

  setBus(bus: BusId, setting: BusSetting): void {
    const t = this.ctx.currentTime;
    if (bus === 'master') {
      this.masterSetting = { ...setting };
      this.master.gain.setTargetAtTime(setting.on ? gainFromPct(setting.volumePct) : 0, t, 0.02);
      return;
    }
    const b = this.buses.get(bus)!;
    const wasOn = b.setting.on;
    b.setting = { ...setting };
    b.volume.gain.setTargetAtTime(setting.on ? gainFromPct(setting.volumePct) : 0, t, 0.02);
    if (wasOn && !setting.on) for (const bed of this.beds.values()) if (bed.def.bus === bus) this.silenceBed(bed, 0.05);
    if (!wasOn && setting.on) for (const bed of this.beds.values()) if (bed.def.bus === bus) this.soundBed(bed, 0.05);
  }

  busSetting(bus: BusId): BusSetting { return bus === 'master' ? { ...this.masterSetting } : { ...this.buses.get(bus)!.setting }; }
  busSettings(): Record<BusId, BusSetting> {
    return Object.fromEntries(BUSES.map((b) => [b, this.busSetting(b)])) as Record<BusId, BusSetting>;
  }

  setMono(mono: boolean): void { this.mono = mono; }
  setView(centreX: number, halfSpanYd: number): void { this.view = { centreX, halfSpanYd }; }

  /** Browsers start the context suspended until a user gesture; the shell calls this on the first input. */
  async unlock(): Promise<void> { if (this.ctx.state === 'suspended') await this.ctx.resume(); }

  // ----- one-shot sounds -----

  play(id: string, opts: PlayOptions = {}): PlayOutcome {
    const def = this.sounds.get(id);
    if (!def) return { played: false, reason: 'unknown-sound' };
    if (!this.masterSetting.on) return { played: false, reason: 'master-off' };
    const bus = this.buses.get(def.bus)!;
    if (!bus.setting.on) return { played: false, reason: 'bus-off' };
    if (this.ctx.state === 'suspended') return { played: false, reason: 'suspended' };
    const now = this.ctx.currentTime;
    const asked = opts.when ?? now;
    if (now - asked > LATE_DROP_SECONDS) return { played: false, reason: 'late' };
    const start = Math.max(now, asked);
    if (!this.limiter.allow(def.rateGroup ?? def.id, start, def.minGapMs)) return { played: false, reason: 'rate-limited' };

    const pan = panFor(opts.fieldX, this.view.centreX, this.view.halfSpanYd, this.mono);
    const panner = this.ctx.createStereoPanner();
    panner.pan.setValueAtTime(pan, start);
    panner.connect(bus.volume);
    const level = this.ctx.createGain();
    level.gain.setValueAtTime(Math.max(0, Math.min(1, opts.gain ?? 1)), start);
    level.connect(panner);

    const cents = variantCents(def.recipe, opts.variantDraw);
    const buf = def.file ? this.buffers.get(def.file) : undefined;
    let endsAt: number;
    let sources: ScheduledSourceLike[];
    let source: 'file' | 'synth';
    if (buf) {
      const s = this.ctx.createBufferSource();
      s.buffer = buf;
      if (cents !== 0) s.playbackRate.setValueAtTime(2 ** (cents / 1200), start);
      s.connect(level);
      s.start(start);
      endsAt = start + buf.duration / 2 ** (cents / 1200);
      sources = [s];
      source = 'file';
    } else {
      const v = buildRecipe(this.ctx, def.recipe, level, start, cents);
      endsAt = v.endsAt;
      sources = v.sources;
      source = 'synth';
    }
    const last = sources[sources.length - 1];
    if (last) last.onended = () => { level.disconnect(); panner.disconnect(); };
    if (def.ducksCrowd) this.duckCrowd(start, endsAt);
    return { played: true, source, startsAt: start, endsAt, pan };
  }

  /** MB-10: dips the crowd bus to DUCK_LEVEL from `start` while a ducking sound plays (up to 2.5 s), returning over 1 s. */
  duckCrowd(start: number, end: number): void {
    this.ducker.trigger(start, end);
    const g = this.buses.get('crowd')!.duck.gain;
    g.cancelScheduledValues(start);
    // A ramp, not a jump: if the crowd was returning, this carries the cancelled release on to `start`
    // along the same line, so the re-dip begins from where the crowd really is (no click).
    g.linearRampToValueAtTime(this.ducker.levelAt(start), start);
    for (const p of this.ducker.pointsFrom(start)) if (p.t > start) g.linearRampToValueAtTime(p.level, p.t);
  }

  /** Crowd duck gain the engine has scheduled for time `t` (1 = no dip). */
  crowdDuckAt(t: number): number { return this.ducker.levelAt(t); }

  // ----- beds and loops -----

  /** Starts (or replaces) the bed under `key`. If the bus is off it stays silent until the bus turns on. */
  startBed(key: string, def: BedDef, level = 1, fadeSeconds = DEFAULT_FADE_SECONDS): BedHandle {
    if (!def.recipe && !def.file) throw new Error(`bed ${key}: needs a recipe or a file`);
    const old = this.beds.get(key);
    if (old) this.silenceBed(old, fadeSeconds);
    const state: BedState = { key, def, level: Math.max(0, Math.min(1, level)), out: null, sources: [], source: 'none' };
    this.beds.set(key, state);
    if (this.masterSetting.on && this.buses.get(def.bus)!.setting.on && this.ctx.state !== 'suspended') this.soundBed(state, fadeSeconds);
    return this.handle(state);
  }

  bed(key: string): BedHandle | null { const s = this.beds.get(key); return s ? this.handle(s) : null; }

  private handle(state: BedState): BedHandle {
    const engine = this;
    return {
      key: state.key,
      get source() { return state.source; },
      setLevel(level: number, rampSeconds = DEFAULT_FADE_SECONDS, when?: number) {
        state.level = Math.max(0, Math.min(1, level));
        if (!state.out) return;
        const t = Math.max(engine.ctx.currentTime, when ?? engine.ctx.currentTime);
        state.out.gain.cancelScheduledValues(t);
        state.out.gain.setValueAtTime(state.out.gain.value, t);
        state.out.gain.linearRampToValueAtTime(bedGain(state), t + Math.max(0.01, rampSeconds));
      },
      stop(fadeSeconds = DEFAULT_FADE_SECONDS) {
        engine.silenceBed(state, fadeSeconds);
        if (engine.beds.get(state.key) === state) engine.beds.delete(state.key);
      },
    };
  }

  private soundBed(state: BedState, fadeSeconds: number): void {
    if (state.out) return;
    const t = this.ctx.currentTime;
    const out = this.ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(bedGain(state), t + Math.max(0.01, fadeSeconds));
    out.connect(this.buses.get(state.def.bus)!.volume);
    const buf = state.def.file ? this.buffers.get(state.def.file) : undefined;
    if (buf) {
      const s = this.ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.loopStart = 0;
      s.loopEnd = state.def.loopSeconds !== undefined ? Math.min(state.def.loopSeconds, buf.duration) : buf.duration;
      s.connect(out);
      s.start(t);
      state.sources = [s];
      state.source = 'file';
    } else if (state.def.recipe) {
      state.sources = buildSustained(this.ctx, state.def.recipe, out, t);
      state.source = 'synth';
    } else {
      // File-only bed (music) whose file is missing: silence; music carries no football information.
      state.sources = [];
      state.source = 'none';
    }
    state.out = out;
  }

  private silenceBed(state: BedState, fadeSeconds: number): void {
    const out = state.out;
    if (!out) return;
    const t = this.ctx.currentTime;
    const f = Math.max(0.01, fadeSeconds);
    out.gain.cancelScheduledValues(t);
    out.gain.setValueAtTime(out.gain.value, t);
    out.gain.linearRampToValueAtTime(0, t + f);
    for (const s of state.sources) s.stop(t + f);
    const last = state.sources[state.sources.length - 1];
    if (last) last.onended = () => out.disconnect();
    else out.disconnect();
    state.out = null;
    state.sources = [];
    state.source = 'none';
  }

  /** Stops every bed (leaving a game, closing the app). One-shots finish on their own. */
  stopAllBeds(fadeSeconds = DEFAULT_FADE_SECONDS): void {
    for (const s of [...this.beds.values()]) { this.silenceBed(s, fadeSeconds); this.beds.delete(s.key); }
  }

  /** Length in seconds of a registered sound's synthesized version. */
  recipeSeconds(id: string): number { const d = this.sounds.get(id); return d ? recipeSeconds(d.recipe) : 0; }
}
