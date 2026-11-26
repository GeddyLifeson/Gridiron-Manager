// AI preparation port (K3.6.1). After the weekly commit every AI team prepares; each team's streams are
// scoped [season, week, team], so the result does not depend on team order or worker count (rule 5).
// What a staff knows (film, grades, content) is the source's business: the runner only fixes when
// preparation runs and which streams it draws from.
//
// The coach AI's week is passed in (`preparation.prepareTeamWeek` of @gm/coach-ai, G-74) instead of
// imported: the coach-ai barrel does not export `preparation` yet (integrator request CR-G87-1). The
// types here are structural, so binding it later is one line and no change to this file.
import type { RandomStream } from '@gm/schema';
import { seedFromHex, stream } from '@gm/engine-core';
import type { PrepContext } from './types.ts';

export const PREP_STREAM_PREFIX = 'coachPrep';

/** Named streams of one team's week. */
export type PrepStreamsOf<N extends string> = (name: N) => RandomStream;

export function prepStreams<N extends string = string>(ctx: PrepContext): PrepStreamsOf<N> {
  const seed = seedFromHex(ctx.seedHex);
  return (name) => stream(seed, `${PREP_STREAM_PREFIX}.${name}`, [ctx.season, ctx.week, ctx.teamId]);
}

/** Builds one team's K3 input from the world as of the weekly commit, or null when the team's tier skips preparation. */
export type TeamWeekSource<I> = (ctx: PrepContext) => I | null;

/**
 * The `prepare` port of the season runner. `prepareTeamWeek` is the coach AI's own week (K3.1 to K3.5):
 * `aiPreparation(source, preparation.prepareTeamWeek)`.
 */
export function aiPreparation<I, O, N extends string>(source: TeamWeekSource<I>, prepareTeamWeek: (input: I, streams: PrepStreamsOf<N>) => O): (ctx: PrepContext) => O | null {
  return (ctx) => {
    const input = source(ctx);
    return input === null ? null : prepareTeamWeek(input, prepStreams<N>(ctx));
  };
}
