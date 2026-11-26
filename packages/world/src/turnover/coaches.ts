// Off-screen coach turnover (E2.3.4, E4.3, K7.6.1, K8.4.1, K8.4.2, X8.4), bound to the G-81 loop's `moves`
// step. Every week each AI head coach's decider updates his confidence from the games the public saw
// (K8.3.1, `stakeholders.updateConfidence`); a game that leaves it below 30 brings an emergency review
// (E4.3.1). On the first pass of a season, before the roster cycle (C4: coaching changes come before free
// agency and the draft), the main review runs, coordinators whose units fell below the head coach's
// standard for two seasons are let go (K7.6.1 rule 5), coaches retire or leave (E2.3.4 rule 4), owners and
// athletic directors search for head coaches (K8.4.2), each new head coach brings former colleagues
// (E2.3.4 rule 2) and reviews the staff he inherits (X8.4.1), and every open chair is filled inside first
// or from the pool by the head coach's own search (X8.4.2, K7.6.1). Nobody reads a hidden coach value:
// candidates are seen through their public record, rung and shared seasons only.
import { DMATH, stream } from '@gm/engine-core';
import { market, positions, staff as staffSearch } from '@gm/career';
import { stakeholders } from '@gm/front-office';
import { strength } from '@gm/models';
import { possible, type EventTypeDef, type JobRecord, type PersonRecord, type WorldTier } from '@gm/schema';
import { COACH_POOL } from '../generation/placement.ts';
import { param as genParam } from '../generation/params.ts';
import { isActive } from '../loop/lifecycle.ts';
import { param as loopParam } from '../loop/params.ts';
import type { GameResult, LiveWorld, StepContext, StepHandler } from '../loop/types.ts';
import { ageIn, levelOfTeam, specOf, type Level, type TurnoverBinding } from './binding.ts';
import { LEFT_UNSIGNED } from './events.ts';
import { param } from './params.ts';

export const COACH_STATE = 'world.turnover.coaches';
export const STREAM_COACHES = 'world.turnover.coaches';
/** The pool cohort entrants wait in (X11 `coach_staff_entry`), read beside the coach pool. */
export const ENTRY_POOL = 'coach_staff_entry';
const HEAD = 'pos:head_coach';
/** Phi(x) is close to logistic(1.702 x) (a standard approximation): the public win chance from a predicted margin. */
const PHI_LOGISTIC = 1.702;

/**
 * Event types this step writes, all owned by career (market, staff, positions). The world registers them.
 * Career rows are never compacted (X2.4.1 rule 4), but the career modules mark them compactable, which the
 * world registry refuses; they are registered here with `compactable: false` (fix owed in career, TO-17).
 */
export const COACH_EVENT_TYPES: readonly EventTypeDef[] = [
  ...market.MARKET_EVENT_TYPES.filter((t) => t.id === market.EVENT.fired || t.id === market.EVENT.retired),
  ...staffSearch.STAFF_EVENT_TYPES.filter((t) => t.id === staffSearch.EVENT.fired || t.id === staffSearch.EVENT.hired),
  ...positions.POSITION_EVENT_TYPES.filter((t) => t.id !== positions.EVENT.caller && t.id !== positions.EVENT.retained),
].map((t) => ({ ...t, compactable: false }));
const MIN_TIER = new Map(COACH_EVENT_TYPES.map((t) => [t.id, t.minTier]));

type Side = stakeholders.CandidateView['side'];
type Reason = market.OpeningReason | 'left_football';

interface HeadState {
  personId: number;
  conf: stakeholders.ConfidenceState;
  yearOnJob: number;
  lowStreak: number;
  situation: stakeholders.Situation;
  interim: boolean;
  keptThisSeason: boolean;
  recent: stakeholders.Result[];
  lastWinShare: number | null;
  yearsSincePost: number;
  lastExpectedWins: number | null;
  /** This season so far: regular games, wins, and the public's expected wins (sum of pregame chances). */
  games: number;
  wins: number;
  expected: number;
}

interface CareerNote { lastRung: number; side: Side; outSince: number | null }

/** What the step carries from pass to pass (`LiveWorld.systemState`). Plain data and maps. */
export interface CoachState {
  readonly heads: Map<number, HeadState>;
  readonly careers: Map<number, CareerNote>;
  /** Team id to seasons in a row its offense and its defense were below the head coach's standard. */
  readonly units: Map<number, { offense: number; defense: number }>;
  /** N2.6.1 public strength terms per team after last season, and the preseason total for this one. */
  readonly terms: Map<number, strength.StrengthTerms>;
  readonly total: Map<number, number>;
  readonly fit: Map<number, { home: number; sd: number }>;
  /** The season's results array (the loop replaces it at the season point) and how many rows were read. */
  results: GameResult[] | null;
  seen: number;
  /** Coaches who left football last offseason (retired or not wanted), for the entrant count (E2.3.4 rule 5). */
  exits: number;
  /** Chairs at rungs 0 to 2 filled from outside, or left open, last offseason (TO-15). */
  bottomDemand: number;
  /** `season|level|rung|reason` to openings (E2.3.4 acceptance 1, 2 and 4). */
  readonly openings: Map<string, number>;
}

export function coachState(world: LiveWorld): CoachState {
  let s = world.systemState.get(COACH_STATE) as CoachState | undefined;
  if (!s) {
    s = { heads: new Map(), careers: new Map(), units: new Map(), terms: new Map(), total: new Map(), fit: new Map(), results: null, seen: 0, exits: 0, bottomDemand: 0, openings: new Map() };
    world.systemState.set(COACH_STATE, s);
  }
  return s;
}

/**
 * E2.3.4 rule 5: rung 0 to 2 entrants this season, exits plus the surplus (`market.entrantCount`), for the
 * cohort binding's `openEntryChairs`. TO-15: the cohort runs at the season point, before this offseason's
 * exits are known, so the count reads last offseason's exits or its bottom-rung demand, whichever is larger.
 */
export function coachEntrants(world: LiveWorld): number {
  const s = coachState(world);
  return market.entrantCount(Math.max(s.exits, s.bottomDemand, expectedExits(world)));
}

/** The retirements the coming offseason expects (sum of each chair holder's hazard): the count before any offseason has run. */
function expectedExits(world: LiveWorld): number {
  let sum = 0;
  const seen = new Set<number>();
  for (const j of world.jobs.values()) {
    const id = j.holderPersonId;
    if (id === null || seen.has(id)) continue;
    seen.add(id);
    const p = world.people.get(id);
    if (!p) continue;
    sum += possible(market.retireHazard({ age: ageIn(p, world.date.seasonYear + 1), yearsWithoutJob: 0, healthBurden: 0, wealthIndependence: 0, importedReal: p.origin === 'imported' }));
  }
  return Math.ceil(sum);
}

/** Openings by season, level, rung and reason, as rows. */
export function coachOpenings(world: LiveWorld): readonly { season: number; level: string; rung: number; reason: string; count: number }[] {
  return [...coachState(world).openings].map(([k, count]) => {
    const [season, level, rung, reason] = k.split('|');
    return { season: Number(season), level: level!, rung: Number(rung), reason: reason!, count };
  });
}

/** Job rows by team and by holder, kept in step with every write this step makes (the world has 10,000+ rows). */
class JobIndex {
  readonly team = new Map<number, number[]>();
  readonly held = new Map<number, Set<number>>();
  constructor(private readonly world: LiveWorld) {
    for (const j of [...world.jobs.values()].sort((a, b) => a.id - b.id)) {
      this.team.set(j.teamId, [...(this.team.get(j.teamId) ?? []), j.id]);
      if (j.holderPersonId !== null) this.add(j.holderPersonId, j.id);
    }
  }
  private add(p: number, id: number): void { let x = this.held.get(p); if (!x) { x = new Set(); this.held.set(p, x); } x.add(id); }
  set(j: JobRecord): void {
    const old = this.world.jobs.get(j.id);
    if (old?.holderPersonId != null) this.held.get(old.holderPersonId)?.delete(j.id);
    if (!this.team.has(j.teamId)) this.team.set(j.teamId, []);
    if (!old) this.team.get(j.teamId)!.push(j.id);
    this.world.jobs.set(j.id, j);
    if (j.holderPersonId !== null) this.add(j.holderPersonId, j.id);
  }
  jobsOfTeam(teamId: number): JobRecord[] { return (this.team.get(teamId) ?? []).map((id) => this.world.jobs.get(id)!).filter(Boolean); }
  heldBy(p: number): JobRecord[] { return [...(this.held.get(p) ?? [])].sort((a, b) => a - b).map((id) => this.world.jobs.get(id)!); }
}

interface Cycle {
  readonly ix: JobIndex;
  readonly ctx: StepContext;
  readonly world: LiveWorld;
  readonly b: TurnoverBinding;
  readonly st: CoachState;
  readonly season: number;
  readonly counts: Record<string, number>;
  readonly deciders: Map<string, stakeholders.DecisionMakerProfile>;
}

const bump = (c: Cycle, k: string, n = 1): void => { c.counts[k] = (c.counts[k] ?? 0) + n; };

function open(c: Cycle, teamId: number, rung: number, reason: Reason): void {
  const level = levelOfTeam(c.world, teamId);
  const k = `${c.season}|${level}|${rung}|${reason}`;
  c.st.openings.set(k, (c.st.openings.get(k) ?? 0) + 1);
  bump(c, `open_${reason}`);
}

/** Write a career event when the team's tier records it (X13.1.1: tiers differ only in what is kept). */
function record(c: Cycle, type: string, teamId: number, personId: number | null, payload: Record<string, string | number | boolean | null>, subject: { kind: 'job' | 'person'; id: number } | null): void {
  const tier = c.ctx.tierOfTeam(teamId);
  const min = MIN_TIER.get(type) ?? 3;
  if (tier > min) return;
  const def = COACH_EVENT_TYPES.find((t) => t.id === type)!;
  c.ctx.emit({
    type, date: c.world.date, teamId, actors: personId === null ? [] : [{ personId, role: 'subject' }],
    subjects: subject ? [subject] : [], payload,
    witnesses: def.witnessRule === 'team' ? { kind: 'team', teamId } : { kind: 'public' }, tier: tier as WorldTier,
  });
}

// ---------- staff charts over the world's job rows ----------

function jobsOf(c: Cycle, teamId: number): JobRecord[] {
  return c.ix.jobsOfTeam(teamId);
}

function headJob(c: Cycle, teamId: number): JobRecord | undefined {
  return jobsOf(c, teamId).find((j) => j.positionId === HEAD);
}

/** The positions module's chart rebuilt from the team's job rows (one seat per row). */
function staffOf(c: Cycle, teamId: number): positions.Staff {
  const world = c.world;
  const rows = jobsOf(c, teamId);
  const seats: positions.Seat[] = rows.map((j) => {
    const row = positions.CATALOGUE.job(j.catalogueId);
    return {
      seatId: j.id, catalogueId: j.catalogueId, positionId: j.positionId, title: row.title, rung: j.rung, side: j.side,
      positionGroup: j.positionGroup, dutyIds: j.dutyIds, recruitsOffCampus: j.recruitsOffCampus, gamedaySeat: j.gamedaySeat,
      paid: j.paid, termLimitYears: j.termLimitYears, titleOnTop: row.titleOnTop, reportsToSeatId: j.reportsToJobId,
      holderPersonId: j.holderPersonId, holderSince: j.holderSince, vacantSince: j.vacantSince, namedDeputyPersonId: j.namedDeputyPersonId, holding: j.holding,
    };
  });
  const level = levelOfTeam(world, teamId) as positions.Staff['level'];
  const defaults = positions.defaultCallers(seats);
  const callerOf = (side: positions.Side): number => rows.find((j) => j.callsPlays && (j.side === side || (j.positionId === HEAD && defaults[side] === j.id)))?.id ?? defaults[side];
  return { teamId, level, seats, callers: { offense: callerOf('offense'), defense: callerOf('defense'), special_teams: callerOf('special_teams') } };
}

function writeStaff(c: Cycle, s: positions.Staff): void {
  for (const seat of s.seats) {
    const old = c.world.jobs.get(seat.seatId);
    if (old && old.holderPersonId === seat.holderPersonId && old.holding === seat.holding && old.vacantSince === seat.vacantSince) continue;
    c.ix.set(positions.toJobRecord(s, seat));
  }
}

function holderSeats(c: Cycle): Map<number, JobRecord[]> {
  const out = new Map<number, JobRecord[]>();
  for (const [p, ids] of [...c.ix.held].sort((a, b) => a[0] - b[0])) if (ids.size > 0) out.set(p, c.ix.heldBy(p));
  return out;
}

function sideOf(j: JobRecord): Side {
  if (j.positionId === HEAD || j.side === 'whole_team') return 'head_coach';
  if (j.side === 'offense' || j.side === 'defense' || j.side === 'special_teams') return j.side;
  return 'offense';
}

/** Vacate every chair a person holds and note his last rung, for the pool. */
function vacatePerson(c: Cycle, personId: number): JobRecord[] {
  const held = c.ix.heldBy(personId).sort((a, b) => b.rung - a.rung || a.id - b.id);
  for (const j of held) c.ix.set({ ...j, holderPersonId: null, holderSince: null, vacantSince: c.world.date, holding: 'permanent', callsPlays: j.callsPlays });
  if (held.length > 0) c.st.careers.set(personId, { lastRung: held[0]!.rung, side: sideOf(held[0]!), outSince: null });
  return held;
}

function toPool(c: Cycle, personId: number): void {
  const pool = c.world.pools.get(COACH_POOL) ?? [];
  if (!pool.includes(personId)) pool.push(personId);
  c.world.pools.set(COACH_POOL, pool);
  const note = c.st.careers.get(personId) ?? { lastRung: 0, side: 'offense' as Side, outSince: null };
  c.st.careers.set(personId, { ...note, outSince: c.season });
}

function fromPools(c: Cycle, personId: number): void {
  for (const name of [COACH_POOL, ENTRY_POOL]) {
    const ids = c.world.pools.get(name);
    if (ids) c.world.pools.set(name, ids.filter((x) => x !== personId));
  }
  const note = c.st.careers.get(personId);
  if (note) c.st.careers.set(personId, { ...note, outSince: null });
}

function poolIds(c: Cycle): number[] {
  const out = new Set<number>();
  for (const name of [COACH_POOL, ENTRY_POOL]) for (const id of c.world.pools.get(name) ?? []) if (c.world.status.get(id) === 'active' && id !== c.world.userPersonId) out.add(id);
  return [...out].sort((a, b) => a - b);
}

// ---------- the public record and shared seasons (X2.3.1 views, never hidden values) ----------

interface Views {
  /** Mean win share of the teams a person served over the record seasons, or null with no record. */
  record(personId: number): number | null;
  /** Tie 0 to 100 from seasons on the same staff (stand-in for X7 edges). */
  tie(a: number, b: number): number;
  /** Former colleagues of a person, strongest tie first. */
  colleagues(personId: number): readonly number[];
  /** On last season's champion's staff (K8.4.2 rule 4). */
  fromTopStaff(personId: number): boolean;
}

function views(world: LiveWorld): Views {
  const last = world.seasons.length === 0 ? world.date.seasonYear - 1 : world.seasons[world.seasons.length - 1]!.seasonYear;
  const share = new Map<string, number>();
  for (const s of world.seasons.slice(-Math.max(param('coach.recordSeasons'), param('coach.tieSeasons')))) {
    for (const [team, r] of Object.entries(s.records)) {
      const g = r.wins + r.losses + r.ties;
      if (g > 0) share.set(`${s.seasonYear}:${team}`, (r.wins + 0.5 * r.ties) / g);
    }
  }
  const served = new Map<number, { season: number; team: number }[]>();
  const members = new Map<string, number[]>();
  for (const s of world.staffSeasons) {
    if (s.seasonYear <= last - param('coach.tieSeasons')) continue;
    const ids = [s.headCoachId, ...s.staffIds].filter((x): x is number => x !== null);
    members.set(`${s.seasonYear}:${s.teamId}`, ids);
    for (const id of ids) { const l = served.get(id); if (l) l.push({ season: s.seasonYear, team: s.teamId }); else served.set(id, [{ season: s.seasonYear, team: s.teamId }]); }
  }
  const champs = new Set<number>(world.seasons.length === 0 ? [] : Object.values(world.seasons[world.seasons.length - 1]!.champions));
  const tieCache = new Map<number, Map<number, number>>();
  const tiesOf = (a: number): Map<number, number> => {
    const hit = tieCache.get(a);
    if (hit) return hit;
    const m = new Map<number, number>();
    for (const s of served.get(a) ?? []) for (const o of members.get(`${s.season}:${s.team}`) ?? []) if (o !== a) m.set(o, Math.min(100, (m.get(o) ?? 0) + param('coach.tiePerSeason')));
    tieCache.set(a, m);
    return m;
  };
  return {
    record(id) {
      const xs = (served.get(id) ?? []).filter((s) => s.season > last - param('coach.recordSeasons')).map((s) => share.get(`${s.season}:${s.team}`)).filter((x): x is number => x !== undefined);
      return xs.length === 0 ? null : xs.reduce((a, x) => a + x, 0) / xs.length;
    },
    tie: (a, b) => tiesOf(a).get(b) ?? 0,
    colleagues: (a) => [...tiesOf(a)].sort((x, y) => y[1] - x[1] || x[0] - y[0]).map(([id]) => id),
    fromTopStaff: (id) => (served.get(id) ?? []).some((s) => s.season === last && champs.has(s.team)),
  };
}

// ---------- deciders (K8.1.1) ----------

function appointerOf(world: LiveWorld, teamId: number): number {
  const t = world.teams.find((x) => x.id === teamId)!;
  return t.ownerPersonId ?? t.athleticDirectorPersonId ?? t.presidentPersonId ?? -teamId;
}

function deciderOf(c: Cycle, teamId: number): stakeholders.DecisionMakerProfile {
  const who = appointerOf(c.world, teamId);
  const key = `${teamId}:${who}`;
  const hit = c.deciders.get(key);
  if (hit) return hit;
  const p = c.world.people.get(who);
  const f = (k: string): number => p?.traitBlock.facets[k] ?? 50;
  const dm = stakeholders.generateDecisionMaker(who, teamId, levelOfTeam(c.world, teamId), { patience: f('patience'), ego: f('ego'), candor: f('candor'), risk_tolerance: f('risk_tolerance') },
    stream(c.world.seed, `${STREAM_COACHES}.decider`, [teamId, who]));
  c.deciders.set(key, dm);
  return dm;
}

const modelOf = (c: Cycle, teamId: number): stakeholders.DeciderModel => stakeholders.deciderModel(levelOfTeam(c.world, teamId));

function quietWeek(weekId: string): stakeholders.ConfidenceWeek {
  return { weekId, games: [], quarterPoint: null, seasonEnd: null, goals: [], playerNoise: [], mediaTone: null, fanMood: null, conduct: [], violations: [], relationship: null, boosterMood: null, blameMultiplier: 1 };
}

function newHead(personId: number, kind: stakeholders.StartKind, situation: stakeholders.Situation, carry: HeadState | undefined): HeadState {
  return {
    personId, conf: stakeholders.startConfidence(personId, 'head_coach', kind), yearOnJob: 1, lowStreak: 0, situation,
    interim: kind === 'interim', keptThisSeason: false, recent: [], lastWinShare: carry?.lastWinShare ?? null,
    yearsSincePost: carry?.yearsSincePost ?? 0, lastExpectedWins: carry?.lastExpectedWins ?? null, games: 0, wins: 0, expected: 0,
  };
}

/** TO-12: no contracts or cap off-screen (TO-04), so firing costs nothing and the money brake is 1. */
function reviewInputs(h: HeadState, kind: stakeholders.ReviewKind, inSeason: stakeholders.InSeasonContext | null, expectationRising: boolean): stakeholders.ReviewInputs {
  return {
    kind, confidence: h.conf.value, yearOnJob: h.yearOnJob, lowStreak: h.lowStreak >= 2, gmHiredCoach: true,
    situation: { situation: h.situation, yearOnJob: h.yearOnJob, expectationRising, qbEstimateFalling: false },
    money: { remainingGuaranteeCents: 0, assistantsGuaranteeCents: 0, expectedToWorkAgain: true, deadMoneyOwedCents: 0, revenueShareCents: 1, boosterFundingCents: 0, forCause: false },
    announcedRetirement: false, underConductInvestigation: false, presidentForces: false, presidentVetoes: false, inSeason,
  };
}

// ---------- the public pregame chance (N2.6.1) ----------

function pPublic(c: Cycle, g: GameResult, teamId: number): number {
  const opp = g.homeTeamId === teamId ? g.awayTeamId : g.homeTeamId;
  const fit = c.st.fit.get(g.competitionId);
  if (!fit) return 0.5;
  const h = g.homeTeamId === teamId ? 1 : -1;
  const margin = (c.st.total.get(teamId) ?? 0) - (c.st.total.get(opp) ?? 0) + h * fit.home;
  return DMATH.logistic(PHI_LOGISTIC * margin / fit.sd);
}

/** Refit each competition's public strength on last season's games; next season's prior is the carried estimate. */
function refitStrength(c: Cycle, games: readonly GameResult[]): void {
  for (const comp of c.world.competitions) {
    const teamIds = comp.teamIds.filter((id) => isActive(c.world, id, c.season - 1));
    const rows = games.filter((g) => g.competitionId === comp.id);
    if (teamIds.length < 2 || rows.length === 0) continue;
    const level = comp.level as Level;
    const homePrior = c.b.rule(level, 'analytics.home_advantage_pts') ?? 0;
    try {
      const table = strength.fitStrength({
        games: rows.map((g) => ({ gameId: g.gameId, week: g.week, teamIds: [g.homeTeamId, g.awayTeamId] as const, neutralSite: false, points: [g.homePoints, g.awayPoints] as const })),
        priors: teamIds.map((id) => strength.preseasonPrior(id, c.st.terms.get(id) ?? null)), teamIds, homeAdvantagePrior: homePrior,
      }, DMATH);
      for (const t of table.teams) {
        const terms = { offense: t.offense, defense: t.defense, specialTeams: t.specialTeams };
        c.st.terms.set(t.teamId, terms);
        const prior = strength.preseasonPrior(t.teamId, terms);
        c.st.total.set(t.teamId, prior.offense + prior.defense + prior.specialTeams);
      }
      c.st.fit.set(comp.id, { home: table.homeAdvantage, sd: Math.max(1, DMATH.sqrt(2) * table.residualSd) });
    } catch (e) {
      if (!(e instanceof strength.StrengthError)) throw e;
      bump(c, 'strength_fit_failed');
    }
  }
}

// ---------- in season: weekly confidence and emergency reviews ----------

function inSeason(c: Cycle): void {
  const rows = c.world.results.slice(c.st.seen);
  c.st.seen = c.world.results.length;
  const byTeam = new Map<number, GameResult[]>();
  for (const g of rows) for (const t of [g.homeTeamId, g.awayTeamId]) { const l = byTeam.get(t); if (l) l.push(g); else byTeam.set(t, [g]); }
  const heads = [...c.st.heads.keys()].sort((a, b) => a - b);
  for (const teamId of heads) {
    const h = c.st.heads.get(teamId)!;
    if (!isActive(c.world, teamId) || h.personId === c.world.userPersonId) continue;
    const dm = deciderOf(c, teamId), model = modelOf(c, teamId);
    const spec = specOf(c.b, c.world, teamId);
    const games = byTeam.get(teamId) ?? [];
    const readings: { reading: stakeholders.GameReading; recent: readonly stakeholders.Result[] }[] = [];
    for (const g of games) {
      const mine = g.homeTeamId === teamId;
      const margin = mine ? g.homePoints - g.awayPoints : g.awayPoints - g.homePoints;
      const result: stakeholders.Result = margin > 0 ? 'W' : margin < 0 ? 'L' : 'T';
      const p = pPublic(c, g, teamId);
      readings.push({ reading: { gameId: g.gameId, result, pPublic: p, margin, stage: g.kind === 'postseason' ? 'postseason' : 'regular', rivalry: false, starterQbOutPublicEarly: false, injuryAllowance: false, decisions: [] }, recent: [...h.recent] });
      h.recent.push(result);
      if (g.kind === 'regular') { h.games++; h.wins += result === 'W' ? 1 : result === 'T' ? 0.5 : 0; h.expected += p; }
    }
    const quarter = Math.max(1, Math.round(spec.seasonGames / 4));
    const qp = games.some((g) => g.kind === 'regular') && h.games % quarter === 0 ? { winShareSoFar: h.wins / h.games, expectedWinShare: h.expected / h.games } : null;
    const week = { ...quietWeek(`${c.season}:${c.world.week}`), games: readings, quarterPoint: qp };
    h.conf = stakeholders.updateConfidence(h.conf, dm, model, week).state;
    if (games.length === 0 || h.games >= spec.seasonGames || games.every((g) => g.kind !== 'regular')) continue;
    if (!stakeholders.needsEmergencyReview(h.conf.value)) continue;
    const left = spec.seasonGames - h.games;
    const alive = (h.wins + left) / spec.seasonGames >= param('coach.aliveWinShare');
    const out = stakeholders.review(dm, model, reviewInputs(h, 'emergency', {
      gamesPlayed: h.games, gamesInSeason: spec.seasonGames, gamesOnJob: h.conf.gamesOnJob, interimWithHeadCoachExperience: false,
      aliveForPostseason: alive, keptAtEmergencyThisSeason: h.keptThisSeason,
    }, true), stream(c.world.seed, STREAM_COACHES, ['emergency', teamId, c.season, c.world.week]));
    if (out.outcome !== 'fire') { h.keptThisSeason = true; continue; }
    fireHead(c, teamId, true);
    nameInterim(c, teamId, h);
  }
}

function fireHead(c: Cycle, teamId: number, midSeason: boolean): void {
  const job = headJob(c, teamId);
  if (!job || job.holderPersonId === null) return;
  const id = job.holderPersonId;
  vacatePerson(c, id);
  toPool(c, id);
  open(c, teamId, job.rung, 'fired');
  record(c, market.EVENT.fired, teamId, id, { seatId: job.id, forCause: false, midSeason }, { kind: 'person', id });
  bump(c, midSeason ? 'fired_in_season' : 'fired');
}

/** E4.3.3: an in-season firing names an interim, the senior assistant (highest rung, then first seat); his chairs wait for the offseason. */
function nameInterim(c: Cycle, teamId: number, prev: HeadState): void {
  const job = headJob(c, teamId)!;
  const cand = jobsOf(c, teamId).filter((j) => j.positionId !== HEAD && j.holderPersonId !== null && j.holderPersonId !== c.world.userPersonId).sort((a, b) => b.rung - a.rung || a.id - b.id)[0];
  if (!cand) { c.st.heads.delete(teamId); return; }
  const id = cand.holderPersonId!;
  for (const j of vacatePerson(c, id)) open(c, teamId, j.rung, 'promoted');
  c.ix.set({ ...c.world.jobs.get(job.id)!, holderPersonId: id, holderSince: c.world.date, vacantSince: null, holding: 'interim' });
  record(c, positions.EVENT.interim, teamId, id, { seatId: job.id, holding: 'interim', step: 0 }, { kind: 'job', id: job.id });
  const h = newHead(id, 'interim', prev.situation, prev);
  h.games = prev.games; h.wins = prev.wins; h.expected = prev.expected; h.recent = [...prev.recent];
  c.st.heads.set(teamId, h);
}

// ---------- the offseason ----------

interface SeasonLine { games: number; wins: number; post: number; postWins: number; title: boolean; pf: number; pa: number }

function seasonLines(games: readonly GameResult[]): Map<number, SeasonLine> {
  const out = new Map<number, SeasonLine>();
  const line = (id: number): SeasonLine => { let l = out.get(id); if (!l) { l = { games: 0, wins: 0, post: 0, postWins: 0, title: false, pf: 0, pa: 0 }; out.set(id, l); } return l; };
  for (const g of games) {
    for (const [id, pf, pa] of [[g.homeTeamId, g.homePoints, g.awayPoints], [g.awayTeamId, g.awayPoints, g.homePoints]] as const) {
      const l = line(id);
      const w = pf > pa ? 1 : pf === pa ? 0.5 : 0;
      if (g.kind === 'regular') { l.games++; l.wins += w; l.pf += pf; l.pa += pa; } else { l.post++; l.postWins += pf > pa ? 1 : 0; if (g.title && pf > pa) l.title = true; }
    }
  }
  return out;
}

/** E4.3.1 main review after the season, with the K8.3.1 season-end reading. Returns teams whose head chair is now open. */
function mainReviews(c: Cycle, lines: Map<number, SeasonLine>): void {
  for (const teamId of [...c.st.heads.keys()].sort((a, b) => a - b)) {
    const h = c.st.heads.get(teamId)!;
    const job = headJob(c, teamId);
    if (!isActive(c.world, teamId) || !job || job.holderPersonId !== h.personId) { c.st.heads.delete(teamId); continue; }
    if (h.personId === c.world.userPersonId) continue;
    const l = lines.get(teamId);
    const ws = l && l.games > 0 ? l.wins / l.games : 0.5;
    const qualified = (l?.post ?? 0) > 0;
    h.yearsSincePost = qualified ? 0 : h.yearsSincePost + 1;
    const dm = deciderOf(c, teamId), model = modelOf(c, teamId);
    h.conf = stakeholders.updateConfidence(h.conf, dm, model, {
      ...quietWeek(`${c.season - 1}:end`),
      seasonEnd: { winShare: ws, lastWinShare: h.lastWinShare, qualified, postseasonWins: l?.postWins ?? 0, title: l?.title ?? false, firstGameLossAsHigherSeed: false, yearsSincePostseason: h.yearsSincePost, legacy: false, decisionRatingVsLeague: 0 },
    }).state;
    h.lowStreak = h.conf.value < 50 ? h.lowStreak + 1 : 0;
    const rising = h.lastExpectedWins === null || h.expected >= h.lastExpectedWins;
    h.lastWinShare = ws;
    h.lastExpectedWins = h.expected;
    h.games = 0; h.wins = 0; h.expected = 0; h.recent = []; h.keptThisSeason = false;
    if (h.interim) continue; // the interim's chair is searched below (K8.4.2), with him on the list
    const out = stakeholders.review(dm, model, reviewInputs(h, 'main', null, rising), stream(c.world.seed, STREAM_COACHES, ['main', teamId, c.season]));
    if (out.outcome === 'fire') { fireHead(c, teamId, false); c.st.heads.delete(teamId); continue; }
    h.yearOnJob++;
  }
}

/** K7.6.1 rule 5: a coordinator whose unit was below the head coach's standard for the starting seasons is let go. */
function unitReviews(c: Cycle, lines: Map<number, SeasonLine>): void {
  const compMean = new Map<number, { pf: number; pa: number }>();
  for (const comp of c.world.competitions) {
    let pf = 0, pa = 0, g = 0;
    for (const id of comp.teamIds) { const l = lines.get(id); if (l) { pf += l.pf; pa += l.pa; g += l.games; } }
    if (g > 0) compMean.set(comp.id, { pf: pf / g, pa: pa / g });
  }
  for (const t of [...c.world.teams].sort((a, b) => a.id - b.id)) {
    const l = lines.get(t.id), m = compMean.get(t.competitionId);
    const head = headJob(c, t.id);
    if (!l || !m || l.games === 0 || !head || head.holderPersonId === null || head.holderPersonId === c.world.userPersonId) continue;
    const u = c.st.units.get(t.id) ?? { offense: 0, defense: 0 };
    u.offense = l.pf / l.games < m.pf - param('coach.unitBelowPoints') ? u.offense + 1 : 0;
    u.defense = l.pa / l.games > m.pa + param('coach.unitBelowPoints') ? u.defense + 1 : 0;
    c.st.units.set(t.id, u);
    for (const side of ['offense', 'defense'] as const) {
      if (!staffSearch.aiFiresAssistant(u[side], false)) continue;
      const coord = jobsOf(c, t.id).find((j) => j.positionId === (side === 'offense' ? 'pos:offensive_coordinator' : 'pos:defensive_coordinator'));
      if (!coord || coord.holderPersonId === null || coord.holderPersonId === c.world.userPersonId || coord.holderPersonId === head.holderPersonId) continue;
      const id = coord.holderPersonId;
      for (const j of vacatePerson(c, id)) open(c, t.id, j.rung, 'released');
      toPool(c, id);
      record(c, staffSearch.EVENT.fired, t.id, id, { seatId: coord.id, midSeason: false, ownerDemanded: false }, { kind: 'person', id });
      u[side] = 0;
      bump(c, 'coordinator_fired');
    }
  }
}

/** E2.3.4 rule 4: retirement by age and years without a job (TO-13: no health or wealth state off-screen yet). */
function retirements(c: Cycle): void {
  const held = holderSeats(c);
  let exits = 0, inJob = 0;
  for (const [id, seats] of held) {
    const p = c.world.people.get(id);
    if (!p || id === c.world.userPersonId || seats[0]!.positionId === 'pos:general_manager') continue;
    if (!coachRole(p)) continue;
    const h = possible(market.retireHazard({ age: ageIn(p, c.season), yearsWithoutJob: 0, healthBurden: 0, wealthIndependence: 0, importedReal: p.origin === 'imported' }));
    if (!stream(c.world.seed, STREAM_COACHES, ['retire', id, c.season]).chance(h)) continue;
    const teamId = seats[0]!.teamId;
    for (const j of vacatePerson(c, id)) open(c, j.teamId, j.rung, 'retired');
    if (c.st.heads.get(teamId)?.personId === id) c.st.heads.delete(teamId);
    record(c, market.EVENT.retired, teamId, id, { age: ageIn(p, c.season) }, { kind: 'person', id });
    c.ctx.markOutOfFootball(id);
    exits++; inJob++;
  }
  const cycles = loopParam('career.jobCyclesBeforeLeaving');
  for (const id of poolIds(c)) {
    const p = c.world.people.get(id)!;
    const note = c.st.careers.get(id);
    const out = note?.outSince ?? c.season;
    const years = c.season - out;
    const h = possible(market.retireHazard({ age: ageIn(p, c.season), yearsWithoutJob: years, healthBurden: 0, wealthIndependence: 0, importedReal: p.origin === 'imported' }));
    const retire = stream(c.world.seed, STREAM_COACHES, ['retire', id, c.season]).chance(h);
    if (!retire && years < cycles) continue;
    fromPools(c, id);
    c.ctx.markOutOfFootball(id);
    if (!retire) c.ctx.emit({ type: LEFT_UNSIGNED, date: c.world.date, subjects: [{ kind: 'person', id }], payload: { cycles: years }, witnesses: { kind: 'none' }, tier: 3 });
    bump(c, retire ? 'pool_retired' : 'pool_left');
    exits++;
  }
  bump(c, 'retired_in_job', inJob);
  c.st.exits = exits;
}

const coachRole = (p: PersonRecord): boolean => p.roles.includes('coach') || p.roles.includes('staff');

/** Renew deals that ran out for people still in a chair (TO-12: lengths only, no pay). */
function renewals(c: Cycle): void {
  for (const id of [...holderSeats(c).keys()]) {
    const end = c.world.staffContractEndYear.get(id);
    if (end === undefined || end >= c.season) continue;
    c.world.staffContractEndYear.set(id, c.season - 1 + stream(c.world.seed, STREAM_COACHES, ['renew', id, c.season]).int(1, genParam('contract.staffMaxYears')));
  }
}

// ---------- searches ----------

function offerTo(c: Cycle, job: JobRecord, personId: number, prospects: number): { offer: staffSearch.Offer; view: staffSearch.CandidateView } {
  const mid = param('coach.needsMiddle');
  const needs = Object.fromEntries(staffSearch.STAFF_NEEDS.map((n) => [n, mid])) as staffSearch.NeedWeights;
  const current = currentRung(c, personId);
  return {
    offer: { seatId: job.id, rung: job.rung, titleKey: job.positionId, years: stream(c.world.seed, STREAM_COACHES, ['years', job.id, personId, c.season]).int(1, genParam('contract.staffMaxYears')), salaryCents: 0, callsPlays: job.callsPlays, promises: [] },
    view: { currentRung: current, askCents: 0, needs, trustInHeadCoach: 50, prospects },
  };
}

function currentRung(c: Cycle, personId: number): number {
  let best = -1;
  for (const j of c.ix.heldBy(personId)) if (j.rung > best) best = j.rung;
  return best >= 0 ? best : c.st.careers.get(personId)?.lastRung ?? 0;
}

function prospectsOf(c: Cycle, teamId: number): number {
  const ws = c.st.heads.get(teamId)?.lastWinShare ?? lastShare(c, teamId);
  return Math.max(-1, Math.min(1, 2 * (ws - 0.5)));
}

function lastShare(c: Cycle, teamId: number): number {
  const s = c.world.seasons[c.world.seasons.length - 1];
  const r = s?.records[teamId];
  const g = r ? r.wins + r.losses + r.ties : 0;
  return r && g > 0 ? (r.wins + 0.5 * r.ties) / g : 0.5;
}

/**
 * TO-15: players who left football in the last two seasons and are young enough start at rungs 0 to 2
 * (catalogue `job:outside.former_player`), beside the cohort entrants, so the bottom rungs never run dry.
 */
const FORMER = new WeakMap<Cycle, number[]>();
function formerPlayers(c: Cycle): number[] {
  const hit = FORMER.get(c);
  if (hit) return hit.filter((id) => c.world.outOfFootballSince.has(id));
  const out: number[] = [];
  for (const [id, since] of c.world.outOfFootballSince) {
    const p = c.world.people.get(id);
    if (!p || since < c.season - 2 || c.world.status.get(id) !== 'active' || !p.roles.includes('player') || id === c.world.userPersonId) continue;
    if (ageIn(p, c.season) > param('coach.formerPlayerMaxAge')) continue;
    out.push(id);
  }
  out.sort((a, b) => a - b);
  FORMER.set(c, out);
  return out;
}

function hire(c: Cycle, teamId: number, job: JobRecord, personId: number, years: number): void {
  const p = c.world.people.get(personId);
  if (p && !coachRole(p)) {
    c.world.people.set(personId, { ...p, roles: [...p.roles, 'coach'] });
    c.world.outOfFootballSince.delete(personId);
    bump(c, 'former_player_hired');
  }
  const fromSeats = c.ix.heldBy(personId).filter((j) => j.id !== job.id);
  for (const j of fromSeats) {
    c.ix.set({ ...j, holderPersonId: null, holderSince: null, vacantSince: c.world.date, holding: 'permanent' });
    open(c, j.teamId, j.rung, j.teamId === teamId ? 'promoted' : j.positionId === HEAD ? 'left' : 'promoted');
  }
  fromPools(c, personId);
  c.ix.set({ ...c.world.jobs.get(job.id)!, holderPersonId: personId, holderSince: c.world.date, vacantSince: null, holding: 'permanent' });
  c.world.staffContractEndYear.set(personId, c.season - 1 + years);
  c.st.careers.set(personId, { lastRung: job.rung, side: sideOf(job), outSince: null });
  record(c, staffSearch.EVENT.hired, teamId, personId, { seatId: job.id, years }, { kind: 'job', id: job.id });
}

/** K8.4.2: the owner (or athletic director) fills an open or interim head chair. Teams whose chairs a hire empties are returned. */
function headSearch(c: Cycle, teamId: number, v: Views): number[] {
  const job = headJob(c, teamId)!;
  const interim = job.holding === 'interim' ? job.holderPersonId : null;
  const held = holderSeats(c);
  const pool = new Set<number>(poolIds(c));
  for (const [id, seats] of held) {
    if (id === c.world.userPersonId) continue;
    const top = seats.reduce((a, s) => (s.rung > a.rung ? s : a));
    if (top.rung >= param('coach.headMinRung') && top.rung < job.rung) pool.add(id);
    if (top.teamId === teamId && top.positionId !== HEAD) pool.add(id);
  }
  if (interim !== null) pool.add(interim);
  const prefs: stakeholders.SearchPreferences = {
    labelWeights: {}, minRung: param('coach.headMinRung'), sides: ['head_coach', 'offense', 'defense', 'special_teams'], minPublicRecord: -1, firedCoachFaults: [], opposites: {},
  };
  const cands: stakeholders.CandidateView[] = [...pool].sort((a, b) => a - b).map((id) => {
    const seats = held.get(id) ?? [];
    const top = seats.length > 0 ? seats.reduce((a, s) => (s.rung > a.rung ? s : a)) : null;
    const rung = id === interim ? (c.st.careers.get(id)?.lastRung ?? job.rung) : top?.rung ?? c.st.careers.get(id)?.lastRung ?? 0;
    const r = v.record(id);
    return {
      personId: id, rung, side: top ? sideOf(top) : c.st.careers.get(id)?.side ?? 'offense', labels: [],
      publicRecord: r === null ? 0 : 2 * (r - 0.5), firstHand: top?.teamId === teamId ? 0 : null, references: [], interview: null,
      fromTopStaff: v.fromTopStaff(id), underContractElsewhere: false,
    };
  });
  const prospects = prospectsOf(c, teamId);
  const s = stream(c.world.seed, STREAM_COACHES, ['head_search', teamId, c.season]);
  let years = 1;
  const out = stakeholders.runSearch(prefs, cands, (id) => {
    if (id === interim) { years = s.int(1, genParam('contract.staffMaxYears')); return true; }
    const o = offerTo(c, job, id, prospects);
    years = o.offer.years;
    return staffSearch.decideOffer(o.offer, o.view, s);
  });
  let chosen = out.hired;
  if (chosen === null) {
    // Nobody took it: keep the interim, else the senior assistant, else whoever ranks first (K7.6.1 edge case).
    chosen = interim ?? jobsOf(c, teamId).filter((j) => j.positionId !== HEAD && j.holderPersonId !== null && j.holderPersonId !== c.world.userPersonId).sort((a, b) => b.rung - a.rung || a.id - b.id)[0]?.holderPersonId
      ?? stakeholders.rankCandidates(prefs, cands)[0]?.personId ?? poolIds(c)[0] ?? null;
    if (chosen === null) { bump(c, 'head_unfilled'); return []; }
    years = s.int(1, genParam('contract.staffMaxYears'));
  }
  const emptied = c.ix.heldBy(chosen).filter((j) => j.id !== job.id && j.teamId !== teamId && j.positionId === HEAD).map((j) => j.teamId);
  const prior = c.st.heads.get(teamId);
  if (interim !== null && chosen !== interim) {
    c.ix.set({ ...c.world.jobs.get(job.id)!, holderPersonId: null, holderSince: null, vacantSince: c.world.date, holding: 'permanent' });
    toPool(c, interim);
  }
  hire(c, teamId, job, chosen, years);
  for (const t of emptied) c.st.heads.delete(t);
  const expShare = c.st.total.has(teamId) ? DMATH.logistic(PHI_LOGISTIC * (c.st.total.get(teamId) ?? 0) / Math.max(1, c.st.fit.get(c.world.teams.find((x) => x.id === teamId)!.competitionId)?.sd ?? 10)) : 0.5;
  c.st.heads.set(teamId, newHead(chosen, chosen === interim ? 'interim_promoted' : 'hired', stakeholders.situationAtHiring(expShare, false, false, false), prior));
  bump(c, chosen === interim ? 'interim_kept' : 'head_hired');
  newStaff(c, teamId, chosen, v);
  return emptied;
}

/** E2.3.4 rule 2 and X8.4.1: the new head coach offers chairs to former colleagues, then reviews the staff he inherits. */
function newStaff(c: Cycle, teamId: number, headId: number, v: Views): void {
  const s0 = staffOf(c, teamId);
  const used = new Set<number>([headId]);
  const bring: { seatId: number; personId: number; accepted: boolean }[] = [];
  const colleagues = v.colleagues(headId).filter((id) => c.world.status.get(id) === 'active' && id !== c.world.userPersonId && c.world.people.get(id) && coachRole(c.world.people.get(id)!));
  const chairs = s0.seats.filter((x) => x.rung !== null && x.rung >= param('coach.followMinRung') && x.positionId !== HEAD && !x.titleOnTop).sort((a, b) => (b.rung ?? 0) - (a.rung ?? 0) || a.seatId - b.seatId);
  const followers = new Map<number, number>();
  for (const chair of chairs) {
    const who = colleagues.find((id) => !used.has(id) && currentRung(c, id) >= (chair.rung ?? 0) - param('coach.stepsBelow') && !isHeadAnywhere(c, id) && !onStaff(s0, id));
    if (who === undefined) continue;
    used.add(who);
    const accepted = positions.decideFollow(who, currentRung(c, who), chair.rung, stream(c.world.seed, STREAM_COACHES, ['follow', teamId, chair.seatId, who, c.season]));
    bring.push({ seatId: chair.seatId, personId: who, accepted });
    if (accepted) followers.set(who, chair.seatId);
  }
  // Followers leave their old chairs (and pools) before the review fills the new ones.
  for (const [who] of followers) {
    for (const j of c.ix.heldBy(who)) {
      c.ix.set({ ...j, holderPersonId: null, holderSince: null, vacantSince: c.world.date, holding: 'permanent' });
      open(c, j.teamId, j.rung, 'followed_boss');
    }
    fromPools(c, who);
  }
  const s1 = staffOf(c, teamId);
  const res = positions.firingCascade({
    staff: s1, newHeadCoachId: headId, reviewStart: c.world.date, bring,
    view: () => ({ strongPositiveEdge: false, negativeEdge: false, unitTopQuarter: false, sameSchemeFamily: false, requiredByAppointer: false }),
    stream: (scope) => stream(c.world.seed, `${STREAM_COACHES}.cascade`, [...scope, c.season]),
    addDays: (d, days) => ({ seasonYear: d.seasonYear, dayIndex: d.dayIndex + days }),
    meta: { date: c.world.date, competitionId: null, tier: c.ctx.tierOfTeam(teamId), source: c.ctx.source },
  });
  writeStaff(c, res.staff);
  for (const d of res.decisions) {
    if (d.outcome === 'released' && d.incumbentId !== null && !onStaff(res.staff, d.incumbentId)) {
      c.st.careers.set(d.incumbentId, { lastRung: s1.seats.find((x) => x.seatId === d.seatId)?.rung ?? 0, side: 'offense', outSince: null });
      toPool(c, d.incumbentId);
      open(c, teamId, s1.seats.find((x) => x.seatId === d.seatId)?.rung ?? 0, 'released');
      record(c, positions.EVENT.released, teamId, d.incumbentId, { seatId: d.seatId }, { kind: 'job', id: d.seatId });
      bump(c, 'staff_released');
    }
    if (d.outcome === 'brought' && d.holderId !== null) {
      const job = c.world.jobs.get(d.seatId)!;
      c.world.staffContractEndYear.set(d.holderId, c.season - 1 + stream(c.world.seed, STREAM_COACHES, ['years', d.seatId, d.holderId, c.season]).int(1, genParam('contract.staffMaxYears')));
      c.st.careers.set(d.holderId, { lastRung: job.rung, side: sideOf(job), outSince: null });
      record(c, positions.EVENT.followed, teamId, d.holderId, { fromTeamId: teamId, rung: job.rung }, { kind: 'person', id: d.holderId });
      bump(c, 'followed');
    }
  }
}

const onStaff = (s: positions.Staff, id: number): boolean => s.seats.some((x) => x.holderPersonId === id);
const isHeadAnywhere = (c: Cycle, id: number): boolean => c.ix.heldBy(id).some((j) => j.positionId === HEAD);

/** X8.4.2 and K7.6.1: fill each open chair, inside first or from the pool, by the head coach's own ranking. */
function fillStaff(c: Cycle, teamId: number, v: Views): void {
  const head = headJob(c, teamId);
  const headId = head?.holderPersonId ?? null;
  if (headId === null || headId === c.world.userPersonId) return;
  const prospects = prospectsOf(c, teamId);
  let staff = staffOf(c, teamId);
  const openSeats = staff.seats.filter((x) => x.holderPersonId === null && x.positionId !== HEAD).sort((a, b) => (b.rung ?? 0) - (a.rung ?? 0) || a.seatId - b.seatId);
  const taken = new Set<number>();
  for (const seat0 of openSeats) {
    const external = new Map<number, number>();
    const decide = (s: positions.Staff, seatId: number): positions.VacancyDecision => {
      const seat = positions.seat(s, seatId);
      const rung = seat.rung ?? 0;
      const job = c.world.jobs.get(seatId)!;
      const inside = s.seats.filter((x) => x.holderPersonId !== null && x.holderPersonId !== headId && x.holderPersonId !== c.world.userPersonId && x.seatId !== seatId && (x.rung ?? 0) < rung && (x.rung ?? 0) >= rung - param('coach.stepsBelow')).map((x) => x.holderPersonId!);
      const outside = [...poolIds(c), ...(rung <= 2 ? formerPlayers(c) : [])].filter((id) => !taken.has(id) && (rung <= 2 || (c.st.careers.get(id)?.lastRung ?? 0) >= rung - param('coach.stepsBelow')));
      const ids = [...new Set([...inside, ...outside])].sort((a, b) => a - b);
      if (ids.length === 0) return { kind: 'post' };
      const ranked = staffSearch.rankCandidates(ids.map((id) => {
        const r = v.record(id);
        return { personId: id, input: { sameFamily: false, termOverlap: 0, viewOfQuality: r === null ? 0.5 : r, tie: Math.max(v.tie(headId, id), inside.includes(id) ? param('coach.tiePerSeason') : 0), askCents: 0, budgetLeftCents: 1 } };
      }));
      const sr = stream(c.world.seed, STREAM_COACHES, ['staff_search', seatId, c.season]);
      const res = staffSearch.runSearch(ranked, (id) => offerTo(c, job, id, prospects), sr);
      const who = res.hiredPersonId ?? ranked[0] ?? null;
      if (who === null) return { kind: 'post' };
      if (res.hiredPersonId === null) bump(c, 'filled_from_who_is_left');
      if (inside.includes(who)) return { kind: 'promote', personId: who };
      external.set(seatId, who);
      taken.add(who);
      return { kind: 'post' };
    };
    if (positions.seat(staff, seat0.seatId).holderPersonId !== null) continue;
    const r = positions.fillVacancy(staff, seat0.seatId, c.world.date, decide, { date: c.world.date, competitionId: null, tier: c.ctx.tierOfTeam(teamId), source: c.ctx.source });
    staff = r.staff;
    for (const e of r.events) if (e.type === positions.EVENT.promoted) { bump(c, 'promoted_within'); const a = e.actors[0]; if (a) record(c, positions.EVENT.promoted, teamId, a.personId, e.payload as Record<string, number | null>, e.subjects[0] ? { kind: 'job', id: e.subjects[0].id } : null); }
    writeStaff(c, staff);
    for (const seatId of r.posted) {
      const who = external.get(seatId);
      const job = c.world.jobs.get(seatId)!;
      if (job.rung <= 2) c.st.bottomDemand++;
      if (who === undefined) { bump(c, 'staff_unfilled'); continue; }
      hire(c, teamId, job, who, offerTo(c, job, who, prospects).offer.years);
      bump(c, 'staff_hired');
    }
    staff = staffOf(c, teamId);
  }
  for (const s of staff.seats) if (s.holderPersonId !== null && !c.world.staffContractEndYear.has(s.holderPersonId)) {
    c.world.staffContractEndYear.set(s.holderPersonId, c.season - 1 + stream(c.world.seed, STREAM_COACHES, ['years', s.seatId, s.holderPersonId, c.season]).int(1, genParam('contract.staffMaxYears')));
  }
}

function offseason(c: Cycle, last: readonly GameResult[]): void {
  const lines = seasonLines(last);
  mainReviews(c, lines);
  unitReviews(c, lines);
  refitStrength(c, last);
  c.st.bottomDemand = 0;
  retirements(c);
  renewals(c);
  const v = views(c.world);
  // Worst record first, as every other offseason choice (C7.2.1), ties by id.
  const order = c.world.teams.filter((t) => isActive(c.world, t.id)).map((t) => t.id)
    .sort((a, b) => lastShare(c, a) - lastShare(c, b) || a - b);
  const queue = order.filter((id) => needsHead(c, id));
  const searched = new Map<number, number>();
  while (queue.length > 0) {
    const teamId = queue.shift()!;
    if (!needsHead(c, teamId)) continue;
    const n = (searched.get(teamId) ?? 0) + 1;
    searched.set(teamId, n);
    if (n > 3) { bump(c, 'head_search_capped'); continue; }
    for (const t of headSearch(c, teamId, v)) queue.push(t);
  }
  for (const teamId of order) if (!c.st.heads.has(teamId)) {
    const job = headJob(c, teamId);
    if (job?.holderPersonId != null) c.st.heads.set(teamId, newHead(job.holderPersonId, 'hired', 'steady', undefined));
  }
  for (const teamId of order) fillStaff(c, teamId, v);
  // A second pass catches chairs a later team's hire emptied.
  for (const teamId of order) fillStaff(c, teamId, v);
}

function needsHead(c: Cycle, teamId: number): boolean {
  const job = headJob(c, teamId);
  if (!job || !isActive(c.world, teamId)) return false;
  if (job.holderPersonId === c.world.userPersonId && job.holderPersonId !== null) return false;
  return job.holderPersonId === null || job.holding === 'interim';
}

/** The first time the step runs: every sitting head coach starts as hired (E4.2.1 rule 1). */
function seed(c: Cycle): void {
  for (const t of [...c.world.teams].sort((a, b) => a.id - b.id)) {
    const job = headJob(c, t.id);
    if (job?.holderPersonId != null && !c.st.heads.has(t.id)) c.st.heads.set(t.id, newHead(job.holderPersonId, 'hired', 'steady', undefined));
  }
}

/**
 * The coach half of the K7 `moves` step. Bind it before `rosterMovesStep` (see `movesStep`): the offseason
 * part runs on the first pass of a season, the confidence part on every pass.
 */
export function coachMovesStep(b: TurnoverBinding): StepHandler {
  const deciders = new Map<string, stakeholders.DecisionMakerProfile>();
  return (ctx) => {
    const { world } = ctx;
    const st = coachState(world);
    const c: Cycle = { ix: new JobIndex(world), ctx, world, b, st, season: world.date.seasonYear, counts: {}, deciders };
    if (st.heads.size === 0) seed(c);
    let offseasonRan = false;
    if (st.results !== null && st.results !== world.results) {
      offseason(c, st.results);
      st.results = null;
      offseasonRan = true;
    }
    if (st.results === null) { st.results = world.results; st.seen = 0; }
    inSeason(c);
    let conf = 0;
    for (const h of st.heads.values()) conf += h.conf.value;
    return { coachOffseason: offseasonRan, heads: st.heads.size, confidenceSum: Math.round(conf * 1000) / 1000, ...c.counts };
  };
}

/** The whole K7 `moves` step: coaching changes first, then the roster cycle (C4 order). */
export function movesStep(b: TurnoverBinding, roster: StepHandler): StepHandler {
  const coaches = coachMovesStep(b);
  return (ctx) => {
    const a = coaches(ctx) ?? {};
    const r = roster(ctx) ?? {};
    return { ...a, ...r };
  };
}

