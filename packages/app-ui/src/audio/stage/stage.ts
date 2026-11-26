// The sound stage: the composition step that starts the sound stack and keeps it in step with the app.
// One object owns the PV-06 engine and every driver on it, and the PV-14 captions strip:
//
// - the engine is built from the G-98 settings (eight bus volumes and switches, mono) and follows
//   every later change (`applySettings`);
// - menu music (PV-11) follows the open screen (`setPlace`): off by default, and never on a game or
//   film screen or anywhere while a game is on (`menuTrackFor` decides);
// - each play's PV-00 presentation feed (`play`) drives the crowd (PV-08), the cadence and relay
//   (PV-09), the weather (PV-10) and the field sounds (snap, ball, whistle, contact tier, mic tone);
// - every sound the feed asks for is named on the captions strip at its engine tick, whether or not
//   its bus is on: with sound off, the captions are the sound (PV-14).
//
// Times are the audio clock in seconds (`engine.ctx.currentTime`); captions use the same clock in ms.
// Nothing here reads platform random or the wall clock: pitch variety comes from the play's
// `cosmetic.audio` draw, handed in by the host.

import {
  AudioEngine, BUSES, busSettingsFrom, createMusicOutput, monoFrom,
  type AssetLoader, type AudioContextLike, type PlayOutcome,
} from '../engine/index.ts';
import { toSoundDefs } from '../recipes/index.ts';
import { CrowdDriver, type CrowdFeed, type CrowdPlayReport } from '../crowd/index.ts';
import { CadenceDriver, linearTickClock, type CadenceEvent, type CadenceFeedLike, type TickClock } from '../cadence/index.ts';
import { AmbienceDriver, bedLevels, type AmbienceConditions, type StoppageSting } from '../ambience/index.ts';
import { MenuMusic, type MusicTrackId } from '../music/menu-music.ts';
import { CaptionStrip, captionsVisible, type CaptionLine, type CaptionsMode } from '../../presentation/captions/captions.ts';
import { cueRowId } from '../../presentation/cues/cue-table.ts';
import { FieldSoundDriver, type FieldEvent, type FieldFeedLike } from './field-sounds.ts';

/** Reads one settings value, or undefined when the key does not exist. Never throws. */
export type SettingsGetter = (key: string) => unknown;

/** One play's PV-00 feed, as the stage reads it (the app-services `PresentationFeed` fits). */
export type StageFeed = CrowdFeed & CadenceFeedLike & FieldFeedLike & {
  readonly conditions: { readonly noise: number | null } & AmbienceConditions;
};

/** Where the user is, for menu music. */
export interface StagePlace {
  /** Hub of the open screen, or 'title' before the shell loads. */
  hub: string;
  /** True from kickoff to the final whistle on game day, on every screen. */
  inGame: boolean;
  /** The calendar is in the offseason. */
  offseason: boolean;
}

export interface SoundStageOptions {
  ctx: AudioContextLike;
  settings: SettingsGetter;
  /** Loads recorded files (music renders). Without one every sound is its synthesized recipe and music is silent. */
  loader?: AssetLoader;
  /** Look-ahead for scheduling cues on their ticks, seconds. */
  lookaheadSeconds?: number;
}

export interface PlayHandover {
  /** Audio-clock time of the play's tick 0 (the snap or kick). Default: just after the play's first cue can sound. */
  tick0At?: number;
  /** Draws in [0, 1) from the play's `cosmetic.audio` stream (app-services `cosmeticFactory`). */
  audioDraw?: () => number;
}

/** What one `frame` did (tests and the debug overlay read it). */
export interface FrameReport { cadence: CadenceEvent[]; field: FieldEvent[] }

/** Lead before the first cue of a play when the host gives no tick-0 time, seconds. */
export const DEFAULT_LEAD_SECONDS = 0.1;

/** Outcomes that still mean the player would have heard the sound with sound on: these get a caption. */
function heard(o: PlayOutcome | { played: false; reason: string }): boolean {
  return o.played || o.reason === 'bus-off' || o.reason === 'master-off' || o.reason === 'suspended' || o.reason === 'rate-limited';
}

interface PendingCaption { atMs: number; sound?: string; row?: string }

export class SoundStage {
  readonly engine: AudioEngine;
  readonly crowd: CrowdDriver;
  readonly cadence: CadenceDriver;
  readonly ambience: AmbienceDriver;
  readonly field: FieldSoundDriver;
  readonly music: MenuMusic;
  readonly captions = new CaptionStrip();
  private readonly musicOut: ReturnType<typeof createMusicOutput>;
  private settings: SettingsGetter;
  private captionsMode: CaptionsMode = 'auto';
  private musicOn = false;
  private place: StagePlace = { hub: 'title', inGame: false, offseason: false };
  private feed: StageFeed | null = null;
  private clock: TickClock | null = null;
  private draw: (() => number) | undefined;
  private liveFrom = 0;
  private liveUntil = 0;
  private lastConditions: AmbienceConditions | null = null;
  private weather = { wind: false, rain: false };
  private pending: PendingCaption[] = [];
  private gameOn = false;

  constructor(opts: SoundStageOptions) {
    const get = opts.settings;
    this.settings = get;
    this.engine = new AudioEngine(opts.ctx, { sounds: toSoundDefs(), settings: busSettingsFrom(get), mono: monoFrom(get), ...(opts.loader ? { loader: opts.loader } : {}) });
    const look = opts.lookaheadSeconds ?? 0.2;
    this.crowd = new CrowdDriver(this.engine);
    this.cadence = new CadenceDriver({ engine: this.engine, lookaheadSeconds: look, draw: () => this.draw?.() ?? 0 });
    this.ambience = new AmbienceDriver(this.engine);
    this.field = new FieldSoundDriver(this.engine, look);
    this.musicOut = createMusicOutput(this.engine);
    this.music = new MenuMusic(this.musicOut);
    this.readLocal(get);
  }

  private readLocal(get: SettingsGetter): void {
    const mode = get('accessibility.captions');
    this.captionsMode = mode === 'on' || mode === 'off' ? mode : 'auto';
    this.musicOn = get('audio.menuMusicOn') === true;
  }

  // ----- settings and place -----

  /** Re-reads every audio and caption setting. Call after any settings change. */
  applySettings(get: SettingsGetter = this.settings): void {
    this.settings = get;
    const buses = busSettingsFrom(get);
    for (const b of BUSES) this.engine.setBus(b, buses[b]);
    this.engine.setMono(monoFrom(get));
    this.readLocal(get);
    this.updateMusic();
  }

  /** The open screen changed (or a game started or ended). Starts and ends the game's sound with it. */
  setPlace(place: StagePlace): void {
    const was = this.place.inGame;
    this.place = { ...place };
    if (place.inGame && !was) this.startGame();
    if (!place.inGame && was) this.endGame();
    this.updateMusic();
  }

  /** The loop playing now, or null. */
  get musicTrack(): MusicTrackId | null { return this.music.playing; }

  private updateMusic(): void {
    this.music.update({ ...this.place, enabled: this.musicOn });
  }

  // ----- the game -----

  get inGame(): boolean { return this.gameOn; }

  private startGame(): void {
    this.gameOn = true;
    this.crowd.startGame();
    this.captions.clear();
    this.pending = [];
  }

  private endGame(): void {
    this.gameOn = false;
    this.crowd.endGame();
    this.ambience.stop();
    this.cadence.reset();
    this.field.reset();
    this.feed = null;
    this.clock = null;
    this.lastConditions = null;
    this.weather = { wind: false, rain: false };
  }

  /**
   * Hands over the next play's feed, before its first cue. Sets the crowd bed and reaction, eases the
   * weather beds, and arms the cadence and field sounds to play on their ticks as `frame` runs.
   */
  play(feed: StageFeed, handover: PlayHandover = {}): CrowdPlayReport {
    if (!this.gameOn) this.setPlace({ ...this.place, inGame: true });
    const now = this.engine.ctx.currentTime;
    const tps = feed.ticksPerSecond;
    const first = feed.cues.length ? Math.min(0, ...feed.cues.map((c) => c.tick)) : 0;
    const tick0At = handover.tick0At ?? now + DEFAULT_LEAD_SECONDS - first / tps;
    this.feed = feed;
    this.clock = linearTickClock(tick0At, tps);
    this.draw = handover.audioDraw;
    this.cadence.reset();
    this.field.reset();
    this.liveFrom = tick0At;
    this.liveUntil = feed.cues.length ? Math.max(tick0At, ...feed.cues.map((c) => this.clock!(c.tick))) : tick0At;

    const report = this.crowd.play(feed, { tick0At, ...(handover.audioDraw ? { audioDraw: handover.audioDraw } : {}) });
    const r = report.reaction;
    if (r && (r.decision === 'play' || r.decision === 'cut') && r.outcome && heard(r.outcome)) this.caption({ sound: r.pick.soundId, atMs: r.at * 1000 });

    this.ambience.setPlayLive(false);
    const c = feed.conditions;
    this.lastConditions = c;
    this.ambience.update(c, now);
    const beds = bedLevels(c);
    if (beds.wind > 0 && !this.weather.wind) this.caption({ sound: 'ambience.wind', atMs: now * 1000 });
    if (beds.rain > 0 && !this.weather.rain) this.caption({ sound: 'ambience.rain', atMs: now * 1000 });
    this.weather = { wind: beds.wind > 0, rain: beds.rain > 0 };
    const gustDraw = handover.audioDraw?.();
    if (this.ambience.gust(c, { when: tick0At, ...(gustDraw !== undefined ? { variantDraw: gustDraw } : {}) })) this.caption({ sound: 'ambience.gust', atMs: tick0At * 1000 });
    return report;
  }

  /** A stoppage sting (PA chime). Refused during a live play, and organ and band while their period fact is unverified. */
  stoppage(kind: StoppageSting): boolean {
    const now = this.engine.ctx.currentTime;
    const ok = this.ambience.stoppage(kind, this.draw ? { variantDraw: this.draw() } : {});
    if (ok) this.caption({ sound: kind === 'paChime' ? 'ambience.paChime' : kind === 'bandHit' ? 'ambience.bandHit' : 'ambience.organSting', atMs: now * 1000 });
    return ok;
  }

  /** Call every animation frame (or at least every few hundred ms) with the audio clock. */
  frame(now: number = this.engine.ctx.currentTime): FrameReport {
    this.crowd.pump(now);
    let cadence: CadenceEvent[] = [];
    let field: FieldEvent[] = [];
    if (this.feed && this.clock) {
      this.ambience.setPlayLive(now >= this.liveFrom && now <= this.liveUntil);
      cadence = this.cadence.update(this.feed, this.clock, now);
      for (const e of cadence) {
        if (e.soundId !== null && heard(e.outcome)) this.caption({ sound: e.soundId, atMs: e.at * 1000 });
        else if (e.outcome.played === false && e.outcome.reason === 'silent-count') this.caption({ row: cueRowId('cadence', 'silent'), atMs: e.at * 1000 });
      }
      field = this.field.update(this.feed, this.clock, now, this.draw);
      for (const e of field) if (heard(e.outcome)) this.caption({ sound: e.soundId, atMs: e.at * 1000 });
    }
    this.flushCaptions(now * 1000);
    return { cadence, field };
  }

  // ----- captions -----

  private caption(c: PendingCaption): void { this.pending.push(c); }

  private flushCaptions(nowMs: number): void {
    if (this.pending.length === 0) return;
    const due = this.pending.filter((p) => p.atMs <= nowMs).sort((a, b) => a.atMs - b.atMs);
    if (due.length === 0) return;
    this.pending = this.pending.filter((p) => p.atMs > nowMs);
    for (const p of due) {
      if (p.sound) this.captions.sound(p.sound, p.atMs);
      else if (p.row) this.captions.row(p.row, p.atMs);
    }
  }

  /** Caption lines on screen at `nowMs` (audio clock, ms). */
  captionLines(nowMs: number = this.engine.ctx.currentTime * 1000): readonly CaptionLine[] {
    this.flushCaptions(nowMs);
    return this.captions.lines(nowMs);
  }

  /** Whether the strip shows: always, never, or (auto) when the player would hear nothing. */
  get captionsShown(): boolean {
    const m = this.engine.busSetting('master');
    return captionsVisible(this.captionsMode, { masterOn: m.on, masterVolumePct: m.volumePct });
  }

  // ----- lifecycle -----

  /**
   * Browsers keep audio suspended until the first click or key. Call on the first input. Beds started
   * while suspended made no nodes, so they are started again here: the music loop, the crowd bed (it
   * takes the next play's level) and the weather.
   */
  async unlock(): Promise<void> {
    const wasSuspended = this.engine.ctx.state === 'suspended';
    await this.engine.unlock();
    if (!wasSuspended) return;
    const track = this.music.playing;
    if (track !== null) {
      this.musicOut.stop();
      this.music.update({ ...this.place, enabled: false });
      this.updateMusic();
    }
    if (this.gameOn) {
      this.crowd.startGame();
      this.ambience.stop();
      if (this.lastConditions) this.ambience.update(this.lastConditions);
    }
  }

  /** Stops every bed (closing the app). */
  dispose(): void {
    this.music.update({ ...this.place, enabled: false });
    this.engine.stopAllBeds(0.1);
  }
}
