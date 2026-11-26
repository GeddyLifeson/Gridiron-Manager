// The phase 6 gate (R1.2.7): the week and one season, both levels. Five gate items; this harness runs
// the ones it owns and lists the others with their owner, so the page always shows all five. A gate
// passes only when every item passes on the same commit; an item that was not run, or ran on
// provisional inputs, holds the gate.
import { loadTargets } from '../calibration/index.ts';
import { runBattery, formatBatteryReport, type BatteryReport } from './battery/report.ts';
import { ADMITTED_BINDINGS } from './battery/bindings.ts';
import { buildSeason, REPO_ROOT } from './leagues.ts';
import { param } from './params.ts';
import { buildSeasonReport, type SeasonReport } from './season-report.ts';
import { loadPort, runOneSeason, runSeasons, type PortRef, type SeasonOutcome, type SeasonRunSpec } from './seasons.ts';

export type GateItemState = 'pass' | 'fail' | 'hold' | 'not_run_here';

export interface GateItem {
  readonly number: number;
  readonly text: string;
  readonly state: GateItemState;
  readonly detail: readonly string[];
}

export interface PhaseSixGate {
  readonly build: string;
  readonly masterSeedHex: string;
  readonly ruleSets: readonly string[];
  readonly items: readonly GateItem[];
  readonly verdict: 'pass' | 'hold';
  readonly seasonReports: readonly SeasonReport[];
  readonly battery: BatteryReport;
}

export interface GateOptions {
  readonly build: string;
  readonly masterSeedHex: string;
  readonly seasonYear: number;
  readonly ruleSets: readonly string[];
  readonly port: PortRef;
  /** Seasons per level for the Q1.7.2 report; the bible's count when left out. */
  readonly seasons?: number;
  readonly workers?: number;
  /** Season outcomes already run (a long run is done once and read here), by rule set. */
  readonly outcomes?: Readonly<Record<string, readonly SeasonOutcome[]>>;
  readonly teamModel: string;
  readonly root?: string;
  readonly onSeason?: (ruleSetId: string, o: SeasonOutcome) => void;
}

const worst = (states: readonly GateItemState[]): GateItemState => (states.includes('fail') ? 'fail' : states.includes('hold') ? 'hold' : states.includes('not_run_here') ? 'not_run_here' : 'pass');

export async function runPhaseSixGate(o: GateOptions): Promise<PhaseSixGate> {
  const root = o.root ?? REPO_ROOT;
  const asked = o.seasons ?? param('seasonGate.seasonsPerLevel');

  // Item 1: a full season at the head coach seat at each level, start to final game.
  const seatDetail: string[] = [];
  const seatStates: GateItemState[] = [];
  // Item 2b: the same season twice gives the same hash on this platform (Q1.3.1 season replay).
  const replayDetail: string[] = [];
  const replayStates: GateItemState[] = [];
  for (const ruleSetId of o.ruleSets) {
    const probe = buildSeason(ruleSetId, { season: o.seasonYear, seedHex: o.masterSeedHex, root });
    const seatTeamKey = probe.spec.teams[0]!.key;
    const spec: SeasonRunSpec = { ruleSetId, seasonYear: o.seasonYear, seasons: 1, masterSeedHex: o.masterSeedHex, port: o.port, seatTeamKey };
    const playGame = await loadPort(o.port, ruleSetId);
    const first = runOneSeason(spec, 0, playGame);
    if (!first.ok || first.line === null) {
      seatStates.push('fail'); replayStates.push('fail');
      seatDetail.push(`${ruleSetId}: the season stopped after ${first.gamesPlayed} games at ${first.error}`);
      replayDetail.push(`${ruleSetId}: no season hash, the season did not finish`);
      continue;
    }
    const weeks = first.line.seatWeeks;
    const provisional = probe.provisional.length > 0;
    seatStates.push(provisional ? 'hold' : 'pass');
    seatDetail.push(`${ruleSetId}: ${first.line.regularGames} regular and ${first.line.postseasonGames} postseason games, champion ${first.line.champion}, seat ${seatTeamKey} through ${weeks} weeks${provisional ? `; HOLD: ${probe.provisional.length} provisional inputs in use` : ''}`);
    const second = runOneSeason(spec, 0, playGame);
    const same = second.ok && second.line?.seasonHash === first.line.seasonHash;
    replayStates.push(same ? 'pass' : 'fail');
    replayDetail.push(`${ruleSetId}: season hash ${first.line.seasonHash}${same ? ' twice on this platform' : ` then ${second.line?.seasonHash ?? 'a stopped season'}`}; compare this hash on every platform of P2.3`);
  }

  // Item 2a: Q1.7.2 season level.
  const seasonReports: SeasonReport[] = [];
  for (const ruleSetId of o.ruleSets) {
    const spec: SeasonRunSpec = { ruleSetId, seasonYear: o.seasonYear, seasons: asked, masterSeedHex: o.masterSeedHex, port: o.port };
    const outcomes = o.outcomes?.[ruleSetId] ?? await runSeasons(spec, { workers: o.workers ?? 1, ...(o.onSeason ? { onSeason: (s) => o.onSeason!(ruleSetId, s) } : {}) });
    const built = buildSeason(ruleSetId, { season: o.seasonYear, seedHex: o.masterSeedHex, root });
    const tie = built.spec.leagueRules['standings.tie_win_value'];
    seasonReports.push(buildSeasonReport(loadTargets(root, ruleSetId), outcomes, {
      build: o.build, paramsVersion: o.build, masterSeedHex: o.masterSeedHex, seasonsAsked: param('seasonGate.seasonsPerLevel'),
      teamModel: o.teamModel, provisionalInputs: built.provisional,
    }, { tieWinValue: typeof tie === 'number' ? tie : Number.NaN }));
  }
  const levelStates: GateItemState[] = seasonReports.map((r) => (r.gate === 'pass' ? (r.run.provisionalInputs.length ? 'hold' : 'pass') : r.gate === 'fail' ? 'fail' : 'hold'));
  const levelDetail = seasonReports.map((r) => `${r.ruleSetId}: Q1.7.2 season level ${r.gate === 'pass' ? 'passes' : r.gate === 'fail' ? `fails (${r.gateReasons.join('; ')})` : 'has no certify row, so it cannot pass yet'}; ${r.seasonsCompleted} seasons completed, ${r.rows.filter((x) => x.state === 'measured').length} of ${r.rows.length} season rows measured`);

  // Item 3: the Q3.2.5 preparation and tendency items.
  const battery = runBattery({ parameterSetId: o.build, masterSeedHex: o.masterSeedHex, ruleSets: o.ruleSets, bindings: ADMITTED_BINDINGS, leaves: ['Q3.2.5'] });
  const batteryState: GateItemState = battery.verdict === 'pass' ? 'pass' : battery.verdict === 'blocked' ? 'fail' : 'hold';

  const items: GateItem[] = [
    { number: 1, text: 'A full season is playable at the head coach seat at each level, start to final game', state: worst(seatStates), detail: seatDetail },
    { number: 2, text: 'Q1.7.2 season level passes. Q1.3.1 season replay passes on every platform', state: worst([...levelStates, ...replayStates]), detail: [...levelDetail, ...replayDetail] },
    { number: 3, text: 'Q3.2.5 preparation and tendency items pass', state: batteryState, detail: [`${battery.counts.passed} of ${battery.counts.items} items pass, ${battery.counts.blocking} blocking failures, ${battery.counts.notRun} not run`] },
    { number: 4, text: 'Q1.5.1 and Q1.5.3 pass for every screen that exists', state: 'not_run_here', detail: ['Owned by the interface test suites (app-ui); read their result from test-results on the same commit'] },
    { number: 5, text: 'P6.1.1 world-week budget met', state: 'not_run_here', detail: ['Owned by the performance pass (G-97), measured on the target machine'] },
  ];
  return { build: o.build, masterSeedHex: o.masterSeedHex, ruleSets: o.ruleSets, items, verdict: items.every((i) => i.state === 'pass') ? 'pass' : 'hold', seasonReports, battery };
}

const STATE_TEXT: Readonly<Record<GateItemState, string>> = { pass: 'PASS', fail: 'FAIL', hold: 'HOLD', not_run_here: 'NOT RUN HERE' };

export function formatPhaseSixGate(g: PhaseSixGate): string {
  const L: string[] = [];
  L.push(`Phase 6 gate (R1.2.7): the week and one season, both levels`);
  L.push(`Build ${g.build}; master seed ${g.masterSeedHex}; rule sets ${g.ruleSets.join(', ')}`);
  L.push(`Verdict: ${g.verdict === 'pass' ? 'PASS' : 'HOLD (every item must pass on the same commit, on every platform, under both rule sets)'}`);
  for (const i of g.items) {
    L.push('', `${i.number}. ${i.text}: ${STATE_TEXT[i.state]}`);
    for (const d of i.detail) L.push(`   ${d}`);
  }
  L.push('', 'Edge case (R1.2.7): college time limits and practice limits ship as config and are marked PROVISIONAL at this gate.');
  L.push('', formatBatteryReport(g.battery).trimEnd());
  return L.join('\n') + '\n';
}
