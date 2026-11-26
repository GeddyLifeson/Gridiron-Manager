// K3.6.1 when preparation runs. One AI team's week is a pure function of its own inputs and its own
// random streams (scoped by season, week and team by the caller), so teams can run in any order or on
// any number of workers and one team's preparation never depends on another's for the same week.
// Inputs are the film and public facts as of the weekly commit (J14.2.1): nothing the opponent does
// during the week is in them (rule 2).
import { tendencies } from '@gm/models';
import type { EmphasisBlock, SystemBlock } from '../profile/index.ts';
import { prepDepth, type PrepDepth, type PrepMethod } from './depth.ts';
import { expectedLineup, flaggedStar, matchupTable, type DepthSighting, type InjuryListing, type LineupSlot, type MatchupInput, type MatchupRow, type PairingDef, type StaffGrade } from './matchups.ts';
import { param } from './params.ts';
import { buildPayoffs, type CallOption, type ClockPayoff, type PayoffTable, type PlanningReps, type PriorTable, type SituationDef, type Unit } from './payoffs.ts';
import { buildPlan, type AiGamePlan, type Balance, type BoardRow } from './plan.ts';
import { allocatePractice, type AiPracticePlan, type PracticeInput } from './practice.ts';
import { buildScoutingReport, fourthDownGoRate, lookShares, type LookShare, type PrepStream, type ScoutingInput, type ScoutingReport } from './scouting.ts';
import { buildSheet, lockSheet, withPlannedSnaps, type AiSheet, type MixSolver, type SequencePackage } from './sheet.ts';

type ChartedPlay = tendencies.ChartedPlay;

/** Stream names this module draws from. The caller builds each with scope [season, week, teamId] (rule 5). */
export const PREP_STREAMS = ['scouting', 'payoffNoise', 'planningReps'] as const;
export type PrepStreamName = (typeof PREP_STREAMS)[number];
export type PrepStreams = (name: PrepStreamName) => PrepStream;

/** Default look class of an opposing defensive snap: its coverage family, with pressure marked. */
export function defenseLook(p: ChartedPlay): string | null {
  if (p.coverageFamily === null) return null;
  return tendencies.isPressure(p.rushers) ? `${p.coverageFamily}+pressure` : p.coverageFamily;
}
/** Default look class of an opposing offensive snap: its concept tag (the family a charter writes, N2.3.1 rule 2). */
export function offenseLook(p: ChartedPlay): string | null {
  return p.concept;
}
/** Default situation of a charted snap: the shared down-and-distance bucket (H2.1.3, G7.2). */
export function defaultBucket(p: ChartedPlay): string | null {
  return tendencies.downDistance(p);
}

/**
 * K2.6.1 rule 3: on a side the head coach does not call, the caller's rates lean toward the head
 * coach's preference at the starting weight. Other system fields stay the caller's.
 */
export function plannerSystem(caller: SystemBlock, headCoach: SystemBlock | null): SystemBlock {
  if (!headCoach || headCoach === caller) return caller;
  const w = param('plan.headCoachWeight');
  const mix = <T extends object>(a: T, b: T): T => {
    const out: Record<string, number> = {};
    for (const k of Object.keys(a).sort()) out[k] = (1 - w) * (a as Record<string, number>)[k]! + w * (b as Record<string, number>)[k]!;
    return out as T;
  };
  return { ...caller, offenseRates: mix(caller.offenseRates, headCoach.offenseRates), defenseRates: mix(caller.defenseRates, headCoach.defenseRates) };
}

export interface UnitContent {
  readonly calls: readonly CallOption[];
  readonly catalogue: readonly SituationDef[];
  /** Plan and sheet size for the unit (`system.sheetSize`, or the special teams template size). */
  readonly sizeLimit: number;
  readonly lookOf?: (p: ChartedPlay) => string | null;
  readonly bucketOf?: (p: ChartedPlay) => string | null;
  readonly scriptSituations?: readonly string[];
  readonly packages?: readonly SequencePackage[];
  readonly balance?: Balance | null;
  readonly mixGroupOf?: ((c: CallOption) => string) | null;
}

export interface TeamWeekInput {
  readonly teamId: number;
  readonly gameId: number;
  readonly opponentId: number;
  readonly season: number;
  readonly week: number;
  /** Hidden parameters of the coach who owns the plan (K2.6.1 `decisionOwner`). */
  readonly preparationZ: number;
  readonly evaluationZ: number;
  readonly tellHours: number;
  /** `tendencies.emphasis` of the coach who owns the defensive plan (K2.1.3 rule 4). */
  readonly emphasis: EmphasisBlock;
  /** K3.6.1 rule 4, from the team's fidelity tier (X13). */
  readonly method: PrepMethod;
  readonly scouting: Omit<ScoutingInput, 'opponentId' | 'season'>;
  /** Our own expected lineups (our depth chart) and what film shows of theirs. */
  readonly ownOffense: readonly LineupSlot[];
  readonly ownDefense: readonly LineupSlot[];
  readonly opponentOffenseOnFilm: readonly DepthSighting[];
  readonly opponentDefenseOnFilm: readonly DepthSighting[];
  readonly injuryReport: readonly InjuryListing[];
  /** D6 estimates held by this staff for both teams (K3.2.1). Opponent estimates must come from `gamesCharted` film only. */
  readonly grades: (gamesCharted: readonly number[]) => readonly StaffGrade[];
  readonly ourOffensePairings: readonly PairingDef[];
  readonly ourDefensePairings: readonly PairingDef[];
  readonly contestExpectation: MatchupInput['contestExpectation'];
  readonly rushContests: readonly string[];
  readonly offense: UnitContent;
  readonly defense: UnitContent;
  readonly specialTeams?: UnitContent | null;
  readonly prior: PriorTable;
  readonly reps: PlanningReps | null;
  readonly clockPayoff?: ClockPayoff | null;
  readonly solver: MixSolver;
  readonly practice: Omit<PracticeInput, 'menu'>;
  readonly practiceShare: number;
  readonly backupReadiness: (callId: string) => number;
  readonly weatherPlanDue: boolean;
  /** Plan lock time of the week (G6.6.1). */
  readonly lockTime: number;
  readonly quarterbackFreedom?: string | null;
}

export interface TeamWeekOutput {
  readonly teamId: number;
  readonly depth: PrepDepth;
  readonly report: ScoutingReport;
  readonly ourOffenseMatchups: readonly MatchupRow[];
  readonly ourDefenseMatchups: readonly MatchupRow[];
  readonly plan: AiGamePlan;
  readonly sheets: readonly AiSheet[];
  readonly practice: AiPracticePlan;
  readonly planningRepsUsed: number;
}

function boardRows(byBucket: ReadonlyMap<string, readonly LookShare[]>): BoardRow[] {
  return [...byBucket.keys()].sort().map((bucket) => ({ bucket, looks: byBucket.get(bucket)! }));
}

/** Runs K3.1 to K3.5 for one team. Returns null when the team's tier skips preparation (rule 4). */
export function prepareTeamWeek(inp: TeamWeekInput, streams: PrepStreams): TeamWeekOutput | null {
  if (inp.method === 'skip') return null;
  const depth = prepDepth({ preparationZ: inp.preparationZ, evaluationZ: inp.evaluationZ, tellHours: inp.tellHours, method: inp.method });

  // K3.1 scouting.
  const report = buildScoutingReport({ ...inp.scouting, opponentId: inp.opponentId, season: inp.season }, depth, streams('scouting'));

  // K3.2 matchups.
  const grades = inp.grades(report.gamesCharted);
  const theirOffense = expectedLineup(inp.opponentOffenseOnFilm, inp.injuryReport);
  const theirDefense = expectedLineup(inp.opponentDefenseOnFilm, inp.injuryReport);
  const ourOffenseMatchups = matchupTable({ offenseLineup: inp.ownOffense, defenseLineup: theirDefense, grades, pairings: inp.ourOffensePairings, contestExpectation: inp.contestExpectation });
  const ourDefenseMatchups = matchupTable({ offenseLineup: theirOffense, defenseLineup: inp.ownDefense, grades, pairings: inp.ourDefensePairings, contestExpectation: inp.contestExpectation });

  // K3.3 payoffs, one table per unit. Our offense plans against their defensive rows and the reverse.
  const offShares = lookShares(report.plays, 'defense', inp.offense.lookOf ?? defenseLook, inp.offense.bucketOf ?? defaultBucket);
  const defShares = lookShares(report.plays, 'offense', inp.defense.lookOf ?? offenseLook, inp.defense.bucketOf ?? defaultBucket);
  const stTotal = report.specialTeams.reduce((s, r) => s + r.count, 0);
  const stAll: LookShare[] = report.specialTeams.map((r) => ({ look: `${r.unit}:${r.observed}`, share: stTotal ? r.count / stTotal : 0, count: r.count }));
  const stByBucket = new Map<string, LookShare[]>();
  for (const r of report.specialTeams) {
    const unitTotal = report.specialTeams.filter((x) => x.unit === r.unit).reduce((s, x) => s + x.count, 0);
    stByBucket.set(r.unit, [...(stByBucket.get(r.unit) ?? []), { look: `${r.unit}:${r.observed}`, share: r.count / unitTotal, count: r.count }]);
  }
  const rng = { noise: streams('payoffNoise'), reps: streams('planningReps') };
  let repsUsed = 0;
  const table = (unit: Unit, content: UnitContent, looks: readonly LookShare[], matchups: readonly MatchupRow[]): PayoffTable => {
    const t = buildPayoffs({ unit, calls: content.calls, looks, prior: inp.prior, matchups, reps: inp.reps, shortList: content.sizeLimit, repsAlreadyUsed: repsUsed }, depth, rng);
    repsUsed += t.repsUsed;
    return t;
  };
  const offTable = table('offense', inp.offense, offShares.all, ourOffenseMatchups);
  const defTable = table('defense', inp.defense, defShares.all, ourDefenseMatchups);
  const stTable = inp.specialTeams ? table('specialTeams', inp.specialTeams, stAll, []) : null;

  // K3.4.1 the plan.
  const tendencyLooks = (side: 'offense' | 'defense', looks: readonly LookShare[]) => {
    const ids = new Set(looks.map((l) => l.look));
    return report.strong.filter((c) => c.side === side).map((c) => c.bandOutcome ?? c.markOutcome).filter((o): o is string => o !== null && ids.has(o));
  };
  let plan = buildPlan({
    teamId: inp.teamId, gameId: inp.gameId, opponentId: inp.opponentId, report,
    board: { offense: boardRows(offShares.byBucket), defense: boardRows(defShares.byBucket) },
    offense: { unit: 'offense', calls: inp.offense.calls, table: offTable, looks: offShares.all, sizeLimit: inp.offense.sizeLimit, practiceShare: inp.practiceShare, balance: inp.offense.balance ?? null, tendencyLooks: tendencyLooks('defense', offShares.all) },
    defense: { unit: 'defense', calls: inp.defense.calls, table: defTable, looks: defShares.all, sizeLimit: inp.defense.sizeLimit, practiceShare: inp.practiceShare, balance: inp.defense.balance ?? null, tendencyLooks: tendencyLooks('offense', defShares.all) },
    specialTeams: inp.specialTeams && stTable ? { unit: 'specialTeams', calls: inp.specialTeams.calls, table: stTable, looks: stAll, sizeLimit: inp.specialTeams.sizeLimit, practiceShare: inp.practiceShare } : null,
    ourOffenseMatchups, ourDefenseMatchups, rushContests: inp.rushContests,
    opponentStar: flaggedStar(theirOffense, grades),
    backupReadiness: inp.backupReadiness, weatherPlanDue: inp.weatherPlanDue,
    opponentFourthDownGoRate: fourthDownGoRate(report.management), emphasis: inp.emphasis, quarterbackFreedom: inp.quarterbackFreedom ?? null,
  }, depth);

  // K3.4.2 the sheets, locked with a stored mix per box.
  const sheetFor = (unit: Unit, content: UnitContent, t: PayoffTable, shares: { all: readonly LookShare[]; byBucket: ReadonlyMap<string, readonly LookShare[]> }): AiSheet => {
    const menu = unit === 'offense' ? plan.offenseMenu : unit === 'defense' ? plan.defenseMenu : plan.specialTeamsMenu;
    const open = buildSheet({
      unit, gameId: inp.gameId, menu, calls: content.calls, table: t, catalogue: content.catalogue, shares, sizeLimit: content.sizeLimit,
      clockPayoff: inp.clockPayoff ?? null, scriptSituations: content.scriptSituations ?? [], packages: content.packages ?? [], themes: plan.themes,
      mixGroupOf: content.mixGroupOf ?? null,
    }, depth);
    return lockSheet(open, inp.solver, inp.lockTime);
  };
  const sheets: AiSheet[] = [sheetFor('offense', inp.offense, offTable, offShares), sheetFor('defense', inp.defense, defTable, defShares)];
  if (inp.specialTeams && stTable) sheets.push(sheetFor('specialTeams', inp.specialTeams, stTable, { all: stAll, byBucket: stByBucket }));
  plan = withPlannedSnaps(plan, sheets, { offense: inp.offense.catalogue, defense: inp.defense.catalogue, specialTeams: inp.specialTeams?.catalogue ?? [] });

  // K3.5 practice.
  const practice = allocatePractice({ ...inp.practice, menu: [...plan.offenseMenu, ...plan.defenseMenu.map((e) => ({ ...e, order: e.order + plan.offenseMenu.length })), ...plan.specialTeamsMenu.map((e) => ({ ...e, order: e.order + plan.offenseMenu.length + plan.defenseMenu.length }))] });

  return { teamId: inp.teamId, depth, report, ourOffenseMatchups, ourDefenseMatchups, plan, sheets, practice, planningRepsUsed: repsUsed };
}

/**
 * Rule 1: after the weekly commit every AI team prepares, in team-id order. The order only fixes the
 * shape of the result: each team's output depends on its own input and streams alone.
 */
export function prepareLeagueWeek(teams: readonly TeamWeekInput[], streamsFor: (teamId: number) => PrepStreams): Map<number, TeamWeekOutput | null> {
  const out = new Map<number, TeamWeekOutput | null>();
  for (const t of [...teams].sort((a, b) => a.teamId - b.teamId)) out.set(t.teamId, prepareTeamWeek(t, streamsFor(t.teamId)));
  return out;
}
