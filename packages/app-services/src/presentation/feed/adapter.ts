// PV-00: play record to presentation feed. A reviewed bridge (K9.3.1 rule 4): it reads the engine's
// truth record only through the film filter's camera list (`publicEvents`, G-63), so the live game and
// the film room show the same events, and it reads rulings only from the called result. What it hands
// out is the PresentationFeed shape (types.ts), which holds no truth field.
//
// Sources the engine and officiating do not publish yet arrive as `PresentationExtras`, the exact
// fields asked for in change requests CR-PV00-1 to CR-PV00-5. When a request lands, the integrator
// fills `extras` from the record and nothing downstream changes.
import type { CalledPlay, Environment, PlayByPlayRow, PlayOutcome, PlayRecord, PlayTruth, SeriesState, TrajectoryRecord } from '@gm/schema';
import { registerBridge } from '../../observer/index.ts';
import { publicEvents } from '../../read-models/film/chart.ts';
import type { FilmSource, FilmSourceSlot } from '../../read-models/film/types.ts';
import {
  FEED_FORMAT_VERSION, type CameraCue, type FeedCue, type KickCue, type PostHitCue, type FeedSide, type FeedSource, type PresentationFeed, type RulingCue, type RulingKind,
} from './types.ts';

registerBridge({
  name: 'presentation.feed',
  leaf: 'I9.3.2; O6.4.1; J6 A-5; J5.6.1 A-5; J12.6.1 MB-6',
  module: 'app-services/src/presentation/feed/adapter.ts',
  whitelistTest: 'packages/app-services/test/presentation/feed/adapter.test.ts',
});

/** A contact as CR-PV00-2 asks the tick resolver to publish it: when, where, how hard, who. */
export interface ExtraContact { readonly t: number; readonly tier: 1 | 2 | 3 | 4; readonly x: number; readonly y: number; readonly playerIds: readonly number[] }
/** A pre-snap communication event as CR-PV00-3 asks the pre-snap phase to publish it. */
export interface ExtraPresnap {
  readonly t: number;
  readonly side: FeedSide;
  readonly kind: 'cadence_voiced' | 'cadence_hard' | 'cadence_silent' | 'relay_clean' | 'relay_garbled';
}

/**
 * A goal-post strike as CR-PV00-7 asks the kick resolver to publish it. The resolver already computes
 * `hit: 'upright' | 'crossbar'` (engine-core ball/kicks.ts); the request is to put it, with the time and
 * the spot, on the play record. Public: everyone in the stadium hears and sees the ball ring off the post.
 */
export interface ExtraPostHit { readonly t: number; readonly x: number; readonly y: number; readonly part: 'upright' | 'crossbar' }

/** The fields CR-PV00-1 to CR-PV00-4 and CR-PV00-7 add to the play record, all public. Absent until each lands. */
export interface PresentationExtras {
  /** CR-PV00-1: the J12.6.1 `noise` the engine used for this play. */
  readonly noise?: number;
  /** CR-PV00-1: wind at the snap of this play (the game state's environment changes by quarter). */
  readonly wind?: { readonly mph: number; readonly dirDeg: number; readonly gustMph: number };
  /** CR-PV00-2: contact tiers (J6 A-5). */
  readonly contacts?: readonly ExtraContact[];
  /** CR-PV00-3: cadence and relay events (J5.6.1 A-5, J5.1.3, I2.4.1). */
  readonly presnap?: readonly ExtraPresnap[];
  /** CR-PV00-4: when each called flag was thrown, by index into `called.fouls`. */
  readonly flagsThrown?: readonly { readonly foulIndex: number; readonly t: number }[];
  /** CR-PV00-7: the kicked ball struck an upright or the crossbar. An empty list once it lands means no strike. */
  readonly postHits?: readonly ExtraPostHit[];
}

/** The parts of a play record the adapter reads. A full `PlayRecord` fits. */
export type FeedRecord = Pick<PlayRecord, 'gameId' | 'index' | 'scoreAfter'> & {
  readonly truth: PlayTruth;
  readonly called: Pick<CalledPlay, 'fouls'>;
  readonly final: PlayOutcome;
  readonly seriesAfter: Pick<SeriesState, 'firstDownAwarded' | 'turnoverOnDowns'>;
};

export interface FeedInput {
  readonly record: FeedRecord;
  readonly ticksPerSecond: number;
  /** The trajectory of the play (only the first frame is read, for the snap spot). */
  readonly trajectory: TrajectoryRecord;
  /** Who wore which slot; maps person ids in camera events to slots. */
  readonly slots: readonly FilmSourceSlot[];
  /** The game state's environment at the snap (public). */
  readonly environment: Environment;
  readonly lineOfScrimmageX: number;
  readonly lineToGainX: number | null;
  /** The user's side in this game, or null when watching other clubs. */
  readonly userSide: FeedSide | null;
  /** Present when this record came from a `review_resolved` event (J11.1.1). */
  readonly review?: { readonly reversed: boolean; readonly favours: FeedSide | null } | null;
  readonly extras?: PresentationExtras | null;
}

/** A cue before it is numbered (distributes over the union). */
type Unnumbered<T> = T extends unknown ? Omit<T, 'seq'> : never;

const other = (s: FeedSide): FeedSide => (s === 0 ? 1 : 0);

/** Kind order inside one tick: pre-snap talk, camera events, contact, rulings last (a ruling follows the whistle). */
const ORDER: Readonly<Record<FeedCue['kind'], number>> = {
  relay: 0, cadence: 1, snap: 2, kick: 3, throw: 3, postHit: 4, kickLanding: 4, catch: 4, drop: 4, contact: 5, tackle: 6, fumble: 6,
  outOfBounds: 6, flag: 7, whistle: 8, ruling: 9,
};

/** Rulings from the called outcome, in the order a referee would signal them. */
function rulingsOf(rec: FeedRecord, review: FeedInput['review']): { ruling: RulingKind; favours: FeedSide | null }[] {
  const f = rec.final, snap = f.snappingSide, def = other(snap);
  const out: { ruling: RulingKind; favours: FeedSide | null }[] = [];
  if (review) out.push({ ruling: review.reversed ? 'review_reversed' : 'review_upheld', favours: review.favours });
  const enforced = f.enforcement;
  if (enforced && (enforced.enforced.length || enforced.offsetting)) {
    const against = enforced.offsetting ? null : rec.called.fouls[enforced.enforced[0]!]?.side ?? null;
    out.push({ ruling: 'penalty', favours: against === null ? null : other(against as FeedSide) });
  }
  if (f.noPlay) return out;
  const s = f.score;
  if (s) {
    const by: Record<string, RulingKind> = { touchdown: 'touchdown', field_goal: 'field_goal_good', safety: 'safety', try_kick: 'try_good', try_two: 'try_good', defensive_try: 'try_good', try_safety: 'try_good' };
    out.push({ ruling: by[s.type] ?? 'touchdown', favours: s.side as FeedSide });
  }
  switch (f.resultType) {
    case 'field_goal_missed': out.push({ ruling: 'field_goal_missed', favours: def }); break;
    case 'try_failed': out.push({ ruling: 'try_failed', favours: def }); break;
    case 'interception': out.push({ ruling: 'interception', favours: f.possessionAfter as FeedSide }); break;
    case 'fumble_lost': out.push({ ruling: 'fumble_lost', favours: f.possessionAfter as FeedSide }); break;
    case 'sack': out.push({ ruling: 'sack', favours: def }); break;
    case 'pass_incomplete': out.push({ ruling: 'incomplete', favours: def }); break;
    default: break;
  }
  if (f.touchback) out.push({ ruling: 'touchback', favours: null });
  if (rec.seriesAfter.turnoverOnDowns) out.push({ ruling: 'turnover_on_downs', favours: def });
  else if (rec.seriesAfter.firstDownAwarded && !f.changeOfPossession && !s) out.push({ ruling: 'first_down', favours: snap });
  return out;
}

/** Builds the presentation feed of one play. Pure: same input, same feed. */
export function presentationFeed(input: FeedInput): PresentationFeed {
  const { record: rec, ticksPerSecond: tps, extras } = input;
  const tk = (t: number) => Math.round(t * tps);
  // Pre-snap talk is placed on the tick at or before it, so a count 0.05 s before the snap never lands on the snap tick.
  const tkBefore = (t: number) => (t < 0 ? Math.min(Math.floor(t * tps), -1) : tk(t));
  const missing: FeedSource[] = [];
  const cues: Unnumbered<FeedCue>[] = [];

  // Camera events: the film filter's list. Its own flag (drawn at the whistle) is replaced below.
  const src = {
    gameId: rec.gameId, playNumber: rec.index, kind: 'game', teams: [0, 0], ticksPerSecond: tps,
    trajectory: input.trajectory, slots: input.slots, row: { penalties: [] } as unknown as PlayByPlayRow,
    calls: undefined as never, truth: rec.truth, hash: 'middle', lineOfScrimmageX: input.lineOfScrimmageX,
    lineToGainX: input.lineToGainX, assignments: [], callValue: null,
  } satisfies FilmSource;
  let whistle: CameraCue | undefined;
  for (const e of publicEvents(src)) {
    if (e.kind === 'flag') continue;
    const cue: Unnumbered<CameraCue> = { kind: e.kind, tick: e.tick, x: e.x, y: e.y, slots: e.slots ?? [] };
    if (e.kind === 'whistle') whistle = cue as CameraCue;
    cues.push(cue);
  }

  // The kick: the foot meeting the ball. Read from the truth record's kick event, public fields only
  // (time, kick spot, kicker), the same things the film camera shows.
  const slotOfPerson = new Map(input.slots.map((s) => [s.personId, s.slot]));
  for (const e of rec.truth.events) {
    if (e.type !== 'kick') continue;
    const kicker = slotOfPerson.get(e.kickerId);
    cues.push({ kind: 'kick', tick: tk(e.t), x: e.kickSpot.x, y: e.kickSpot.y, slots: kicker === undefined ? [] : [kicker] } satisfies Unnumbered<KickCue>);
  }

  // Goal-post strikes (CR-PV00-7).
  if (extras?.postHits) {
    for (const h of extras.postHits) cues.push({ kind: 'postHit', tick: tk(h.t), x: h.x, y: h.y, part: h.part } satisfies Unnumbered<PostHitCue>);
  } else missing.push('postHit');

  // Flags as the officials threw them: called fouls only (B11.2.1 rule 5).
  const thrown = new Map((extras?.flagsThrown ?? []).map((f) => [f.foulIndex, f.t]));
  if (!extras?.flagsThrown) missing.push('rulingTicks');
  rec.called.fouls.forEach((foul, i) => {
    if (!foul.called) return;
    const at = thrown.get(i);
    const tick = at !== undefined ? tk(at) : Math.max(tk(foul.t), 0);
    cues.push({ kind: 'flag', tick, x: foul.spot.x, y: foul.spot.y, slots: [], against: foul.side as FeedSide });
  });

  // Contact tiers (CR-PV00-2).
  if (extras?.contacts) {
    const slotOf = slotOfPerson;
    for (const c of extras.contacts) {
      cues.push({ kind: 'contact', tick: tk(c.t), x: c.x, y: c.y, tier: c.tier, slots: c.playerIds.map((id) => slotOf.get(id)).filter((s): s is number => s !== undefined) });
    }
  } else missing.push('contactTier');

  // Cadence and relay (CR-PV00-3).
  if (extras?.presnap) {
    for (const p of extras.presnap) {
      if (p.kind.startsWith('relay_')) cues.push({ kind: 'relay', tick: tkBefore(p.t), side: p.side, outcome: p.kind === 'relay_garbled' ? 'garbled' : 'clean' });
      else cues.push({ kind: 'cadence', tick: tkBefore(p.t), side: p.side, count: p.kind === 'cadence_hard' ? 'hard' : p.kind === 'cadence_silent' ? 'silent' : 'voiced' });
    }
  } else missing.push('cadence', 'relay');

  // Rulings: signalled at the whistle (or the last camera event when a play has none).
  const rulingTick = whistle?.tick ?? cues.reduce((m, c) => Math.max(m, c.tick), 0);
  for (const r of rulingsOf(rec, input.review)) cues.push({ kind: 'ruling', tick: rulingTick, ruling: r.ruling, favours: r.favours } satisfies Unnumbered<RulingCue>);

  const sorted = cues
    .map((c, i) => ({ c, i }))
    .sort((a, b) => a.c.tick - b.c.tick || ORDER[a.c.kind] - ORDER[b.c.kind] || a.i - b.i)
    .map(({ c }, seq) => ({ ...c, seq }) as FeedCue);

  const env = input.environment;
  if (extras?.noise === undefined) missing.push('noise');
  if (!extras?.wind) missing.push('playWind');
  const f = rec.final;
  return {
    formatVersion: FEED_FORMAT_VERSION,
    visibility: 'user-visible',
    playId: `${rec.gameId}:${rec.index}`,
    ticksPerSecond: tps,
    perspective: { homeSide: 0, userSide: input.userSide },
    conditions: {
      noise: extras?.noise ?? null,
      noiseBase: env.noiseBase,
      windMph: extras?.wind?.mph ?? env.windMph,
      windDirDeg: extras?.wind?.dirDeg ?? env.windDirDeg,
      gustMph: extras?.wind?.gustMph ?? env.gustMph,
      precip: env.precip,
      roof: env.roof,
      daylight: env.daylight,
    },
    situation: {
      offenseSide: f.snappingSide as FeedSide,
      attackDir: rec.truth.attackDir,
      lineOfScrimmageX: input.lineOfScrimmageX,
      lineToGainX: input.lineToGainX,
    },
    result: {
      resultType: f.resultType,
      yardsGained: f.yardsGained,
      noPlay: f.noPlay,
      changeOfPossession: f.changeOfPossession,
      scoreAfter: [rec.scoreAfter[0], rec.scoreAfter[1]],
      firstDown: rec.seriesAfter.firstDownAwarded,
    },
    cues: sorted,
    missing: [...new Set(missing)].sort(),
  };
}
