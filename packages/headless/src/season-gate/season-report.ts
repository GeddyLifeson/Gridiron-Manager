// The season-level calibration report (Q1.7.2 season level, J15.10.1 form). One line per target row of
// layer `season`. A row is measured only when this harness has a measure for its id and the seasons ran;
// otherwise it prints NOT MEASURABLE with what it is waiting for, or MISSING SOURCE when it has no fact
// row. The gate looks at certify rows only, and a run with a failed season never passes.
// The text is byte-identical for the same outcomes: fixed order, fixed number formatting, no clock.
import type { CalibrationTarget, FactStatus, TargetResult } from '@gm/schema';
import { compareScalar, fmt, sampleSd, type LoadedTargets } from '../calibration/index.ts';
import type { SeasonLine, SeasonOutcome } from './seasons.ts';

export interface MeasureContext {
  /** `standings.tie_win_value` of the competition's league rules. */
  readonly tieWinValue: number;
}

export interface Observation { readonly value: number; readonly events: number }
export type SeasonMeasure = (lines: readonly SeasonLine[], ctx: MeasureContext) => Observation | null;

const teamSeasons = (lines: readonly SeasonLine[]) => lines.flatMap((l) => l.teams).filter((t) => t.gamesInside > 0);
const share = (hit: number, of: number): Observation | null => (of === 0 ? null : { value: hit / of, events: of });
/** Share of team-seasons whose wins inside the competition meet `test` (the target definitions count top-subdivision games only). */
const winShare = (test: (wins: number) => boolean): SeasonMeasure => (lines) => { const ts = teamSeasons(lines); return share(ts.filter((t) => test(t.winsInside)).length, ts.length); };
const sumOf = (lines: readonly SeasonLine[], f: (l: SeasonLine) => number) => lines.reduce((s, l) => s + f(l), 0);

/** Measures by target id. The thresholds are the ones the target ids and definitions name. */
export const SEASON_MEASURES: Readonly<Record<string, SeasonMeasure>> = {
  'spread.teamWinPctSd': (lines, ctx) => {
    const ts = teamSeasons(lines);
    const sd = sampleSd(ts.map((t) => (t.winsInside + ctx.tieWinValue * t.tiesInside) / t.gamesInside));
    return sd === null ? null : { value: sd, events: ts.length };
  },
  'spread.share6PlusWins': winShare((w) => w >= 6),
  'spread.share10PlusWins': winShare((w) => w >= 10),
  'spread.share2OrFewerWins': winShare((w) => w <= 2),
  'schedule.conferenceGameShare': (lines) => share(sumOf(lines, (l) => l.insideConferenceGames), sumOf(lines, (l) => l.insideGames)),
  'schedule.neutralShare': (lines) => share(sumOf(lines, (l) => l.insideNeutralGames), sumOf(lines, (l) => l.insideGames)),
  'tier.powerBeatsOther': (lines) => share(sumOf(lines, (l) => l.crossTierPowerWins), sumOf(lines, (l) => l.crossTierGames)),
  'tier.topSubBeatsLower': (lines) => share(sumOf(lines, (l) => l.guestGamesWon), sumOf(lines, (l) => l.guestGames)),
};

/** What a season row with no measure here is waiting for, by id prefix. First match wins. */
const WAITING: readonly (readonly [string, string])[] = [
  ['upset.', 'team ratings from the strength model (G-71) carried from one season to the next (G-81 world loop)'],
  ['spread.homeFieldRatingAdj', 'team ratings from the strength model (G-71) inside the season run'],
  ['spread.teamRatingSd', 'team ratings from the strength model (G-71) inside the season run'],
  ['injury.', 'the medical process across weeks (G-33) inside the season run (G-81 world loop)'],
  ['spread.presnapFoul', 'generated teams and coaches, and year-over-year runs (G-88)'],
  ['spread.fumbleRate', 'generated teams and player-level split halves (G-17 rosters in the game port)'],
  ['spread.coach', 'generated coaches (K2) and multi-season histories (Q2.5.1, G-88)'],
  ['pro.season.agent', 'the market and agents inside a season (G-35, G-77 through G-81)'],
  ['both.season.crises', 'crisis events inside a season (L9 through G-81)'],
];
export function waitingFor(id: string): string {
  return WAITING.find(([prefix]) => id.startsWith(prefix))?.[1] ?? 'no season measure is written for this row yet';
}

export type SeasonRowState = 'measured' | 'missing_source' | 'not_measurable' | 'no_events';

export interface SeasonReportRow extends TargetResult {
  readonly state: SeasonRowState;
  readonly leaf: string;
  readonly simEvents: number;
  /** For a row that is not measurable: what it waits for. */
  readonly waitingFor: string | null;
}

export interface SeasonRunInfo {
  readonly build: string;
  readonly paramsVersion: string;
  readonly masterSeedHex: string;
  readonly seasonsAsked: number;
  /** Who the teams are: placeholder rosters (average teams) or generated rosters (Q1.7.2 inputs). */
  readonly teamModel: string;
  /** Inputs in use that no shipped data file carries (leagues.ts). */
  readonly provisionalInputs: readonly string[];
}

export type SeasonGateVerdict = 'pass' | 'fail' | 'no_certify_rows';

export interface SeasonReport {
  readonly ruleSetId: string;
  readonly targetsVersion: string;
  readonly run: SeasonRunInfo;
  readonly rows: readonly SeasonReportRow[];
  readonly gate: SeasonGateVerdict;
  readonly gateReasons: readonly string[];
  readonly seasonsCompleted: number;
  readonly seasonsFailed: number;
  readonly firstFailures: readonly string[];
  /** Printed for the reader; no target row judges these (Q1.7.2 names them, no source gives numbers yet). */
  readonly described: readonly { readonly name: string; readonly value: number | null; readonly events: number }[];
  readonly loaderProblems: readonly string[];
}

function row(t: CalibrationTarget, status: FactStatus | null, lines: readonly SeasonLine[], ctx: MeasureContext): SeasonReportRow {
  const base = { id: t.id, leaf: t.leaf, real: t.value, status, tier: t.tier, provisional: status !== 'Verified' };
  const none = (state: SeasonRowState, waiting: string | null): SeasonReportRow => ({ ...base, simulated: null, signedError: null, toleranceUsed: null, pass: null, state, simEvents: 0, waitingFor: waiting });
  if (t.factId === null || typeof t.value !== 'number') return none('missing_source', null);
  const measure = SEASON_MEASURES[t.id];
  if (!measure) return none('not_measurable', waitingFor(t.id));
  const obs = measure(lines, ctx);
  if (obs === null) return none('no_events', null);
  const c = compareScalar(t, obs.value, obs.events);
  return { ...base, simulated: obs.value, signedError: c.signedError, toleranceUsed: c.toleranceUsed, pass: c.pass, state: 'measured', simEvents: obs.events, waitingFor: null };
}

function describe(lines: readonly SeasonLine[], ctx: MeasureContext): SeasonReport['described'] {
  const ts = teamSeasons(lines);
  const pcts = ts.map((t) => (t.winsInside + ctx.tieWinValue * t.tiesInside) / t.gamesInside);
  const out: { name: string; value: number | null; events: number }[] = [
    { name: 'team win share, standard deviation over team-seasons', value: sampleSd(pcts), events: ts.length },
    { name: 'most wins by a team in a regular season', value: ts.length ? Math.max(...ts.map((t) => t.wins)) : null, events: ts.length },
    { name: 'fewest wins by a team in a regular season', value: ts.length ? Math.min(...ts.map((t) => t.wins)) : null, events: ts.length },
    { name: 'overtime games per regular-season game', value: share(sumOf(lines, (l) => l.overtimeGames), sumOf(lines, (l) => l.regularGames))?.value ?? null, events: sumOf(lines, (l) => l.regularGames) },
    { name: 'tied games per regular-season game', value: share(sumOf(lines, (l) => l.tiedGames), sumOf(lines, (l) => l.regularGames))?.value ?? null, events: sumOf(lines, (l) => l.regularGames) },
  ];
  // Spread of player statistics and how often a season's best total is the best of the whole run (record frequency).
  const statIds = [...new Set(lines.flatMap((l) => l.statSpread.map((s) => s.statId)))].sort();
  for (const statId of statIds) {
    const per = lines.map((l) => l.statSpread.find((s) => s.statId === statId)).filter((s): s is NonNullable<typeof s> => s !== undefined);
    const maxes = per.map((s) => s.max);
    let best = Number.NEGATIVE_INFINITY, records = 0;
    for (const m of maxes) if (m > best) { best = m; records++; }
    out.push({ name: `${statId}: mean season-leading total`, value: maxes.reduce((a, b) => a + b, 0) / maxes.length, events: maxes.length });
    out.push({ name: `${statId}: seasons that set a new run record, share`, value: records / maxes.length, events: maxes.length });
  }
  return out;
}

export function buildSeasonReport(loaded: LoadedTargets, outcomes: readonly SeasonOutcome[], run: SeasonRunInfo, ctx: MeasureContext): SeasonReport {
  const lines = outcomes.filter((o) => o.ok && o.line !== null).map((o) => o.line!);
  const failed = outcomes.filter((o) => !o.ok);
  const targets = loaded.file.targets.filter((t) => t.layer === 'season');
  const rows = targets.map((t) => row(t, loaded.statusOf.get(t.id) ?? null, lines, ctx));
  const certify = rows.filter((r) => r.tier === 'certify');
  const reasons: string[] = [];
  if (loaded.problems.length) reasons.push(`${loaded.problems.length} target loader problems`);
  if (failed.length) reasons.push(`${failed.length} of ${outcomes.length} seasons stopped before the final game`);
  if (outcomes.length < run.seasonsAsked) reasons.push(`${outcomes.length} of ${run.seasonsAsked} seasons were run`);
  if (certify.some((r) => r.pass !== true)) reasons.push(`${certify.filter((r) => r.pass === true).length} of ${certify.length} certify rows pass`);
  const gate: SeasonGateVerdict = reasons.length ? 'fail' : certify.length === 0 ? 'no_certify_rows' : 'pass';
  return {
    ruleSetId: loaded.file.ruleSetId, targetsVersion: loaded.file.version, run, rows, gate, gateReasons: reasons,
    seasonsCompleted: lines.length, seasonsFailed: failed.length, firstFailures: failed.slice(0, 5).map((o) => `season ${o.index} (seed ${o.seedHex}) after ${o.gamesPlayed} games: ${o.error}`),
    described: lines.length ? describe(lines, ctx) : [], loaderProblems: loaded.problems,
  };
}

function label(r: SeasonReportRow): string {
  const head = r.state === 'missing_source' ? 'MISSING SOURCE' : r.state === 'not_measurable' ? 'NOT MEASURABLE' : r.state === 'no_events' ? 'NO EVENTS' : r.pass ? 'PASS' : 'FAIL';
  return r.provisional ? `${head} PROVISIONAL` : head;
}

export function formatSeasonReport(rep: SeasonReport): string {
  const L: string[] = [];
  L.push(`Season-level calibration report (Q1.7.2): ${rep.ruleSetId} (targets version ${rep.targetsVersion})`);
  L.push(`Build ${rep.run.build}; parameters ${rep.run.paramsVersion}; master seed ${rep.run.masterSeedHex}; seasons asked ${rep.run.seasonsAsked}, completed ${rep.seasonsCompleted}, stopped ${rep.seasonsFailed}`);
  L.push(`Teams: ${rep.run.teamModel}`);
  L.push(`Gate: ${rep.gate === 'pass' ? 'PASS (every certify row passes)' : rep.gate === 'no_certify_rows' ? 'NOT PASSED: no season row is certify tier (no Verified season target), so nothing can certify this level' : `FAIL (${rep.gateReasons.join('; ')})`}`);
  const measured = rep.rows.filter((r) => r.state === 'measured');
  L.push(`Rows ${rep.rows.length}: measured ${measured.length} (pass ${measured.filter((r) => r.pass).length}, fail ${measured.filter((r) => !r.pass).length}), not measurable ${rep.rows.filter((r) => r.state === 'not_measurable').length}, missing source ${rep.rows.filter((r) => r.state === 'missing_source').length}; provisional ${rep.rows.filter((r) => r.provisional).length} of ${rep.rows.length}. A pass on a provisional row is not a verified match.`);
  if (rep.run.provisionalInputs.length) {
    L.push('', 'PROVISIONAL inputs in use (not from a shipped data file):');
    for (const p of rep.run.provisionalInputs) L.push(`  ${p}`);
  }
  if (rep.firstFailures.length) {
    L.push('', 'Seasons that stopped (first five):');
    for (const f of rep.firstFailures) L.push(`  ${f}`);
  }
  if (rep.loaderProblems.length) {
    L.push('', 'Loader problems:');
    for (const p of rep.loaderProblems) L.push(`  ${p}`);
  }
  L.push('', 'id | leaf | tier | status | real | simulated | signed error | tolerance | events | result');
  for (const r of rep.rows) L.push([r.id, r.leaf, r.tier, r.status ?? 'none', fmt(r.real), fmt(r.simulated), fmt(r.signedError), fmt(r.toleranceUsed), String(r.simEvents), label(r)].join(' | '));
  const waiting = rep.rows.filter((r) => r.waitingFor !== null);
  if (waiting.length) {
    L.push('', 'Not measurable yet, and what each row waits for:');
    for (const r of waiting) L.push(`  ${r.id}: ${r.waitingFor}`);
  }
  if (rep.described.length) {
    L.push('', 'Described, with no target row to judge it (spread of team wins, player statistics, record frequency):');
    for (const d of rep.described) L.push(`  ${d.name}: ${fmt(d.value)} (${d.events})`);
  }
  return L.join('\n') + '\n';
}
