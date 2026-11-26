// Event cue table (PV-02, O5.5.2, O6.4.1, MB-1, MB-7, MB-20). Data, not code: the rows live in
// cue-table.json. One row per presentation feed cue kind (PV-00) plus the non-feed cues of plan 4.2.
// Each row names the football information it carries, its visual, its sounds (each with a caption),
// the setting that switches it, and the era variants (plan 2.1). This file adds types, lookups and the
// one-voice lane scheduler that PV-06 (audio engine) and PV-04/05 (cues, banners) call.
import table from './cue-table.json' with { type: 'json' };

export type CueWhere = 'field' | 'strip' | 'banner' | 'console' | 'film';
export type CueTiming = 'event_tick' | 'whistle_tick' | 'play_level' | 'ui_event' | 'state';
export type Lane = 'none' | 'crowdReaction' | 'stinger';
export type AudioBus = 'master' | 'crowd' | 'officials' | 'contact' | 'cadence' | 'ui' | 'ambience' | 'music';

export interface CueVisual {
  readonly cue: string;
  readonly where: CueWhere;
  /** Settings key that switches this visual (O5.5.2 MB-17: each field cue has its own switch). */
  readonly switch: string;
  readonly reducedMotion: 'still' | 'same' | 'half_and_still';
}

export interface CueSound {
  readonly id: string;
  readonly bus: AudioBus;
  readonly lane: Lane;
  /** Lower number wins inside a lane. 0 when the lane is `none`. */
  readonly rank: number;
  readonly durationMs: number;
  readonly pan: boolean;
  readonly duckCrowd: boolean;
  readonly rateLimitMs: number;
  readonly defaultOn: boolean;
  /** Text shown on the captions strip (O5.3.2 A-3) while this sound plays. */
  readonly caption: string;
  readonly condition?: string;
  readonly filmOnly?: boolean;
  readonly classicOnly?: boolean;
}

export interface CueEra {
  readonly plain: string;
  readonly classic: string;
  /** A condition that must be cleared before the classic variant may ship on. */
  readonly gate?: string;
}

export interface CueRow {
  readonly id: string;
  readonly source: { readonly kind: 'feed' | 'state' | 'ui' | 'game_event' | 'film'; readonly feedKind: string; readonly qualifier: string | null };
  readonly phase: 'v1' | 'v2';
  readonly timing: CueTiming;
  readonly bible: readonly string[];
  readonly information: string;
  readonly visual: CueVisual;
  readonly sounds: readonly CueSound[];
  /** Caption for a row with no sound (a silent count is still named). */
  readonly caption?: string | null;
  readonly era: CueEra;
  readonly deferred?: boolean;
  readonly open?: string;
  readonly threshold?: null;
}

export interface LaneRule { readonly exclusive: boolean; readonly maxWaitMs: number; readonly note: string }
export interface CueTable {
  readonly formatVersion: 1;
  readonly visibility: 'user-visible';
  readonly lanes: Readonly<Record<Exclude<Lane, 'none'>, LaneRule>>;
  readonly rows: readonly CueRow[];
}

export const CUE_TABLE = table as unknown as CueTable;

/** The cue kinds the PV-00 feed emits (`FEED_CUE_KINDS`), split by how a row id is made. */
export const FEED_CAMERA_KINDS = ['snap', 'throw', 'catch', 'drop', 'tackle', 'fumble', 'flag', 'whistle', 'outOfBounds', 'kickLanding'] as const;
/** Kicked-ball kinds (PV-00 `KICK_CUE_KINDS`): the foot meeting the ball and a goal-post strike. */
export const FEED_KICK_KINDS = ['kick', 'postHit'] as const;
export const FEED_CONTACT_TIERS = [1, 2, 3, 4] as const;
export const FEED_CADENCE_COUNTS = ['voiced', 'hard', 'silent'] as const;
export const FEED_RELAY_OUTCOMES = ['clean', 'garbled'] as const;
export const FEED_RULINGS = ['touchdown', 'field_goal_good', 'field_goal_missed', 'safety', 'try_good', 'try_failed', 'interception', 'fumble_lost', 'turnover_on_downs', 'sack', 'incomplete', 'first_down', 'touchback', 'penalty', 'review_upheld', 'review_reversed'] as const;

/** Row id the table uses for a feed cue. `detail` is the contact tier, count, outcome or ruling. */
export function cueRowId(kind: string, detail?: string | number): string {
  if (kind === 'contact') return `contact_${detail}`;
  if (kind === 'cadence') return `cadence_${detail}`;
  if (kind === 'relay') return `relay_${detail}`;
  if (kind === 'ruling') return `ruling_${detail}`;
  if (kind === 'postHit') return 'post_hit';
  return kind;
}

const BY_ID = new Map(CUE_TABLE.rows.map((r) => [r.id, r] as const));
export function cueRow(id: string): CueRow | undefined { return BY_ID.get(id); }

const SOUNDS = new Map<string, CueSound>();
for (const r of CUE_TABLE.rows) for (const s of r.sounds) SOUNDS.set(s.id, s);
export function cueSound(id: string): CueSound | undefined { return SOUNDS.get(id); }

export interface SoundRequest { readonly soundId: string; readonly tickMs: number }
export interface ScheduledSound { readonly soundId: string; readonly startMs: number; readonly endMs: number; readonly lane: Exclude<Lane, 'none'> }

/**
 * One-voice lane scheduling (MB-7, PV-02 "stingers never overlap"). Requests are sounds firing at engine
 * times in ms. Inside one lane at most one sound sounds at a time: a request with a better (lower) rank
 * cuts the sounding one short at its own start; an equal or worse rank waits until the lane is free if the
 * wait is within the lane's `maxWaitMs`, and is dropped otherwise. Sounds with lane `none` are not scheduled
 * here. Pure and deterministic: the same requests give the same result.
 */
export function scheduleLane(lane: Exclude<Lane, 'none'>, requests: readonly SoundRequest[]): ScheduledSound[] {
  const rule = CUE_TABLE.lanes[lane];
  const out: ScheduledSound[] = [];
  const sorted = requests
    .map((r, i) => ({ r, i, s: SOUNDS.get(r.soundId) }))
    .filter((x): x is { r: SoundRequest; i: number; s: CueSound } => !!x.s && x.s.lane === lane)
    .sort((a, b) => a.r.tickMs - b.r.tickMs || a.s.rank - b.s.rank || a.i - b.i);
  for (const { r, s } of sorted) {
    // A queued sound that has not started yet and is worse than this one is replaced by it.
    for (let last = out[out.length - 1]; last && last.startMs >= r.tickMs && s.rank < SOUNDS.get(last.soundId)!.rank; last = out[out.length - 1]) out.pop();
    const last = out[out.length - 1];
    if (!last || r.tickMs >= last.endMs) { out.push({ soundId: s.id, startMs: r.tickMs, endMs: r.tickMs + s.durationMs, lane }); continue; }
    if (s.rank < SOUNDS.get(last.soundId)!.rank && last.startMs < r.tickMs) { out[out.length - 1] = { ...last, endMs: r.tickMs }; out.push({ soundId: s.id, startMs: r.tickMs, endMs: r.tickMs + s.durationMs, lane }); continue; }
    if (rule.maxWaitMs > 0 && last.endMs - r.tickMs <= rule.maxWaitMs) out.push({ soundId: s.id, startMs: last.endMs, endMs: last.endMs + s.durationMs, lane });
  }
  return out;
}
