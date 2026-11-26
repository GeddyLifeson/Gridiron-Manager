// Season-point pass, culture (X9), bound to the live world. At each season point every playing team's
// culture record drifts with what its leaders did that season (X9.3.1) and takes its next expectation from
// its history (X9.2.1), through `people.culture`. The working record keeps real numbers between seasons
// (CR-G24-3); `world.cultures` holds the rounded G-00 row the rest of the world reads.
import { culture } from '@gm/people';
import type { CultureRecord } from '@gm/schema';
import { isActive } from '../loop/lifecycle.ts';
import type { LiveWorld, StepHandler } from '../loop/types.ts';
import { levelOfTeam, type Level, type RuleRead } from '../turnover/binding.ts';
import { param } from './params.ts';
import { KEY, recordsSoFar, stateOf, winRate } from './shared.ts';

const HISTORY_SEASONS = 10;

export interface CultureState {
  /** Team id to the working record (real-valued fields, resources, ratchet). */
  readonly working: Map<number, culture.Culture>;
  /** Team id to its seasons, oldest first, at most ten (X9.2.1 rule 1 long-run window). */
  readonly seasons: Map<number, culture.SeasonResult[]>;
  /** Team id to the owner or athletic director seen at the last season point. */
  readonly deciders: Map<number, number | null>;
  /** Season whose point has run. */
  ranFor: number | null;
}

export function cultureStateOf(world: LiveWorld): CultureState {
  return stateOf<CultureState>(world, KEY.culture, () => ({ working: new Map(), seasons: new Map(), deciders: new Map(), ranFor: null }));
}

/** The culture row the rest of the world reads for a team (need weight overrides, X5.1.1 rule 5). */
export function cultureOf(world: LiveWorld, teamId: number): CultureRecord | undefined {
  return world.cultures.get(teamId);
}

export interface CultureBinding {
  readonly rule: RuleRead;
  /** The level's two postseason goal ids (C2, T3 league-rules content), passed so no code branches on a level. */
  readonly goals: (level: Level) => { readonly cut: string; readonly top: string };
}

/** A working record from the stored row: resources are not in the G-00 row yet (CR-G24-2), so `mid`. */
function fromRecord(r: CultureRecord, games: number): culture.Culture {
  const g = Math.max(1, games);
  return {
    teamId: r.teamId, labelPreferences: { ...r.labelPreferences }, conductTolerance: { ...r.conductTolerance }, patience: r.patienceSeasons,
    resources: 'mid', needWeightOverrides: { ...r.needWeightOverrides }, traditionStrength: r.traditionStrength,
    expectation: {
      year: r.expectation.year, rateLow: r.expectation.winsLow / g, rateHigh: r.expectation.winsHigh / g, winsLow: r.expectation.winsLow,
      winsHigh: r.expectation.winsHigh, postseasonTarget: r.expectation.postseasonTarget, ratchet: 0,
    },
  };
}

function headCoachIn(world: LiveWorld, teamId: number, seasonYear: number): number | null | undefined {
  for (let i = world.staffSeasons.length - 1; i >= 0; i--) {
    const s = world.staffSeasons[i]!;
    if (s.seasonYear === seasonYear && s.teamId === teamId) return s.headCoachId;
    if (s.seasonYear < seasonYear) break;
  }
  return undefined;
}

/** Seasons in a row the head coach of `seasonYear` has held the team's chair. */
function seasonsInJob(world: LiveWorld, teamId: number, seasonYear: number, coachId: number): number {
  let n = 0;
  for (let y = seasonYear; headCoachIn(world, teamId, y) === coachId; y--) n++;
  return n;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return 0.5;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[i]!;
}

export function cultureStep(b: CultureBinding): StepHandler {
  return (ctx) => {
    const { world } = ctx;
    const year = world.date.seasonYear;
    const state = cultureStateOf(world);
    if (state.ranFor === year) return { teams: 0, moved: 0, coachChanges: 0, traditionMean: 0 };
    state.ranFor = year;
    const records = recordsSoFar(world);
    const champions = new Set<number>();
    const games = new Map<number, number>();
    for (const g of world.results) {
      if (g.kind === 'regular') { games.set(g.homeTeamId, (games.get(g.homeTeamId) ?? 0) + 1); games.set(g.awayTeamId, (games.get(g.awayTeamId) ?? 0) + 1); }
      if (g.title && g.homePoints !== g.awayPoints) champions.add(g.homePoints > g.awayPoints ? g.homeTeamId : g.awayTeamId);
    }
    let teams = 0, moved = 0, coachChanges = 0;
    let traditionSum = 0;
    for (const comp of world.competitions) {
      const alive = comp.teamIds.filter((id) => isActive(world, id, year) && records.has(id)).sort((x, y) => x - y);
      if (alive.length === 0) continue;
      const rates = alive.map((id) => winRate(records.get(id)) ?? 0.5).sort((x, y) => y - x);
      const level = levelOfTeam(world, alive[0]!);
      const field = b.rule(level, 'playoff.field_size') ?? 0;
      const cutRate = field > 0 ? rates[Math.min(rates.length - 1, field - 1)]! : 1;
      const topFifth = quantile([...rates].sort((x, y) => x - y), param('culture.topFifthQuantile'));
      for (const teamId of alive) {
        const row = world.cultures.get(teamId);
        if (!row) continue;
        const n = games.get(teamId) ?? 0;
        const c = state.working.get(teamId) ?? fromRecord(row, n);
        const rate = winRate(records.get(teamId)) ?? 0.5;
        const hist = [...(state.seasons.get(teamId) ?? []), { year, winRate: rate, wonTitle: champions.has(teamId) }].slice(-HISTORY_SEASONS);
        state.seasons.set(teamId, hist);

        // X9.3.1: who decided this season. The head coach chair is read from the staff seasons the loop keeps.
        const head = headCoachIn(world, teamId, year) ?? null;
        const before = headCoachIn(world, teamId, year - 1);
        const changed = before !== undefined && before !== head;
        if (changed) coachChanges++;
        const decisions: culture.CoachDecision[] = [];
        if (changed && before !== null && before !== undefined) decisions.push({ call: 'fired', seasonInJob: seasonsInJob(world, teamId, year - 1, before), missedTarget: true });
        else if (!changed && head !== null) decisions.push({ call: 'kept', seasonInJob: seasonsInJob(world, teamId, year, head), missedTarget: rate < c.expectation.rateLow });
        const team = world.teams.find((t) => t.id === teamId);
        const decider = team ? team.ownerPersonId ?? team.athleticDirectorPersonId : null;
        const prevDecider = state.deciders.get(teamId);
        state.deciders.set(teamId, decider);
        const interim = [...world.jobs.values()].some((j) => j.teamId === teamId && j.positionId === 'pos:head_coach' && j.holding === 'interim');
        const drift = culture.seasonEndDrift(c, {
          // L3 discipline cases and X2.2.1 labels are not recorded off-screen yet (README PD-09): no evidence, no drift on those fields.
          discipline: [], personnel: [], coachDecisions: decisions,
          ownerOrAdChanged: prevDecider !== undefined && prevDecider !== decider, headCoachChanged: changed, interimSeason: interim,
        });
        moved += drift.moved.length;

        const recent = hist.slice(-param('culture.projectionSeasons'));
        const projection = recent.reduce((s, r) => s + r.winRate, 0) / recent.length;
        culture.setExpectation(c, {
          history: hist, projection, previous: c.expectation, goals: b.goals(level), postseasonCutRate: cutRate, topFifthRate: topFifth,
          games: n, year: year + 1,
        });
        state.working.set(teamId, c);
        world.cultures.set(teamId, culture.toCultureRecord(c));
        traditionSum += c.traditionStrength;
        teams++;
      }
    }
    return { teams, moved, coachChanges, traditionMean: teams === 0 ? 0 : Math.round((traditionSum / teams) * 100) / 100 };
  };
}
