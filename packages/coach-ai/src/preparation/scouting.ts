// K3.1.1 the AI scouting report. The AI staff reads the same shared tendency store the user's screens
// read (N2.3.1), through the same windows, charting error and tables (G-66). It takes no other input
// about the opponent: there is no parameter for a plan, a sheet, a practice script or install state, so
// nothing a team has not put on film can reach the report (rules 5 and 6, K9.1.1).
import { tendencies } from '@gm/models';
import type { OpponentNoteRow } from '../profile/index.ts';
import type { PrepDepth } from './depth.ts';

type ChartedPlay = tendencies.ChartedPlay;
/** The J13 stream interface, taken from the tendency module's signature (coach-ai may not import @gm/schema). */
export type PrepStream = Parameters<typeof tendencies.chartOpponent>[2];

/** K3.1.1 rule 7: the opposing head coach's game-management habits, counted from public play-by-play only. */
export interface PublicManagementRecord {
  readonly fourthDownGo: number;
  readonly fourthDownChances: number;
  readonly twoPointTries: number;
  readonly touchdowns: number;
  /** First-half timeouts left unused, summed, and the halves counted. */
  readonly timeoutsUnused: number;
  readonly halves: number;
}

/** One special teams tendency row from film (H2): the staff sees kinds and counts, nothing else. */
export interface SpecialTeamsRow {
  readonly gameId: number;
  readonly unit: string;
  readonly observed: string;
}

export interface ScoutingInput {
  readonly opponentId: number;
  readonly season: number;
  /**
   * Store rows for the opponent that the film exchange makes available this week (H2.6.1, H2.6.4), both
   * sides of the ball, as the store holds them. Week 1 and a caller who moved: last season's rows and
   * his previous team's rows are simply in this list; the N2.3.1 weights are applied here.
   */
  readonly film: readonly ChartedPlay[];
  readonly callerChangeAtOrder?: number | null;
  /** Staff with breakdown duties and their hours (H2.1.1). The same job list the user's staff gets. */
  readonly staff: readonly tendencies.BreakdownStaff[];
  readonly hoursUntilPlanDay: number;
  /** Charting quality of the staff (N2.1.2, H2.1.2) and the vocabulary a charter chooses from. */
  readonly charting: tendencies.ChartingInputs;
  /** The planner's notes on the opposing caller (K2.1.5 `memory.opponentNotes`). */
  readonly opponentNotes?: readonly OpponentNoteRow[];
  readonly specialTeams?: readonly SpecialTeamsRow[];
  readonly management?: PublicManagementRecord | null;
  /** Concepts of the opposing caller's system family, for unscouted looks (H2.2.3). */
  readonly systemFamily?: readonly string[];
}

export interface TendencyTableOut {
  readonly side: 'offense' | 'defense';
  readonly measure: string;
  readonly cuts: readonly string[];
  readonly cells: readonly tendencies.TendencyCell[];
}

export interface ScoutingReport {
  readonly opponentId: number;
  /** Games whose breakdown finished, most recent last. */
  readonly gamesCharted: readonly number[];
  readonly splits: readonly string[];
  /** The charted rows with relevance weights: what every later step reads. */
  readonly plays: readonly ChartedPlay[];
  readonly tables: readonly TendencyTableOut[];
  /** Cells the tables mark strong, strongest first: the "top opponent tendency rows" of K3.4.1 rule 4. */
  readonly strong: readonly (tendencies.TendencyCell & { readonly side: 'offense' | 'defense' })[];
  readonly tells: readonly tendencies.StructuralTell[];
  readonly unscouted: readonly tendencies.UnscoutedLook[];
  readonly specialTeams: readonly { unit: string; observed: string; count: number }[];
  readonly management: PublicManagementRecord | null;
  readonly opponentNotes: readonly OpponentNoteRow[];
}

const OFFENSE_MEASURES = ['runPass', 'playKind', 'concept'] as const;
const DEFENSE_MEASURES = ['pressure', 'coverage', 'manZone', 'front'] as const;

/** Most recent games first by season and schedule order; the staff asks for the first `n`. */
function mostRecentGames(film: readonly ChartedPlay[], n: number): number[] {
  const games = tendencies.gamesOf(film);
  return games.slice(Math.max(0, games.length - n)).map((g) => g.gameId);
}

/**
 * Builds the report. Draw order on `rng`: charting tags in play order (H2.1.2), then one draw per
 * structural tell in tell-id order.
 */
export function buildScoutingReport(inp: ScoutingInput, depth: PrepDepth, rng: PrepStream): ScoutingReport {
  // Rule 1: the window, then the staff's hours decide which breakdowns finish (H2.1.1, same as the user).
  const wanted = mostRecentGames(inp.film, depth.gamesWanted);
  // Newest game first in the job queue, so a short-handed staff loses the oldest film.
  const { jobs } = tendencies.breakdownJobs([...wanted].reverse(), ['offense', 'defense'], inp.staff, inp.hoursUntilPlanDay);
  const wantedSet = new Set(wanted);
  const finished = tendencies.finishedOnly(inp.film.filter((p) => wantedSet.has(p.gameId)), jobs);
  // Rule 3: charting error. The true call name never reaches the row (N2.3.1 rule 2, `chartValue`).
  const charted = tendencies.chartOpponent(finished, inp.charting, rng);
  const plays = tendencies.relevanceWeights(charted, { teamId: inp.opponentId, season: inp.season, callerChangeAtOrder: inp.callerChangeAtOrder ?? null });
  const gamesCharted = tendencies.gamesOf(plays).map((g) => g.gameId);

  // Rule 2: one table per measure for each split the staff reads, plus the whole-game row.
  const tables: TendencyTableOut[] = [];
  const cutSets: string[][] = [[], ...depth.splits.map((s) => [s])];
  for (const cuts of cutSets) {
    for (const measure of OFFENSE_MEASURES) tables.push({ side: 'offense', measure, cuts, cells: tendencies.tendencyTable(plays, { cuts, measure }) });
    for (const measure of DEFENSE_MEASURES) tables.push({ side: 'defense', measure, cuts, cells: tendencies.tendencyTable(plays, { cuts, measure }) });
  }
  const strong = tables
    .flatMap((t) => t.cells.filter((c) => c.band === 'strong' || c.mark === 'strong').map((c) => ({ ...c, side: t.side })))
    .sort((a, b) => b.calls - a.calls || (a.measure + a.key < b.measure + b.key ? -1 : 1));

  // Rule 4: tells that exist on the charted film, each found with the staff's chance.
  const tells: tendencies.StructuralTell[] = [];
  for (const side of ['offense', 'defense'] as const) {
    const exist = [...tendencies.structuralTells(plays, side)].sort((a, b) => (tendencies.tellId(a) < tendencies.tellId(b) ? -1 : 1));
    for (const t of exist) if (rng.uniform() < depth.tellFindChance) tells.push(t);
  }

  // Rule 6 and H2.2.3: what the caller ran before and has not shown this season.
  const thisSeason = plays.filter((p) => p.teamId === inp.opponentId && p.season === inp.season);
  const prior = plays.filter((p) => !(p.teamId === inp.opponentId && p.season === inp.season));
  const unscouted = tendencies.unscoutedLooks(thisSeason, prior, inp.systemFamily ?? []);

  // Rule 7: special teams counts from the charted games, and the public game-management record.
  const st = new Map<string, { unit: string; observed: string; count: number }>();
  const chartedSet = new Set(gamesCharted);
  for (const r of inp.specialTeams ?? []) {
    if (!chartedSet.has(r.gameId)) continue;
    const k = `${r.unit}|${r.observed}`;
    const row = st.get(k) ?? { unit: r.unit, observed: r.observed, count: 0 };
    row.count++;
    st.set(k, row);
  }
  const specialTeams = [...st.values()].sort((a, b) => (a.unit + a.observed < b.unit + b.observed ? -1 : 1));

  return {
    opponentId: inp.opponentId, gamesCharted, splits: depth.splits, plays, tables, strong, tells, unscouted, specialTeams,
    management: inp.management ?? null, opponentNotes: inp.opponentNotes ?? [],
  };
}

/** K3.1.1 rule 7 and I2.3.7: share of fourth downs the opposing coach has gone for, null without a record. */
export function fourthDownGoRate(r: PublicManagementRecord | null): number | null {
  return r && r.fourthDownChances > 0 ? r.fourthDownGo / r.fourthDownChances : null;
}

export interface LookShare { readonly look: string; readonly share: number; readonly count: number }

/**
 * Share of each look class in the charted rows, by situation bucket: the looks board K3 plans against
 * (G6.1.1). `lookOf` names the class of a row (null leaves the row out) and `bucketOf` its situation.
 * A bucket with fewer plays than the thin mark falls back to the whole report's shares.
 */
export function lookShares(
  plays: readonly ChartedPlay[],
  side: 'offense' | 'defense',
  lookOf: (p: ChartedPlay) => string | null,
  bucketOf: (p: ChartedPlay) => string | null,
): { all: LookShare[]; byBucket: Map<string, LookShare[]> } {
  const tally = (rows: readonly ChartedPlay[]): LookShare[] => {
    const m = new Map<string, { w: number; n: number }>();
    let total = 0;
    for (const p of rows) {
      const look = lookOf(p);
      if (look === null) continue;
      const w = p.weight ?? 1;
      const c = m.get(look) ?? { w: 0, n: 0 };
      c.w += w; c.n++;
      m.set(look, c);
      total += w;
    }
    return [...m.entries()].map(([look, c]) => ({ look, share: total > 0 ? c.w / total : 0, count: c.n }))
      .sort((a, b) => b.share - a.share || (a.look < b.look ? -1 : 1));
  };
  const rows = plays.filter((p) => p.side === side && tendencies.countsForCalls(p));
  const groups = new Map<string, ChartedPlay[]>();
  for (const p of rows) {
    const b = bucketOf(p);
    if (b === null) continue;
    const g = groups.get(b) ?? [];
    g.push(p);
    groups.set(b, g);
  }
  const byBucket = new Map<string, LookShare[]>();
  for (const b of [...groups.keys()].sort()) byBucket.set(b, tally(groups.get(b)!));
  return { all: tally(rows), byBucket };
}
