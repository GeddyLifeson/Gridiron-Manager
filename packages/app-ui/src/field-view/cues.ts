// Event cues (I9.1.2, O2.3.4, O6.4.1; PV-04: MB-1, MB-2, MB-17). Every cue comes from one engine event
// at that event's tick and spot; nothing else makes a cue (MB-1). Contact bars come from the feed's
// contact cues and carry the engine's tier, never a tier of their own (MB-2). The fumble's old `flash`
// is a loose-ball ring (plan A-4, cue table row `fumble`). Each cue has its own settings switch, read
// from the PV-02 cue table (MB-17). Onsets pass the PV-14 flash limiter so no cue shape flashes more
// than three times in any one second at any playback speed (WCAG 2.3.1, plan section 7).
// A cue lasts `cueSeconds` of playback at real speed, so it lasts the same number of ticks at any speed.
import { param } from './params.ts';
import { cueRow, cueRowId } from '../presentation/cues/cue-table.ts';
import { FlashGuard, FLASH_RULE } from '../presentation/flash/flash.ts';
import type { FilmEvent, FilmEventKind } from './types.ts';

export type CueShape = 'passLine' | 'ring' | 'openRing' | 'cross' | 'looseRing' | 'flag' | 'whistle' | 'boundary' | 'contact' | 'kickMark' | 'postMark';

/** Event kind to the cue drawn for it. `snap` and `kickLanding` draw nothing (the snap is the motion starting; the landing spot only frames the camera). */
export const CUE_FOR: Readonly<Record<FilmEventKind, CueShape | null>> = {
  snap: null,
  throw: 'passLine',
  catch: 'ring',
  drop: 'openRing',
  tackle: 'cross',
  fumble: 'looseRing',
  flag: 'flag',
  whistle: 'whistle',
  outOfBounds: 'boundary',
  kickLanding: null,
};

/** Contact tiers of J6 amendment A-5: 1 light to 4 heavy. */
export type ContactTier = 1 | 2 | 3 | 4;

/**
 * A contact as the presentation feed gives it (`ContactCue` of PV-00, structural copy: app-ui reads
 * only the public entry of app-services). How hard the hit looked, not who won (I9.3.2).
 */
export interface FieldContact {
  readonly kind: 'contact';
  readonly tick: number;
  readonly x: number;
  readonly y: number;
  readonly tier: ContactTier;
  readonly slots: readonly number[];
}

/**
 * A kicked-ball event as the presentation feed gives it (`KickCue` and `PostHitCue` of PV-00, structural
 * copy): the foot meeting the ball, or the ball striking an upright or the crossbar.
 */
export interface FieldKick {
  readonly kind: 'kick' | 'postHit';
  readonly tick: number;
  readonly x: number;
  readonly y: number;
  /** The kicker's slot on a kick, when the feed names one. */
  readonly slots?: readonly number[];
}

/** Kicked-ball kind to the cue drawn for it (cue table rows `kick` -> `kick_mark`, `post_hit` -> `post_hit_mark`). */
export const KICK_CUE_FOR: Readonly<Record<FieldKick['kind'], CueShape>> = { kick: 'kickMark', postHit: 'postMark' };

export interface Cue {
  readonly shape: CueShape;
  readonly event: FilmEvent | FieldContact | FieldKick;
  readonly fromTick: number;
  readonly toTick: number;
  /** The engine's tier, on contact cues only. */
  readonly tier?: ContactTier;
  /** The settings key that turns this cue off (cue table `visual.switch`). */
  readonly switchKey: string;
}

/** Settings switches by cue-table key; a key that is missing counts as on. */
export type CueSwitches = Readonly<Record<string, boolean>>;

/** The cue table's switch for an event kind (and contact tier). Throws if the table has no row. */
export function cueSwitch(kind: FilmEventKind | 'contact' | FieldKick['kind'], tier?: ContactTier): string {
  const row = cueRow(cueRowId(kind, tier));
  if (!row) throw new Error(`cue table has no row for ${kind}${tier ? ` tier ${tier}` : ''}`);
  return row.visual.switch;
}

/** Builds the cue list once per play, sorted by start tick. */
export function buildCues(events: readonly FilmEvent[], ticksPerSecond: number, contacts: readonly FieldContact[] = [], kicks: readonly FieldKick[] = []): Cue[] {
  const len = param('cueSeconds') * ticksPerSecond;
  const out: Cue[] = [];
  for (const e of events) {
    const shape = CUE_FOR[e.kind];
    if (shape) out.push({ shape, event: e, fromTick: e.tick, toTick: e.tick + len, switchKey: cueSwitch(e.kind) });
  }
  for (const c of contacts) {
    if (![1, 2, 3, 4].includes(c.tier)) throw new Error(`contact tier ${String(c.tier)} is not 1 to 4`);
    out.push({ shape: 'contact', event: c, fromTick: c.tick, toTick: c.tick + len, tier: c.tier, switchKey: cueSwitch('contact', c.tier) });
  }
  for (const k of kicks) {
    const shape = KICK_CUE_FOR[k.kind];
    if (!shape) throw new Error(`no cue for kicked-ball kind ${String(k.kind)}`);
    out.push({ shape, event: k, fromTick: k.tick, toTick: k.tick + len, switchKey: cueSwitch(k.kind) });
  }
  return out.sort((a, b) => a.fromTick - b.fromTick);
}

/** Cues whose switch is on. */
export function switchedOn(cues: readonly Cue[], switches: CueSwitches | undefined): Cue[] {
  return switches ? cues.filter((c) => switches[c.switchKey] !== false) : [...cues];
}

/**
 * Drops onsets the flash limiter refuses at a playback speed. Per shape, an onset is a moment when that
 * shape appears with none of it already showing (a cue that starts while the same shape is still on
 * screen extends the showing, it does not flash). Onsets at the same tick are one flash. Times are
 * display ms: tick / ticksPerSecond / speed. A refused onset's cues are not drawn; the rest keep their
 * engine ticks (nothing is moved in time, MB-1).
 */
export function limitFlashes(cues: readonly Cue[], ticksPerSecond: number, speed = 1): { kept: Cue[]; dropped: Cue[] } {
  // The guard counts onsets; the rule counts changes (on and off). Widening the guard's window by one cue's
  // display life keeps the earlier flash's off-change out of any second that holds three later onsets,
  // so no one-second window ever holds more than six changes.
  const cueMs = (param('cueSeconds') / speed) * 1000;
  const guard = new FlashGuard(FLASH_RULE.maxFlashesPerSecond, FLASH_RULE.windowMs + cueMs);
  const showingUntil = new Map<CueShape, number>();
  const decided = new Map<string, boolean>();
  const kept: Cue[] = [], dropped: Cue[] = [];
  for (const c of cues) {
    const key = `${c.shape}@${c.fromTick}`;
    let ok = decided.get(key);
    if (ok === undefined) {
      const until = showingUntil.get(c.shape) ?? -Infinity;
      ok = c.fromTick < until ? true : guard.allow(c.shape, (c.fromTick / ticksPerSecond / speed) * 1000);
      decided.set(key, ok);
    }
    if (ok) { kept.push(c); showingUntil.set(c.shape, Math.max(showingUntil.get(c.shape) ?? -Infinity, c.toTick)); }
    else dropped.push(c);
  }
  return { kept, dropped };
}

/** Cues showing at tick time `t`. Writes into `out` and returns how many. */
export function activeCues(cues: readonly Cue[], t: number, out: Cue[]): number {
  let n = 0;
  for (const c of cues) {
    if (c.fromTick > t) break;
    if (t < c.toTick) out[n++] = c;
  }
  return n;
}

/** Display seconds a cue stays on screen at a playback speed. */
export function cueDisplaySeconds(speed: number): number {
  return param('cueSeconds') / speed;
}
