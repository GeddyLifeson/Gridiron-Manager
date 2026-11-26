// Captions strip (presentation plan section 7, amendment A-3, O5.5.2, PV-14). A short line names each
// game sound as it plays ("whistle", "crowd noise", "hard count"). The words come from the PV-02 cue
// table, so a sound and its caption cannot drift apart. A silent count is named too: its absence of
// sound is information (J5.6.1).
//
// The strip shows what the engine's events say was heard, whether or not a bus is switched off: with
// sound off, the captions are the sound. It never pauses or slows game time (Marlon, 2026-11-25). Lines
// appear at most three times in any second (the no-flashing rule, ../flash/), so a pile-up of hits is
// one line with a count, not a strobe.
import { CUE_TABLE, cueRow, cueSound } from '../cues/cue-table.ts';
import { FlashGuard } from '../flash/flash.ts';

/**
 * Audio engine sound id (PV-07 recipe) to the PV-02 cue-table sound that carries its caption and visual
 * twin. Three whistle recipes share the one whistle row; the stadium recipes share the stoppage row.
 */
export const RECIPE_CUE_SOUND: Readonly<Record<string, string>> = {
  'crowd.bed': 'crowd_bed',
  'crowd.react.touchdown': 'crowd_touchdown',
  'crowd.react.turnover': 'crowd_turnover',
  'crowd.react.reviewReversal': 'crowd_review_reversal',
  'crowd.react.sack': 'crowd_sack',
  'crowd.react.flagAgainstHome': 'crowd_flag_against_home',
  'crowd.react.bigGain': 'crowd_big_gain',
  'officials.whistle.deadBall': 'whistle',
  'officials.whistle.stoppage': 'whistle',
  'officials.whistle.inadvertent': 'whistle',
  'officials.micTone': 'referee_mic_tone',
  'contact.snap': 'snap_thump',
  'contact.hit.tier1': 'contact_thud_1',
  'contact.hit.tier2': 'contact_thud_2',
  'contact.hit.tier3': 'contact_thud_3',
  'contact.hit.tier4': 'contact_thud_4',
  'contact.ball.catch': 'ball_catch',
  'contact.ball.drop': 'ball_drop',
  'contact.ball.kickFoot': 'kick_foot',
  'contact.ball.postHit': 'post_hit',
  'cadence.voiced': 'cadence_tone',
  'cadence.hard': 'cadence_tone_hard',
  'cadence.relay.clean': 'relay_tone',
  'cadence.relay.garbled': 'relay_tone_broken',
  'ui.playClockTick': 'play_clock_tick',
  'ui.callConfirm': 'call_confirm',
  'ui.hoverTick': 'hover_tick',
  'ui.alert.injury': 'alert_injury',
  'ui.alert.challengeWindow': 'alert_challenge_window',
  'ui.alert.timeout': 'alert_timeout_called',
  'ui.alert.twoMinute': 'alert_two_minute',
  'ambience.paChime': 'stoppage_chime',
  'ambience.bandHit': 'stoppage_chime',
  'ambience.organSting': 'stoppage_chime',
  'ambience.rain': 'rain_bed',
  'ambience.wind': 'wind_bed',
  'ambience.gust': 'wind_bed',
  'ambience.projector': 'projector_run',
};

/** Caption text for an engine sound id or a cue-table sound id; null if the sound is unknown. */
export function captionForSound(id: string): string | null {
  return cueSound(RECIPE_CUE_SOUND[id] ?? id)?.caption ?? null;
}

/** Caption for a cue-table row that carries no sound (a silent count). */
export function captionForRow(rowId: string): string | null {
  const r = cueRow(rowId);
  if (!r) return null;
  return r.caption ?? r.sounds[0]?.caption ?? null;
}

export type CaptionsMode = 'auto' | 'on' | 'off';

/** `auto` shows the strip whenever the player would hear nothing: master off or at zero (plan 7). */
export function captionsVisible(mode: CaptionsMode, audio: { masterOn: boolean; masterVolumePct: number }): boolean {
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  return !audio.masterOn || audio.masterVolumePct <= 0;
}

/** Assumption (presentation tuning, no football fact): how long a line stays, and how many show. */
export const CAPTION_HOLD_MS = 2500;
export const CAPTION_MAX_LINES = 3;

export interface CaptionLine {
  readonly text: string;
  /** How many times the same sound repeated while the line was up (a pile-up of hits is one line). */
  readonly count: number;
  readonly fromMs: number;
  readonly untilMs: number;
}

interface Pending { text: string; atMs: number }

/**
 * The strip's state. Times are display ms from the caller (the engine event's playback time); the strip
 * has no clock of its own and draws no random numbers.
 */
export class CaptionStrip {
  private shown: CaptionLine[] = [];
  private pending: Pending[] = [];
  private readonly guard = new FlashGuard();
  private lastOnsetMs = -Infinity;

  constructor(private readonly holdMs: number = CAPTION_HOLD_MS, private readonly maxLines: number = CAPTION_MAX_LINES) {}

  /** A sound started. Returns false if the id has no caption. */
  sound(id: string, atMs: number): boolean {
    const text = captionForSound(id);
    if (text === null) return false;
    this.add(text, atMs);
    return true;
  }

  /** A cue-table row fired that may carry no sound (a silent count). */
  row(rowId: string, atMs: number): boolean {
    const text = captionForRow(rowId);
    if (text === null) return false;
    this.add(text, atMs);
    return true;
  }

  private add(text: string, atMs: number): void {
    this.advance(atMs);
    const same = this.shown.find((l) => l.text === text && l.untilMs > atMs);
    if (same) {
      // A repeat extends the line and bumps its count: text changes, but no line appears or vanishes.
      this.shown = this.shown.map((l) => (l === same ? { ...l, count: l.count + 1, untilMs: atMs + this.holdMs } : l));
      return;
    }
    const queued = this.pending.find((p) => p.text === text);
    if (queued) return;
    this.pending.push({ text, atMs });
    this.advance(atMs);
  }

  /** Moves time on: expires lines, and shows queued lines when the no-flashing limit allows. */
  advance(nowMs: number): void {
    this.shown = this.shown.filter((l) => l.untilMs > nowMs);
    while (this.pending.length > 0) {
      const p = this.pending[0]!;
      if (nowMs - p.atMs >= this.holdMs) { this.pending.shift(); continue; }
      // Lines appear in order, so the next onset is never before the last one.
      const at = this.guard.nextAllowed('strip', Math.max(p.atMs, this.lastOnsetMs));
      if (at > nowMs) break;
      this.guard.allow('strip', at);
      this.lastOnsetMs = at;
      this.pending.shift();
      this.shown.push({ text: p.text, count: 1, fromMs: at, untilMs: at + this.holdMs });
      if (this.shown.length > this.maxLines) this.shown = this.shown.slice(this.shown.length - this.maxLines);
    }
  }

  /** Lines on screen at `nowMs`, oldest first. */
  lines(nowMs: number): readonly CaptionLine[] {
    this.advance(nowMs);
    return this.shown.filter((l) => l.fromMs <= nowMs);
  }

  clear(): void { this.shown = []; this.pending = []; this.guard.reset(); this.lastOnsetMs = -Infinity; }
}

/** Display text of a line: "hard contact x3" for repeats. */
export function lineText(l: CaptionLine): string {
  return l.count > 1 ? `${l.text} x${l.count}` : l.text;
}

/** Every caption the table defines (for the settings preview and tests). */
export function allCaptions(): string[] {
  const out = new Set<string>();
  for (const r of CUE_TABLE.rows) {
    for (const s of r.sounds) out.add(s.caption);
    if (r.caption) out.add(r.caption);
  }
  return [...out];
}
