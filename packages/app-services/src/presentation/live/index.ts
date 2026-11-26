// Live play: what the game screen needs to show each play as it happens and to hand it to the sound
// stage (I9.1, O2.3.4, PV-00). The game flow keeps only the play record; the movement of the 22 players
// (the trajectory, J1.6.2) comes back from the resolver and is dropped there. `liveTap` wraps the
// game's resolver so the host keeps each play's trajectory, and `livePlay` turns a play record plus its
// trajectory into the field view's play (user-visible: the film filter's events and a scrubbed
// trajectory, the same as film) and the play's presentation feed.
//
// Pure apart from the tap's small map. Nothing here reads a clock: the host's playback owns time.

import { environment as env } from '@gm/engine-game';
import type { Environment, GameEvent, PlayInput, PlayRecord, PlayResult, Resolver, RuleSet, SimTeam, TrajectoryRecord } from '@gm/schema';
import { publicEvents, playIdOf, scrubTrajectory, type FilmEvent, type FilmSource, type FilmSourceSlot } from '../../read-models/film/index.ts';
import type { PlayByPlayRow } from '@gm/schema';
import { presentationFeed, type PresentationExtras } from '../feed/adapter.ts';
import type { FeedSide, PresentationFeed } from '../feed/types.ts';

/** Players per side in a unit, slots 0 to 10 snapping, 11 to 21 opposing (J1.2.2). */
const PER_SIDE = 11;

export interface LiveTap {
  /** The game's resolver, asked for full detail and keeping each play's trajectory. Pass it in the game's deps. */
  readonly resolver: Resolver;
  /** The trajectory of a play, by its play number; null if the resolver made none (reference resolver). */
  trajectory(playNumber: number): TrajectoryRecord | null;
  /** Forget plays before this play number (memory: only the last few plays are needed on screen). */
  dropBefore(playNumber: number): void;
}

/**
 * Wraps a resolver so every play is simulated with `detail: 'full'` and its trajectory kept. The
 * result itself is passed through unchanged: 'full' only adds the trajectory and explain record
 * (J1.6.1), so the game is the same game. A unit the flow re-runs simply stores the same play again.
 */
export function liveTap(inner: Resolver): LiveTap {
  const kept = new Map<number, TrajectoryRecord>();
  const resolver: Resolver = {
    id: inner.id,
    version: inner.version,
    mayProduceSavedResults: inner.mayProduceSavedResults,
    simulatePlay(input: PlayInput): PlayResult {
      const result = inner.simulatePlay({ ...input, options: { ...input.options, detail: 'full' } });
      if (result.trajectory) kept.set(input.situation.playNumber, result.trajectory as TrajectoryRecord);
      return result;
    },
  };
  return {
    resolver,
    trajectory: (n) => kept.get(n) ?? null,
    dropBefore: (n) => { for (const k of [...kept.keys()]) if (k < n) kept.delete(k); },
  };
}

/** Who wore which slot: slots follow the calls' player order (J1.2.2); jerseys come from the dressed roster. */
export function liveSlots(record: PlayRecord, teams: readonly [SimTeam, SimTeam]): FilmSourceSlot[] {
  const snapSide = record.situation.offense as 0 | 1;
  const other = (1 - snapSide) as 0 | 1;
  const jersey = (side: 0 | 1, id: number): number => teams[side].players.find((p) => p.playerId === id)?.jersey ?? 0;
  const out: FilmSourceSlot[] = [];
  record.calls.snapping.players.forEach((p, i) => out.push({ slot: i, side: snapSide, personId: p.playerId, jersey: jersey(snapSide, p.playerId), role: p.role }));
  record.calls.opposing.players.forEach((p, i) => out.push({ slot: PER_SIDE + i, side: other, personId: p.playerId, jersey: jersey(other, p.playerId), role: p.role }));
  return out;
}

/** The field view's play (G-03 `FilmPlay`), user-visible only. */
export interface LiveFilmPlay {
  readonly playId: string;
  readonly visibility: 'user-visible';
  readonly ticksPerSecond: number;
  readonly trajectory: TrajectoryRecord;
  readonly slots: readonly { slot: number; side: 0 | 1; personId: number; jersey: number; role: string }[];
  readonly events: readonly FilmEvent[];
  readonly situation: { lineOfScrimmageX: number; lineToGainX: number | null; attackDir: 1 | -1; offenseSide: 0 | 1 };
}

export interface LivePlay {
  readonly playId: string;
  readonly gameId: number;
  readonly playNumber: number;
  readonly film: LiveFilmPlay;
  readonly feed: PresentationFeed;
}

export interface LivePlayInput {
  readonly record: PlayRecord;
  readonly trajectory: TrajectoryRecord;
  readonly teams: readonly [SimTeam, SimTeam];
  readonly ticksPerSecond: number;
  /** The game state's environment at the snap. */
  readonly environment: Environment;
  readonly userSide: FeedSide | null;
  /** The game's rule set: with it the crowd noise is the engine's own J12.6.1 value (see below). */
  readonly rules?: RuleSet;
  /** Present when the record came from a review (J11.1.1). */
  readonly review?: { readonly reversed: boolean; readonly favours: FeedSide | null } | null;
  /** Extras the record will carry once the CR-PV00 requests land; filled by the caller when it has them. */
  readonly extras?: PresentationExtras | null;
}

/**
 * The crowd's noise for the play: the engine's J12.6.1 `noiseForPlay` on the play's own situation,
 * the value CR-PV00-1 will put on each record. Until that lands this is the only way the crowd bed
 * has a level; it is the engine function, not a presentation guess. Home is side 0.
 */
export function liveNoise(record: PlayRecord, environment: Environment, rules: RuleSet): number {
  const s = record.situation;
  const margin = s.score[0]! - s.score[1]!;
  return env.noiseForPlay(environment, { offenseFavoured: s.offense === 0, down: s.down ?? 0, margin }, rules, env.environmentParamTable());
}

/** Builds the field view's play and the presentation feed for one play. */
export function livePlay(i: LivePlayInput): LivePlay {
  const r = i.record;
  const s = r.situation;
  const slots = liveSlots(r, i.teams);
  const src = {
    gameId: r.gameId, playNumber: r.index, kind: 'game', teams: [i.teams[0].teamId, i.teams[1].teamId], ticksPerSecond: i.ticksPerSecond,
    trajectory: i.trajectory, slots, row: { penalties: [], offense: s.offense } as unknown as PlayByPlayRow,
    calls: r.calls, truth: r.truth, hash: 'middle', lineOfScrimmageX: s.ballX, lineToGainX: s.lineToGainX ?? null, assignments: [], callValue: null,
  } satisfies FilmSource;
  const film: LiveFilmPlay = {
    playId: playIdOf(r.gameId, r.index),
    visibility: 'user-visible',
    ticksPerSecond: i.ticksPerSecond,
    trajectory: scrubTrajectory(i.trajectory),
    slots: slots.map((x) => ({ slot: x.slot, side: x.side as 0 | 1, personId: x.personId, jersey: x.jersey, role: x.role })),
    events: publicEvents(src),
    situation: { lineOfScrimmageX: s.ballX, lineToGainX: s.lineToGainX ?? null, attackDir: r.truth.attackDir === 1 ? 1 : -1, offenseSide: s.offense as 0 | 1 },
  };
  const given = i.extras ?? {};
  const extras: PresentationExtras = given.noise === undefined && i.rules ? { ...given, noise: liveNoise(r, i.environment, i.rules) } : given;
  const feed = presentationFeed({
    record: r, ticksPerSecond: i.ticksPerSecond, trajectory: i.trajectory, slots, environment: i.environment,
    lineOfScrimmageX: s.ballX, lineToGainX: s.lineToGainX ?? null, userSide: i.userSide,
    ...(i.review ? { review: i.review } : {}), extras,
  });
  return { playId: film.playId, gameId: r.gameId, playNumber: r.index, film, feed };
}

export interface LivePlayQueueOptions {
  readonly tap: LiveTap;
  readonly teams: readonly [SimTeam, SimTeam];
  readonly ticksPerSecond: number;
  /** The game state's environment now (it changes by period); read when each play is built. */
  readonly environment: () => Environment;
  readonly userSide: FeedSide | null;
  readonly rules?: RuleSet;
  /** Plays kept in the tap behind the newest (the sideline replay needs only the last one, I9.3.1). */
  readonly keep?: number;
}

/**
 * Turns a running game's events (a `GameCallingSession`'s `events`, or a flow sink's) into live plays,
 * each once, in order. A play with no trajectory (reference resolver) is skipped: nothing to show.
 */
export class LivePlayQueue {
  private seen = 0;
  private readonly reviews = new Map<number, boolean>();
  constructor(private readonly o: LivePlayQueueOptions) {}

  /** New plays since the last call. Pass the whole event list each time; only the new tail is read. */
  take(events: readonly GameEvent[]): LivePlay[] {
    const out: LivePlay[] = [];
    for (; this.seen < events.length; this.seen++) {
      const e = events[this.seen]!;
      if (e.type === 'review_resolved') { this.reviews.set(e.record.index, e.reversed); continue; }
      if (e.type !== 'play_resolved') continue;
      const record = e.record;
      const trajectory = this.o.tap.trajectory(record.index);
      if (!trajectory) continue;
      const reversed = this.reviews.get(record.index);
      out.push(livePlay({
        record, trajectory, teams: this.o.teams, ticksPerSecond: this.o.ticksPerSecond, environment: this.o.environment(), userSide: this.o.userSide,
        ...(this.o.rules ? { rules: this.o.rules } : {}), ...(reversed !== undefined ? { review: { reversed, favours: null } } : {}),
      }));
      this.reviews.delete(record.index);
      this.o.tap.dropBefore(record.index - (this.o.keep ?? 1));
    }
    return out;
  }
}

/**
 * The session's `liveMs`: real milliseconds the play runs on screen, from its trajectory at real speed
 * (I2.1.1 stages 3 to 6), so the console holds the next call until the play has been shown.
 */
export function liveMsFrom(tap: LiveTap, ticksPerSecond: number): (record: PlayRecord | null) => number {
  return (record) => {
    const t = record ? tap.trajectory(record.index) : null;
    return t ? Math.round((t.tickCount / ticksPerSecond) * 1000) : 0;
  };
}
