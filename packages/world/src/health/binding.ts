// D11 bound to the live world: the weekly `health` step. Injuries from play arrive through the games step
// (GamePlayed.injuries, J10.6.1); each opens a league.medical case (G-33), and every world day advances the
// open cases (recovery, setbacks, the concussion protocol, hidden injuries found, the physician's state).
// The step keeps its state in `LiveWorld.systemState` and decides nothing medical itself: the numbers are
// league.medical's and the catalogue's. Nothing here invents an injury: a week whose games report none
// opens none, and the step counts the games that did not report so a run can say so.
import { calendar, medical } from '@gm/league';
import type { PersonRecord, RuleSet, WorldDate } from '@gm/schema';
import { GAME_INJURIES_KEY, type GameInjury, type LiveWorld, type StepContext, type StepHandler, type WeekInjuries } from '../loop/types.ts';
import { PLAYER_INJURED } from './events.ts';
import { param as loopParam } from '../loop/params.ts';
import { param } from './params.ts';

/** `LiveWorld.systemState` key of the health step's state. */
export const HEALTH_KEY = 'health';
/** J13 stream name of the medical draws (schema sim/random.ts lists `injury`). */
export const STREAM_HEALTH = 'injury';

/** What the world keeps about one person's past injuries: only what later medical draws or readers use. */
export interface InjuryHistory {
  /** Absolute days of known concussions within `history.concussionKeepDays` (D11.4.2 prior-concussion effect). */
  readonly concussionDays: readonly number[];
  /** Cases whose true course was major or season ending (D8.4.1 retirement, TO-05 reads it). */
  readonly majorInjuries: number;
  /** Season of the last season-ending case, or null. */
  readonly lastSeasonEnding: number | null;
  readonly injuries: number;
}

export interface HealthState {
  /** Open league.medical cases, in id order. Recovered cases leave; their person keeps an `InjuryHistory`. */
  readonly cases: readonly medical.MedicalCase[];
  /** Person id to history, as sorted entries (plain data for the world hash). */
  readonly history: readonly (readonly [number, InjuryHistory])[];
  /** Last absolute day the cases were advanced through, or null before the first pass. */
  readonly lastDay: number | null;
  readonly nextCaseId: number;
  /** Games played while bound whose port reported no injury list (placeholder rosters, reference resolver). */
  readonly unreportedGames: number;
  readonly reportedGames: number;
  readonly opened: number;
}

export function emptyHealth(): HealthState {
  return { cases: [], history: [], lastDay: null, nextCaseId: 1, unreportedGames: 0, reportedGames: 0, opened: 0 };
}

export function healthOf(world: LiveWorld): HealthState {
  return (world.systemState.get(HEALTH_KEY) as HealthState | undefined) ?? emptyHealth();
}

/** Open case of a person, or null. A person has at most one open case per injury; the first by id is returned. */
export function openCaseOf(world: LiveWorld, personId: number): medical.MedicalCase | null {
  return healthOf(world).cases.find((c) => c.personId === personId) ?? null;
}

/** The physician has not cleared him for any case the staff know of (D11.3.1). */
export function isOut(world: LiveWorld, personId: number): boolean {
  return healthOf(world).cases.some((c) => c.personId === personId && c.shown.known && c.shown.state === 'not_cleared');
}

export function injuryHistoryOf(world: LiveWorld, personId: number): InjuryHistory | null {
  return healthOf(world).history.find(([id]) => id === personId)?.[1] ?? null;
}

/** The medical rules the step reads, by level of the team's league. */
export type MedicalRulesFor = (level: 'pro' | 'college') => medical.MedicalRules;

export interface HealthBinding {
  /** D11.2.1 catalogue (football-content data/injuries/catalogue.json through `medical.catalogueFrom`). */
  readonly catalogue: medical.Catalogue;
  readonly rules: MedicalRulesFor;
  /** League level of a team (pro or college). */
  readonly levelOfTeam: (world: LiveWorld, teamId: number) => 'pro' | 'college';
}

/**
 * Medical rules from a rule-key reader. The `medical.*` keys are requested from G-10 and not in rules-data
 * yet; until they are, a missing key takes the value G-33 built and tested against (`FALLBACK_RULES`), and
 * `fallbackKeys` names every key read that way so a run can report it.
 */
export function medicalRulesFrom(level: 'pro' | 'college', read: (key: string) => number | string | boolean | undefined): { rules: medical.MedicalRules; fallbackKeys: string[] } {
  const fb = FALLBACK_RULES[level];
  const used: string[] = [];
  const values: Record<string, number | string | boolean> = {};
  for (const k of Object.keys(fb)) {
    const v = read(k);
    if (v === undefined) { values[k] = fb[k]!; used.push(k); } else values[k] = v;
  }
  if (level === 'pro' && !('roster.ir_min_games' in values)) {
    const ir = read('roster.ir_min_games');
    if (ir !== undefined) values['roster.ir_min_games'] = ir;
  }
  const rs: RuleSet = {
    id: `world.health.${level}`, level, seasonYear: 0,
    num: (k) => Number(need(values, k)), bool: (k) => { const v = need(values, k); return v === true || v === 1; }, opt: (k) => String(need(values, k)),
    keys: () => Object.keys(values).sort(),
  };
  return { rules: medical.medicalRules(rs), fallbackKeys: used.sort() };
}

function need(values: Record<string, number | string | boolean>, k: string): number | string | boolean {
  const v = values[k];
  if (v === undefined) throw new Error(`world.health: no rule ${k}`);
  return v;
}

/**
 * The values league.medical was built and tested with (packages/league/test/medical/helpers.ts, bible
 * D11.3.1, D11.4.2, D11.5.1, H5.2.1). Pro five-step protocol: F-injury-0001. The rest wait on G-10 fact
 * rows; a run that reads any of them says so. Not rule data: rules-data wins the day the keys land.
 */
export const FALLBACK_RULES: Readonly<Record<'pro' | 'college', Readonly<Record<string, number | string | boolean>>>> = {
  pro: {
    'medical.independent_authority': true, 'medical.concussion_protocol': 'league_five_step', 'medical.concussion_consultant_confirms': true,
    'medical.injury_report_rule': 'weekly_practice_and_status', 'medical.report_practice_days': 3,
  },
  college: {
    'medical.independent_authority': true, 'medical.concussion_protocol': 'league_five_step', 'medical.concussion_consultant_confirms': false,
    'medical.injury_report_rule': 'none', 'medical.report_practice_days': 3,
  },
};

/**
 * J10.6.1 region and severity seed to a D11 catalogue row and grade. The engine's regions are the
 * catalogue's report-level row ids; a region the catalogue lacks is `all_other`. With numeric grades the
 * seed takes its equal band (grade 1 lowest), the same banding `drawRecoveryDays` uses.
 */
export function diagnosisOf(cat: medical.Catalogue, region: string, severitySeed: number): { typeId: string; grade: number | null } {
  const typeId = cat.has(region) ? region : 'all_other';
  const grades = medical.numericGrades(medical.row(cat, typeId));
  if (grades.length === 0) return { typeId, grade: null };
  const i = Math.min(grades.length - 1, Math.max(0, Math.floor(severitySeed * grades.length)));
  return { typeId, grade: grades[i]! };
}

/** Absolute day number of a world date (league calendar). */
export function dayOf(d: WorldDate): number {
  return calendar.fromWorldDate(d);
}

function staff(): medical.MedicalStaff {
  // No generated medical staff yet (world.health params): ids 0, middle skill.
  return { physicianId: 0, trainerId: 0, consultantIds: [], diagnosticAccuracy: param('staff.diagnosticAccuracy'), caution: param('staff.caution') };
}

function toughness(p: PersonRecord): number {
  return Math.min(1, Math.max(0, (p.traitBlock.facets['toughness'] ?? 50) / 100));
}

/** The weekly `health` step (D11 off-screen). */
export function healthStep(b: HealthBinding): StepHandler {
  return (ctx: StepContext) => {
    const { world } = ctx;
    const today = dayOf(world.date);
    const prev = healthOf(world);
    const history = new Map(prev.history);
    const streams: medical.StreamFor = (scope) => ctx.open(STREAM_HEALTH, scope);

    // This week's reports from the games step; the key is consumed so it never carries into another week.
    const thisWeek = world.results.filter((r) => r.seasonYear === world.date.seasonYear && r.week === world.week).length;
    const rep = world.systemState.get(GAME_INJURIES_KEY) as WeekInjuries | undefined;
    world.systemState.delete(GAME_INJURIES_KEY);
    const week = rep && rep.seasonYear === world.date.seasonYear && rep.week === world.week ? rep : null;
    const reported = week?.reportedGames ?? 0;

    // Open a case for every reported injury (D11.1.1), in report order (game id, then the engine's order).
    let nextCaseId = prev.nextCaseId;
    let opened = 0, emitted = 0;
    const cases: medical.MedicalCase[] = prev.cases.filter((c) => world.people.has(c.personId) && world.status.get(c.personId) !== 'deceased');
    for (const inj of week?.injuries ?? []) {
      const person = world.people.get(inj.personId);
      if (!person) throw new Error(`health: injury reported for unknown person ${inj.personId}`);
      const c = openFrom(b, world, inj, nextCaseId++, today, person, history, streams);
      if (!c) continue;
      cases.push(c);
      opened++;
      if (c.shown.known && person.origin !== 'imported' && emitInjury(ctx, inj, c)) emitted++;
    }

    // Advance every open case one world day at a time, through the last day of this pass's week. The first
    // pass of a season catches up the days since the last one (cases heal over the offseason).
    const from = prev.lastDay === null ? today : prev.lastDay + 1;
    const through = today + loopParam('week.days') - 1;
    const dayCtx: medical.DayContext = {
      staff: staff(), rules: b.rules('pro'), namedInReport: new Set(), consultantAvailable: param('consultant.availableDaily') !== 0,
    };
    let open = cases.sort((a, c) => a.id - c.id);
    let recovered = 0;
    for (let d = from; d <= through; d++) {
      const next: medical.MedicalCase[] = [];
      for (const c of open) {
        const r = medical.caseDay(c, d, { ...dayCtx, rules: b.rules(b.levelOfTeam(world, c.teamId)) }, streams);
        if (r.case.status === 'active') next.push(r.case);
        else { recovered++; remember(history, r.case, world.date.seasonYear); }
      }
      open = next;
    }
    pruneHistory(history, world, today);

    const state: HealthState = {
      cases: open, history: [...history].sort((x, y) => x[0] - y[0]), lastDay: Math.max(through, prev.lastDay ?? through), nextCaseId,
      unreportedGames: prev.unreportedGames + (thisWeek - reported), reportedGames: prev.reportedGames + reported, opened: prev.opened + opened,
    };
    world.systemState.set(HEALTH_KEY, state);
    return { opened, emitted, recovered, open: open.length, unreported: thisWeek - reported };
  };
}

function openFrom(
  b: HealthBinding, world: LiveWorld, inj: GameInjury, caseId: number, today: number, person: PersonRecord,
  history: Map<number, InjuryHistory>, streams: medical.StreamFor,
): medical.MedicalCase | null {
  const { typeId, grade } = diagnosisOf(b.catalogue, inj.region, inj.severitySeed);
  const ev: medical.InjuryEvent = {
    injuryId: caseId, personId: inj.personId, teamId: inj.teamId, typeId, grade, day: today, mechanism: inj.mechanism,
    // Playing through an injury off-screen is not modelled yet (no game-day hurt list in the world).
    fromPlayingThrough: false,
    hideable: !medical.isConcussion(typeId),
  };
  return medical.openCase(ev, {
    catalogue: b.catalogue, staff: staff(), rules: b.rules(b.levelOfTeam(world, inj.teamId)), toughness: toughness(person),
    priorConcussionDays: history.get(inj.personId)?.concussionDays ?? [], evaluationMissed: inj.evaluationMissed,
  }, streams);
}

function emitInjury(ctx: StepContext, inj: GameInjury, c: medical.MedicalCase): boolean {
  const def = ctx.world.logOptions.registry.get(PLAYER_INJURED);
  if (!def) return false;
  const tier = ctx.tierOfTeam(inj.teamId);
  if (tier > def.minTier) return false;
  ctx.emit({
    type: PLAYER_INJURED, date: ctx.world.date, competitionId: null, teamId: inj.teamId, witnesses: { kind: 'public' }, tier,
    subjects: [{ kind: 'person', id: inj.personId }], payload: { injury: c.typeId, mechanism: c.mechanism, severity: c.shown.sidelineClass ?? 'unknown' },
  });
  return true;
}

function remember(history: Map<number, InjuryHistory>, c: medical.MedicalCase, season: number): void {
  const h = history.get(c.personId) ?? { concussionDays: [], majorInjuries: 0, lastSeasonEnding: null, injuries: 0 };
  const cls = medical.severityClassOf(c.truth.totalDays);
  const major = cls === 'major' || cls === 'season_ending';
  history.set(c.personId, {
    concussionDays: medical.isConcussion(c.typeId) && (c.shown.known || c.protocol !== null) ? [...h.concussionDays, c.occurredDay] : h.concussionDays,
    majorInjuries: h.majorInjuries + (major ? 1 : 0),
    lastSeasonEnding: cls === 'season_ending' ? season : h.lastSeasonEnding,
    injuries: h.injuries + 1,
  });
}

/** Drops people no longer in the world and concussion days past the keep window (storage bound). */
function pruneHistory(history: Map<number, InjuryHistory>, world: LiveWorld, today: number): void {
  const keep = param('history.concussionKeepDays');
  for (const [id, h] of history) {
    if (!world.people.has(id)) { history.delete(id); continue; }
    const days = h.concussionDays.filter((d) => today - d <= keep);
    if (days.length !== h.concussionDays.length) history.set(id, { ...h, concussionDays: days });
  }
}
