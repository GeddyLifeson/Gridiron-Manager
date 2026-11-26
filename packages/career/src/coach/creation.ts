// Coach creation (G-29; bible E1.1 to E1.7, S2). Creation is background choices only: past facts,
// people known, a side of the ball, a household and a starting point. There is no budget, no cost
// table and no value on any scale (E1.4.1, Marlon's ruling of 2026-11-25 22:02 UTC). Nothing produced
// here describes ability: the output holds ids, dates, counts, history rows and relationship edges.
//
// Flow (E1.7.1): `validateCreation` runs the eight named checks in order and normalises what the leaf
// says to normalise (age moves up, never silently down; a mentor who fails is removed with a note).
// `createCoach` refuses while any check fails, then writes the generated past from the creation seed,
// so the same choices and seed give the same record (J13).
import { param, type CoachRules } from './params.ts';
import { shareMap, FACT_COLLEGE_LAST_SEAT, FACT_PRO_LAST_SEAT } from './facts.ts';

// ---------------------------------------------------------------------------------------------------
// Choices

export type Level = 'college' | 'pro';
export const LEVELS: readonly Level[] = ['college', 'pro'];

/** E1.6.1 start modes. `nobody` (rung 0) is the default; the rest are shortcuts. */
export type StartMode = 'nobody' | 'graduate_assistant' | 'quality_control' | 'position_coach' | 'coordinator' | 'head_coach';
export const START_MODES: readonly StartMode[] = ['nobody', 'graduate_assistant', 'quality_control', 'position_coach', 'coordinator', 'head_coach'];
/** Levels where each start's rung exists (E1.6.1: "at the college or professional level where that rung exists"). */
export const START_LEVELS: Readonly<Record<StartMode, readonly Level[]>> = {
  nobody: ['college', 'pro'],
  graduate_assistant: ['college'],
  quality_control: ['college', 'pro'],
  position_coach: ['college', 'pro'],
  coordinator: ['college', 'pro'],
  head_coach: ['college', 'pro'],
};
/** Shortcut starts that place the coach in a chosen job (E1.6.2). */
const STARTS_WITH_FIRST_TEAM: ReadonlySet<StartMode> = new Set(['coordinator', 'head_coach']);

/** E1.2.1 playing history: one of five. */
export type PlayingLevel = 'none' | 'small_college' | 'major_college' | 'pro_short' | 'pro_long';
export const PLAYING_LEVELS: readonly PlayingLevel[] = ['none', 'small_college', 'major_college', 'pro_short', 'pro_long'];
export type PositionGroup = 'QB' | 'RB' | 'WR' | 'TE' | 'OL' | 'DL' | 'LB' | 'DB' | 'specialists' | 'none';
export const POSITION_GROUPS: readonly PositionGroup[] = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'specialists', 'none'];
export type Side = 'offense' | 'defense' | 'special_teams';
export const SIDES: readonly Side[] = ['offense', 'defense', 'special_teams'];

export interface PlayingHistory {
  readonly level: PlayingLevel;
  readonly positionGroup: PositionGroup;
  /** Professional seasons; 0 for non-professional histories (E1.2.1). */
  readonly proSeasons: number;
}

/** E1.2.3 depth-pass picks. All history facts; no football system reads them. */
export type Degree = 'none' | 'bachelor' | 'master';
export type DegreeField = 'education' | 'business_finance' | 'math_engineering' | 'other';
export interface Education {
  readonly degree: Degree;
  readonly field: DegreeField | null;
  readonly military: boolean;
  /** Years of other full-time work before football, 0 to 20. */
  readonly otherWorkYears: number;
}

/** E1.3.1 and E1.3.2. Families are content refs (`pack:id`, F14). */
export interface FootballIdentity {
  readonly side: Side;
  readonly positionGroup: PositionGroup;
  /** Whether he intends to call plays on his side; sets the default delegation (I2.6.2, I3). */
  readonly intendsToCall: boolean;
  /** Families named "mine" (E1.3.2). Null keeps the family he worked in longest. */
  readonly offensiveFamily: string | null;
  readonly defensiveFamily: string | null;
}

/** E1.5.2 household. `none_stated` turns E8 family events off. */
export type HouseholdKind = 'none_stated' | 'single' | 'partner' | 'partner_children';
export interface HouseholdChoice {
  readonly kind: HouseholdKind;
  readonly childAges: readonly number[];
  readonly partnerHasCareer: boolean;
  readonly homeRegion: string | null;
}

export interface CreationChoices {
  readonly level: Level;
  readonly start: StartMode;
  /** Head coach start only: "experienced" writes a prior head job (E1.6.1). */
  readonly experienced: boolean;
  /** S2.1.1 origin card id, or null. Origins set defaults only (./origins.ts). */
  readonly origin: string | null;
  readonly playing: PlayingHistory;
  readonly education: Education;
  /** Chosen mentors: person ids of head coaches in the world (E1.2.2). */
  readonly mentors: readonly number[];
  /** Coaching seasons to write; null takes the middle of the allowed range (E1.2.2 "edit seasons within limits"). */
  readonly coachingSeasons: number | null;
  readonly identity: FootballIdentity;
  readonly name: { readonly first: string; readonly last: string };
  readonly age: number;
  /** Simple portrait from a small set (E1.5.1); a seed for the generated marker portrait. */
  readonly appearanceKey: number;
  readonly household: HouseholdChoice;
  /** Coordinator and head coach starts: the team (E1.6.2). Others: the home program or null. */
  readonly firstTeamId: number | null;
  readonly openJobsOnly: boolean;
  /** Creation seed, stored so the same choices reproduce the same history (E1.7.1). */
  readonly seed: number;
}

// ---------------------------------------------------------------------------------------------------
// The world creation reads

/** A head coach stint in the generated world. `lastSeason` null means he holds the job now. */
export interface HeadStint {
  readonly personId: number;
  readonly teamId: number;
  readonly firstSeason: number;
  readonly lastSeason: number | null;
  readonly offensiveFamily: string | null;
  readonly defensiveFamily: string | null;
}

/** One person on one staff in one season (assistants, for the overlap edges of E1.2.2 rule 2). */
export interface StaffSeason {
  readonly personId: number;
  readonly teamId: number;
  readonly seasonYear: number;
}

export interface CreationWorld {
  /** The season the career starts in. History is written in the seasons before it. */
  readonly year: number;
  readonly teams: readonly { readonly id: number; readonly level: Level }[];
  readonly headStints: readonly HeadStint[];
  readonly staffSeasons: readonly StaffSeason[];
  /** Teams left vacant by the generated prior season (E1.6.2 open-jobs mode). */
  readonly vacantTeamIds: readonly number[];
}

/** The random source the caller supplies (a J13 stream named for creation and seeded by `seed`). */
export interface CoachRandom {
  /** Uniform in [0, 1). */
  uniform(): number;
}

// ---------------------------------------------------------------------------------------------------
// Validation (E1.7.1 checks 1 to 8)

export type CheckNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** A failing check, named in words through a text key with plain parameters. */
export interface CreationProblem {
  readonly check: CheckNumber;
  readonly key: string;
  readonly params: Readonly<Record<string, string | number>>;
}

/** A change the validator made and shows (age moved up, mentor removed, mentor added). */
export interface CreationNotice {
  readonly check: CheckNumber;
  readonly key: string;
  readonly params: Readonly<Record<string, string | number>>;
}

export interface Validation {
  readonly choices: CreationChoices;
  readonly notices: readonly CreationNotice[];
  readonly problems: readonly CreationProblem[];
  /** Coaching seasons that will be written, once checks 1 to 4 pass. */
  readonly coachingSeasons: number;
}

const range = (prefix: string): { min: number; max: number } => ({ min: param(`${prefix}.min`), max: param(`${prefix}.max`) });

/** E1.6.1 table: coaching seasons written for each start at each level. */
export function writtenRange(start: StartMode, level: Level): { min: number; max: number } {
  if (start === 'nobody') return { min: 0, max: 0 };
  if (start === 'head_coach') return range(`written.head_coach.${level}`);
  return range(`written.${start}`);
}

function headSeasonsInSpan(world: CreationWorld, personId: number, level: Level, from: number, to: number): number {
  const levelOf = new Map(world.teams.map((t) => [t.id, t.level] as const));
  const seasons = new Set<number>();
  for (const s of world.headStints) {
    if (s.personId !== personId || levelOf.get(s.teamId) !== level) continue;
    const last = s.lastSeason ?? world.year;
    for (let y = Math.max(s.firstSeason, from); y <= Math.min(last, to); y++) seasons.add(y);
  }
  return seasons.size;
}

/** Years before coaching that the minimum-age rule adds (E1.5.1 depth pass). */
export function yearsBeforeCoaching(c: Pick<CreationChoices, 'playing' | 'education'>): number {
  return param('ageBase') + c.playing.proSeasons + c.education.otherWorkYears;
}

export function mentorBounds(start: StartMode): { min: number; max: number } {
  return { min: param(`mentorsMin.${start}`), max: Math.min(param(`mentorsMax.${start}`), param('maxMentors')) };
}

/**
 * Runs checks 1 to 8 in the order of E1.7.1 and normalises where the leaf says to. Problems block
 * confirm; notices are shown. The returned `choices` are the normalised choices.
 */
export function validateCreation(input: CreationChoices, world: CreationWorld, rules: CoachRules): Validation {
  const problems: CreationProblem[] = [];
  const notices: CreationNotice[] = [];
  let c: CreationChoices = input;
  const fail = (check: CheckNumber, key: string, params: Record<string, string | number> = {}) => problems.push({ check, key, params });

  // 1. Start mode sets the rung and the written-seasons range.
  if (!START_MODES.includes(c.start)) fail(1, 'coach.create.start_unknown', { start: String(c.start) });
  else if (!START_LEVELS[c.start].includes(c.level)) fail(1, 'coach.create.start_not_at_level', { start: c.start, level: c.level });
  if (c.experienced && c.start !== 'head_coach') fail(1, 'coach.create.experienced_needs_head_start', {});

  // 2. Playing history sets professional seasons.
  const pro = c.playing.proSeasons;
  if (!PLAYING_LEVELS.includes(c.playing.level)) fail(2, 'coach.create.playing_unknown', {});
  else if (c.playing.level === 'pro_short' || c.playing.level === 'pro_long') {
    const lo = c.playing.level === 'pro_short' ? param('proSeasonsMin') : param('shortProMaxSeasons') + 1;
    const hi = c.playing.level === 'pro_short' ? param('shortProMaxSeasons') : param('proSeasonsMax');
    if (!Number.isInteger(pro) || pro < lo || pro > hi) fail(2, 'coach.create.pro_seasons_out_of_range', { min: lo, max: hi, value: pro });
  } else if (pro !== 0) fail(2, 'coach.create.pro_seasons_without_pro_career', { value: pro });
  if (c.playing.level === 'none' && c.playing.positionGroup !== 'none') fail(2, 'coach.create.position_without_playing', {});

  // 3. Education and other work set extra years.
  const w = c.education.otherWorkYears;
  if (!Number.isInteger(w) || w < 0 || w > param('otherWorkYearsMax')) fail(3, 'coach.create.work_years_out_of_range', { max: param('otherWorkYearsMax'), value: w });
  if ((c.education.degree === 'none') !== (c.education.field === null)) fail(3, 'coach.create.degree_field_mismatch', {});

  // 4. Minimum age. Coaching seasons first (they feed the minimum), then the age moves up if needed.
  let seasons = 0;
  if (problems.length === 0) {
    const wr = writtenRange(c.start, c.level);
    const before = yearsBeforeCoaching(c);
    if (c.coachingSeasons !== null && (c.coachingSeasons < wr.min || c.coachingSeasons > wr.max || !Number.isInteger(c.coachingSeasons))) {
      fail(4, 'coach.create.seasons_out_of_range', { min: wr.min, max: wr.max, value: c.coachingSeasons });
    } else {
      const maxAge = c.start === 'nobody' ? param('rung0MaxAge') : param('maxStartAge');
      const minAgeFloor = c.start === 'nobody' ? param('rung0MinAge') : 0;
      const roomAtAge = c.age - before;
      seasons = c.coachingSeasons ?? Math.max(wr.min, Math.min(wr.max, Math.min(roomAtAge, Math.floor((wr.min + wr.max) / 2))));
      // A nobody start writes no coaching seasons; his minimum is the rung 0 floor or the years before coaching.
      const minAge = Math.max(minAgeFloor, c.start === 'nobody' ? Math.min(before, param('rung0MinAge') + c.playing.proSeasons + w) : before + seasons);
      if (c.age < minAge) {
        notices.push({ check: 4, key: 'coach.create.age_moved_up', params: { from: c.age, to: minAge } });
        c = { ...c, age: minAge };
      }
      if (c.age > maxAge) fail(4, 'coach.create.age_above_max', { max: maxAge, value: c.age });
    }
  }

  // 5. Mentors: each must have been a head coach at least two seasons inside the coaching span.
  if (problems.length === 0) {
    const from = world.year - seasons;
    const to = world.year - 1;
    const bounds = mentorBounds(c.start);
    const kept: number[] = [];
    for (const m of c.mentors) {
      if (kept.includes(m)) continue;
      const n = headSeasonsInSpan(world, m, c.level, from, to);
      if (n < param('mentorMinHeadSeasonsInSpan')) notices.push({ check: 5, key: 'coach.create.mentor_removed_span', params: { mentor: m, seasons: n } });
      else if (kept.length >= bounds.max) notices.push({ check: 5, key: 'coach.create.mentor_removed_count', params: { mentor: m, max: bounds.max } });
      else if ((kept.length + 1) * param('seatSeasonsPerMentorMin') > seasons) notices.push({ check: 5, key: 'coach.create.mentor_removed_room', params: { mentor: m, seasons } });
      else kept.push(m);
    }
    // The start's table asks for a minimum number of mentors; fill from eligible head coaches, by id order.
    if (kept.length < bounds.min) {
      const eligible = [...new Set(world.headStints.map((s) => s.personId))].sort((a, b) => a - b)
        .filter((p) => !kept.includes(p) && headSeasonsInSpan(world, p, c.level, from, to) >= param('mentorMinHeadSeasonsInSpan'));
      while (kept.length < bounds.min && eligible.length > 0 && (kept.length + 1) * param('seatSeasonsPerMentorMin') <= seasons) {
        const p = eligible.shift() as number;
        kept.push(p);
        notices.push({ check: 5, key: 'coach.create.mentor_added', params: { mentor: p } });
      }
      if (kept.length < bounds.min) fail(5, 'coach.create.no_eligible_mentor', { needed: bounds.min, found: kept.length });
    }
    c = { ...c, mentors: kept };
  }

  // 6 and 7 are checked on the written history (auditCoach); here only what can be known before writing.
  if (problems.length === 0 && seasons > 0 && c.mentors.length * param('seatSeasonsPerMentorMin') > seasons) {
    fail(6, 'coach.create.mentor_seasons_exceed_total', { seasons });
  }
  if (rules.gaMaxSeasons < 0 || rules.gaDegreeWindowYears < 0) fail(7, 'coach.create.rule_values_missing', {});

  // 8. First job.
  const teamLevel = new Map(world.teams.map((t) => [t.id, t.level] as const));
  if (STARTS_WITH_FIRST_TEAM.has(c.start)) {
    if (c.firstTeamId === null) fail(8, 'coach.create.first_team_missing', {});
    else if (teamLevel.get(c.firstTeamId) !== c.level) fail(8, 'coach.create.first_team_not_at_level', { team: c.firstTeamId });
    else if (c.openJobsOnly && !world.vacantTeamIds.includes(c.firstTeamId)) fail(8, 'coach.create.first_team_not_vacant', { team: c.firstTeamId });
  } else if (c.start === 'nobody' && c.firstTeamId !== null && teamLevel.get(c.firstTeamId) === undefined) {
    fail(8, 'coach.create.home_program_unknown', { team: c.firstTeamId });
  }

  // Household and name sanity (E1.5.1, E1.5.2) are part of the person step; they report under check 4.
  if (c.name.first.trim() === '' || c.name.last.trim() === '') fail(4, 'coach.create.name_missing', {});
  if (c.household.kind !== 'partner_children' && c.household.childAges.length > 0) fail(4, 'coach.create.children_without_household', {});
  if (c.household.kind === 'partner_children' && (c.household.childAges.length < 1 || c.household.childAges.length > 5)) fail(4, 'coach.create.children_count', {});

  return { choices: c, notices, problems, coachingSeasons: seasons };
}

// ---------------------------------------------------------------------------------------------------
// The written past

export type SeatKind =
  | 'student_assistant' | 'volunteer' | 'graduate_assistant' | 'quality_control'
  | 'position_coach' | 'coordinator' | 'head_coach';

/** One season of written history (E1.2.2 outputs: seasons, teams, roles). Append-only once written. */
export interface WrittenSeat {
  readonly seasonYear: number;
  /** In-league team, or null for a light-record program outside the league (E1.2.2 edge case). */
  readonly teamId: number | null;
  /** The head coach who held that team's job that season; null when the seat is outside the league. */
  readonly headCoachId: number | null;
  readonly seat: SeatKind;
  readonly mentorId: number | null;
}

/** HistoryFact shape of the world contract (seasonYear, dayIndex, kind, refIds). */
export interface CoachHistoryFact {
  readonly seasonYear: number;
  readonly dayIndex: number;
  readonly kind: string;
  readonly refIds: readonly number[];
}

/** RelationshipEdge shape of the world contract (X7.1.1). Strength and sign are truth. */
export interface CoachEdge {
  readonly a: number;
  readonly b: number;
  readonly bTeamId: null;
  readonly kind: 'mentor' | 'worked_under' | 'worked_with';
  readonly strength: number;
  readonly sign: 'warm' | 'neutral' | 'cold';
  readonly since: { readonly seasonYear: number; readonly dayIndex: number };
  readonly lastContact: { readonly seasonYear: number; readonly dayIndex: number };
  readonly basisEventIds: readonly number[];
}

/** Other people's first read of him on day one, in words (E1.4.1 summary). Never a value about him. */
export interface FirstRead {
  readonly audience: 'players' | 'owners' | 'staff' | 'hiring';
  readonly key: string;
}

/** CoachingBlock shape of the world contract (E1.1.1 football identity). Ids, counts and refs only. */
export interface CoachingParts {
  readonly side: Side;
  readonly positionGroupTaught: PositionGroup;
  readonly offensiveFamily: string | null;
  readonly defensiveFamily: string | null;
  readonly systemFamilies: Readonly<Record<string, number>>;
  readonly philosophyId: null;
  readonly demonstratedRecord: Readonly<Record<string, readonly number[]>>;
  readonly historyFacts: readonly CoachHistoryFact[];
}

export interface CreatedCoach {
  readonly personId: number;
  readonly isUser: true;
  readonly name: { readonly first: string; readonly last: string };
  readonly birthDate: { readonly seasonYear: number; readonly dayIndex: number };
  readonly appearanceSeed: number;
  readonly homeRegion: string | null;
  readonly level: Level;
  readonly start: StartMode;
  readonly experienced: boolean;
  readonly origin: string | null;
  readonly playing: PlayingHistory;
  readonly education: Education;
  readonly coaching: CoachingParts;
  /** Default play-calling delegation (I2.6.2 and its defensive counterpart): which side he calls. */
  readonly callsOwnSide: boolean;
  readonly seats: readonly WrittenSeat[];
  readonly mentors: readonly number[];
  readonly edges: readonly CoachEdge[];
  readonly household: HouseholdChoice;
  /** E1.2.1: the players' opening opinion edge (their state, stored on their side, L1/E5) and its decay. */
  readonly playerOpinionEdge: number;
  readonly playerOpinionDecaySeasons: number;
  readonly firstReads: readonly FirstRead[];
  /** E1.6.2: the job taken and the sitting head coach moved to the market (free choice), if any. */
  readonly firstJob: { readonly teamId: number; readonly displacedHeadCoachId: number | null } | null;
  /** Trait block of the user person: empty maps, source user (X1.1.1 rule 3). */
  readonly traitBlock: { readonly facets: Record<string, never>; readonly values: Record<string, never>; readonly goals: readonly never[]; readonly schemaVersion: 1; readonly source: 'user' };
  readonly seed: number;
  readonly notices: readonly CreationNotice[];
}

export type CreationResult =
  | { readonly ok: true; readonly coach: CreatedCoach }
  | { readonly ok: false; readonly problems: readonly CreationProblem[]; readonly notices: readonly CreationNotice[] };

const START_OF_SEASON = 0;

function drawInt(rng: CoachRandom, lo: number, hi: number): number {
  if (hi <= lo) return lo;
  return lo + Math.floor(rng.uniform() * (hi - lo + 1));
}

function pickWeighted<T>(rng: CoachRandom, items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((s, [, w]) => s + Math.max(0, w), 0);
  let u = rng.uniform() * total;
  for (const [v, w] of items) {
    u -= Math.max(0, w);
    if (u < 0) return v;
  }
  return items[items.length - 1]![0];
}

type Stage = 'entry' | 'position' | 'coordinator' | 'head' | 'lastCoordinator' | 'lastSeat';

/** Stage order of the written past for each start (E1.6.1 "Seats written" column). */
function stagesFor(start: StartMode, experienced: boolean): readonly Stage[] {
  switch (start) {
    case 'nobody': return [];
    case 'graduate_assistant':
    case 'quality_control': return ['entry'];
    case 'position_coach': return ['entry', 'position'];
    case 'coordinator': return ['entry', 'position', 'coordinator'];
    case 'head_coach': return experienced ? ['entry', 'position', 'coordinator', 'head', 'lastCoordinator'] : ['entry', 'position', 'coordinator', 'lastSeat'];
  }
}

const STAGE_RANGE: Readonly<Record<Stage, string>> = {
  entry: 'stage.entry', position: 'stage.position', coordinator: 'stage.coordinator',
  head: 'stage.head', lastCoordinator: 'stage.lastCoordinator', lastSeat: 'stage.lastCoordinator',
};

/** Split `total` seasons over the stages: each but the last drawn in its range, the last takes the rest. */
function stageLengths(stages: readonly Stage[], total: number, rng: CoachRandom): number[] {
  const out: number[] = [];
  let left = total;
  // Draw the tail stages (head, last seat) first: they are short and anchor the end of the history.
  const lengths = new Map<number, number>();
  for (let i = stages.length - 1; i >= 1; i--) {
    const st = stages[i]!;
    if (st !== 'head' && st !== 'lastCoordinator' && st !== 'lastSeat') continue;
    const r = range(STAGE_RANGE[st]);
    const n = Math.max(0, Math.min(drawInt(rng, r.min, r.max), left - (i)));
    lengths.set(i, n);
    left -= n;
  }
  const front = stages.map((_, i) => i).filter((i) => !lengths.has(i));
  front.forEach((i, k) => {
    const isLast = k === front.length - 1;
    if (isLast) { lengths.set(i, Math.max(0, left)); left = 0; return; }
    const r = range(STAGE_RANGE[stages[i]!]);
    const keep = front.length - 1 - k; // one season at least for each later front stage
    const n = Math.max(Math.min(1, left), Math.min(drawInt(rng, r.min, r.max), left - keep));
    lengths.set(i, n);
    left -= n;
  });
  for (let i = 0; i < stages.length; i++) out.push(lengths.get(i) ?? 0);
  return out;
}

/** Head coach of a team in a season, from the world's stints. */
function headOf(world: CreationWorld, teamId: number, year: number): number | null {
  for (const s of world.headStints) {
    if (s.teamId === teamId && s.firstSeason <= year && (s.lastSeason ?? world.year) >= year) return s.personId;
  }
  return null;
}

/** The last seat of a first-time head coach start, by the measured mix of where hires came from (E1.6.1). */
function lastSeatKind(level: Level, rng: CoachRandom): { seat: SeatKind; outside: boolean } {
  const factId = ({ college: FACT_COLLEGE_LAST_SEAT, pro: FACT_PRO_LAST_SEAT } as const)[level];
  const shares = shareMap(factId);
  // A first-time hire excludes the "previous head coach at this level" share (that is the experienced start).
  const SEAT_OF: Readonly<Record<string, { seat: SeatKind; outside: boolean } | null>> = {
    smaller_program_head: { seat: 'head_coach', outside: true },
    p4_coordinator: { seat: 'coordinator', outside: false },
    internal: { seat: 'coordinator', outside: false },
    p4_head: null,
    offensive_coordinator: { seat: 'coordinator', outside: false },
    defensive_coordinator: { seat: 'coordinator', outside: false },
    prior_pro_head: null,
    college_head: { seat: 'head_coach', outside: true },
  };
  const items: [{ seat: SeatKind; outside: boolean }, number][] = [];
  let used = 0;
  for (const [k, share] of shares) {
    used += share;
    const s = SEAT_OF[k];
    if (s) items.push([s, share]);
  }
  // The rest of the hires (other routes) are written as coordinator seats.
  items.push([{ seat: 'coordinator', outside: false }, Math.max(0, 1 - used)]);
  return pickWeighted(rng, items);
}

interface EntryContext {
  readonly gaAllowed: boolean;
  readonly level: Level;
  gaUsed: number;
}

function entrySeat(ctx: EntryContext, rules: CoachRules, firstGaYearOk: boolean): SeatKind {
  // Graduate assistant seats are a college rung: degree held, inside the window, at most the rule's seasons.
  const LEVEL_ENTRY: Readonly<Record<Level, SeatKind>> = { college: 'student_assistant', pro: 'quality_control' };
  if (ctx.gaAllowed && firstGaYearOk && ctx.gaUsed < rules.gaMaxSeasons && START_LEVELS.graduate_assistant.includes(ctx.level)) {
    ctx.gaUsed++;
    return 'graduate_assistant';
  }
  return LEVEL_ENTRY[ctx.level];
}

/**
 * Validate, then write the coach's past from the seed. Refuses while any check fails (E1.7.1).
 * `personId` is the id the save issues for the new person.
 */
export function createCoach(input: CreationChoices, world: CreationWorld, rules: CoachRules, rng: CoachRandom, personId: number): CreationResult {
  const v = validateCreation(input, world, rules);
  if (v.problems.length > 0) return { ok: false, problems: v.problems, notices: v.notices };
  const c = v.choices;
  const C = v.coachingSeasons;
  const firstYear = world.year - C;
  const birthYear = world.year - c.age;

  // Stages and their seasons, earliest first.
  const stages = stagesFor(c.start, c.experienced);
  const lengths = stageLengths(stages, C, rng);
  const stageOfYear: Stage[] = [];
  stages.forEach((st, i) => { for (let k = 0; k < lengths[i]!; k++) stageOfYear.push(st); });
  const last = c.start === 'head_coach' && !c.experienced ? lastSeatKind(c.level, rng) : null;

  // Mentor blocks: each mentor 2 to 6 seasons on his staff, inside his stints, earliest mentor first.
  const levelOf = new Map(world.teams.map((t) => [t.id, t.level] as const));
  const taken = new Map<number, { teamId: number; mentorId: number }>();
  for (const m of c.mentors) {
    const seasons: { year: number; teamId: number }[] = [];
    for (let y = firstYear; y < world.year; y++) {
      if (taken.has(y)) continue;
      const st = stageOfYear[y - firstYear];
      if (st === 'head' || (last?.outside && st === 'lastSeat')) continue; // his own head seasons are not on a mentor's staff
      const s = world.headStints.find((h) => h.personId === m && levelOf.get(h.teamId) === c.level && h.firstSeason <= y && (h.lastSeason ?? world.year) >= y);
      if (s) seasons.push({ year: y, teamId: s.teamId });
    }
    // Longest contiguous run, then a block of 2 to 6 inside it.
    let best: { year: number; teamId: number }[] = [];
    let run: { year: number; teamId: number }[] = [];
    for (const s of seasons) {
      if (run.length > 0 && s.year !== run[run.length - 1]!.year + 1) run = [];
      run.push(s);
      if (run.length > best.length) best = [...run];
    }
    const want = drawInt(rng, param('seatSeasonsPerMentorMin'), param('seatSeasonsPerMentorMax'));
    const n = Math.min(want, best.length);
    if (n < param('seatSeasonsPerMentorMin')) continue;
    const startAt = drawInt(rng, 0, best.length - n);
    for (const s of best.slice(startAt, startAt + n)) taken.set(s.year, { teamId: s.teamId, mentorId: m });
  }

  // GA eligibility: a bachelor's degree, and the first GA season inside the degree window, which starts
  // at the later of the degree and the end of college eligibility (S3.3.4 rule 1). College ends at ageBase.
  const collegeEnd = birthYear + param('ageBase');
  const ctx: EntryContext = { gaAllowed: c.education.degree !== 'none', level: c.level, gaUsed: 0 };
  const teamsAtLevel = world.teams.filter((t) => t.level === c.level).map((t) => t.id).sort((a, b) => a - b);

  const seats: WrittenSeat[] = [];
  let prevTeam: number | null = null;
  for (let y = firstYear; y < world.year; y++) {
    const st = stageOfYear[y - firstYear]!;
    let seat: SeatKind;
    let outside = false;
    switch (st) {
      case 'entry': seat = entrySeat(ctx, rules, y - collegeEnd <= rules.gaDegreeWindowYears); break;
      case 'position': seat = 'position_coach'; break;
      case 'coordinator': case 'lastCoordinator': seat = 'coordinator'; break;
      case 'head': seat = 'head_coach'; outside = true; break;
      case 'lastSeat': seat = last!.seat; outside = last!.outside; break;
    }
    if (outside) { seats.push({ seasonYear: y, teamId: null, headCoachId: null, seat, mentorId: null }); prevTeam = null; continue; }
    const t = taken.get(y);
    if (t) { seats.push({ seasonYear: y, teamId: t.teamId, headCoachId: m0(headOf(world, t.teamId, y)), seat, mentorId: t.mentorId }); prevTeam = t.teamId; continue; }
    // Not under a mentor: stay or follow a colleague with the E1.2.2 chance, else another staff that has a head coach.
    const staffed = teamsAtLevel.filter((id) => headOf(world, id, y) !== null);
    if (staffed.length === 0) { seats.push({ seasonYear: y, teamId: null, headCoachId: null, seat, mentorId: null }); prevTeam = null; continue; }
    let team: number;
    if (prevTeam !== null && staffed.includes(prevTeam) && rng.uniform() < param('followColleagueChance')) team = prevTeam;
    else team = staffed[drawInt(rng, 0, staffed.length - 1)]!;
    seats.push({ seasonYear: y, teamId: team, headCoachId: headOf(world, team, y), seat, mentorId: null });
    prevTeam = team;
  }

  // Seasons worked per family: a count over seasons on staffs whose head coach ran that family (E1.2.2 rule 3).
  const families: Record<string, number> = {};
  for (const s of seats) {
    if (s.teamId === null) continue;
    const stint = world.headStints.find((h) => h.teamId === s.teamId && h.firstSeason <= s.seasonYear && (h.lastSeason ?? world.year) >= s.seasonYear);
    for (const f of [stint?.offensiveFamily, stint?.defensiveFamily]) if (f) families[f] = (families[f] ?? 0) + 1;
  }
  const longest = (pick: (h: HeadStint) => string | null): string | null => {
    const counts = new Map<string, number>();
    for (const s of seats) {
      if (s.teamId === null) continue;
      const stint = world.headStints.find((h) => h.teamId === s.teamId && h.firstSeason <= s.seasonYear && (h.lastSeason ?? world.year) >= s.seasonYear);
      const f = stint ? pick(stint) : null;
      if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
    }
    let best: string | null = null;
    for (const [f, n] of [...counts].sort((a, b) => (a[0] < b[0] ? -1 : 1))) if (best === null || n > (counts.get(best) ?? 0)) best = f;
    return best;
  };

  // Relationship edges: everyone who shared a staff, by seasons together (E1.2.2 rule 2).
  const together = new Map<number, { n: number; first: number; last: number; kind: CoachEdge['kind'] }>();
  const bump = (p: number, y: number, kind: CoachEdge['kind']) => {
    if (p === personId) return;
    const e = together.get(p);
    const rank = { worked_with: 0, worked_under: 1, mentor: 2 } as const;
    if (!e) together.set(p, { n: 1, first: y, last: y, kind });
    else together.set(p, { n: e.n + 1, first: Math.min(e.first, y), last: Math.max(e.last, y), kind: rank[kind] > rank[e.kind] ? kind : e.kind });
  };
  for (const s of seats) {
    if (s.teamId === null) continue;
    if (s.headCoachId !== null) bump(s.headCoachId, s.seasonYear, s.mentorId === s.headCoachId ? 'mentor' : 'worked_under');
    for (const st of world.staffSeasons) if (st.teamId === s.teamId && st.seasonYear === s.seasonYear && st.personId !== s.headCoachId) bump(st.personId, s.seasonYear, 'worked_with');
  }
  const edges: CoachEdge[] = [...together].sort((a, b) => a[0] - b[0]).map(([p, e]) => {
    const term = Math.round((rng.uniform() * 2 - 1) * param('edgePersonalTerm'));
    const strength = Math.max(0, Math.min(100, Math.min(param('edgeStrengthCap'), e.n * param('edgeStrengthPerSeason')) + term));
    const sign = term > param('edgeWarmCut') ? 'warm' : term < -param('edgeWarmCut') ? 'cold' : 'neutral';
    return {
      a: personId, b: p, bTeamId: null, kind: e.kind, strength, sign,
      since: { seasonYear: e.first, dayIndex: START_OF_SEASON }, lastContact: { seasonYear: e.last, dayIndex: START_OF_SEASON }, basisEventIds: [],
    };
  });

  // History facts: degrees, graduate programme seasons for GA rows (E1.2.3 rule 2), mentors, playing.
  const facts: CoachHistoryFact[] = [];
  const fact = (seasonYear: number, kind: string, refIds: readonly number[] = []) => facts.push({ seasonYear, dayIndex: START_OF_SEASON, kind, refIds });
  if (c.playing.level !== 'none') fact(collegeEnd, `played_${c.playing.level}`);
  if (c.education.degree !== 'none') fact(collegeEnd, `degree_bachelor_${c.education.field}`);
  const gaYears = seats.filter((s) => s.seat === 'graduate_assistant').map((s) => s.seasonYear);
  for (const y of gaYears) fact(y, 'graduate_program_enrolled', s0(seats.find((s) => s.seasonYear === y)?.teamId));
  if (c.education.degree === 'master' || gaYears.length > 0) fact(gaYears.length > 0 ? gaYears[gaYears.length - 1]! : collegeEnd, `degree_master_${c.education.field ?? 'other'}`);
  if (c.education.military) fact(collegeEnd, 'military_service');
  if (c.education.otherWorkYears > 0) fact(collegeEnd, 'other_full_time_work');
  for (const m of c.mentors) {
    const ys = seats.filter((s) => s.mentorId === m).map((s) => s.seasonYear);
    if (ys.length > 0) fact(ys[0]!, 'worked_under', [m]);
  }

  // First job and the sitting head coach moved to the market in free choice (E1.6.2 edge case).
  let firstJob: CreatedCoach['firstJob'] = null;
  if (c.firstTeamId !== null && STARTS_WITH_FIRST_TEAM.has(c.start)) {
    const sitting = c.start === 'head_coach' ? headOf(world, c.firstTeamId, world.year) : null;
    firstJob = { teamId: c.firstTeamId, displacedHeadCoachId: c.openJobsOnly ? null : sitting };
  }

  const coaching: CoachingParts = {
    side: c.identity.side,
    positionGroupTaught: c.identity.positionGroup,
    offensiveFamily: c.identity.offensiveFamily ?? longest((h) => h.offensiveFamily),
    defensiveFamily: c.identity.defensiveFamily ?? longest((h) => h.defensiveFamily),
    systemFamilies: families,
    philosophyId: null,
    demonstratedRecord: {},
    historyFacts: facts,
  };

  const coach: CreatedCoach = {
    personId, isUser: true, name: c.name,
    birthDate: { seasonYear: birthYear, dayIndex: START_OF_SEASON },
    appearanceSeed: c.appearanceKey, homeRegion: c.household.homeRegion,
    level: c.level, start: c.start, experienced: c.experienced, origin: c.origin,
    playing: c.playing, education: c.education, coaching,
    callsOwnSide: c.identity.intendsToCall,
    seats, mentors: c.mentors, edges, household: c.household,
    playerOpinionEdge: playerOpinionEdge(c.playing.level),
    playerOpinionDecaySeasons: param('playerRepEdgeDecaySeasons'),
    firstReads: firstReads(c, seats),
    firstJob,
    traitBlock: { facets: {}, values: {}, goals: [], schemaVersion: 1, source: 'user' },
    seed: c.seed,
    notices: v.notices,
  };
  const audit = auditCoach(coach, world, rules);
  if (audit.length > 0) return { ok: false, problems: audit, notices: v.notices };
  return { ok: true, coach };
}

const m0 = (x: number | null): number | null => x;
const s0 = (x: number | null | undefined): number[] => (x === null || x === undefined ? [] : [x]);

/** E1.2.1: the players' opening opinion edge for a playing history, on their 0 to 100 scale. */
export function playerOpinionEdge(level: PlayingLevel): number {
  const KEY: Readonly<Record<PlayingLevel, string | null>> = { none: null, small_college: null, major_college: 'playerRepEdge.major_college', pro_short: 'playerRepEdge.pro_short', pro_long: 'playerRepEdge.pro_long' };
  const k = KEY[level];
  return k === null ? 0 : param(k);
}

/**
 * The edge left after `seasons` seasons with the coach: linear decay to zero over the decay period
 * (E1.2.1 "decays to zero over the first two seasons as results replace it"; linear is an Assumption).
 */
export function playerOpinionEdgeAfter(level: PlayingLevel, seasons: number): number {
  const d = param('playerRepEdgeDecaySeasons');
  const left = Math.max(0, 1 - seasons / d);
  return playerOpinionEdge(level) * left;
}

/** E1.4.1: how each audience is likely to read him on day one, in words. */
export function firstReads(c: CreationChoices, seats: readonly WrittenSeat[]): FirstRead[] {
  const out: FirstRead[] = [];
  const PLAYERS: Readonly<Record<PlayingLevel, string>> = {
    none: 'coach.read.players.no_playing_credit',
    small_college: 'coach.read.players.small_college',
    major_college: 'coach.read.players.major_college_credit',
    pro_short: 'coach.read.players.former_pro_credit',
    pro_long: 'coach.read.players.former_pro_long_credit',
  };
  out.push({ audience: 'players', key: PLAYERS[c.playing.level] });
  const hasHead = seats.some((s) => s.seat === 'head_coach');
  if (c.start === 'head_coach' && !hasHead) out.push({ audience: 'owners', key: 'coach.read.owners.no_head_experience' });
  if (hasHead) out.push({ audience: 'owners', key: 'coach.read.owners.has_run_a_program' });
  if (c.playing.level === 'pro_long') out.push({ audience: 'hiring', key: 'coach.read.hiring.short_coaching_history' });
  if (c.start === 'nobody') out.push({ audience: 'hiring', key: 'coach.read.hiring.unknown_newcomer' });
  if (c.mentors.length > 0) out.push({ audience: 'staff', key: 'coach.read.staff.known_tree' });
  return out;
}

/**
 * Checks 6 and 7 of E1.7.1 on a written coach, plus the record-wide promises of E1.1.1 and E1.2.2:
 * seats per mentor 2 to 6 and total inside the start's range; GA rows only with a degree and at most the
 * rule's seasons; every in-league row names a team that existed and the head coach of that season.
 * Returns problems (empty when the record holds).
 */
export function auditCoach(coach: CreatedCoach, world: CreationWorld, rules: CoachRules): CreationProblem[] {
  const out: CreationProblem[] = [];
  const wr = writtenRange(coach.start, coach.level);
  if (coach.seats.length < wr.min || coach.seats.length > wr.max) out.push({ check: 6, key: 'coach.create.total_seasons_out_of_range', params: { min: wr.min, max: wr.max, value: coach.seats.length } });
  for (const m of coach.mentors) {
    const n = coach.seats.filter((s) => s.mentorId === m).length;
    if (n < param('seatSeasonsPerMentorMin') || n > param('seatSeasonsPerMentorMax')) out.push({ check: 6, key: 'coach.create.mentor_seasons_out_of_range', params: { mentor: m, value: n } });
  }
  const ga = coach.seats.filter((s) => s.seat === 'graduate_assistant');
  if (ga.length > 0 && coach.education.degree === 'none') out.push({ check: 7, key: 'coach.create.ga_without_degree', params: {} });
  if (ga.length > rules.gaMaxSeasons) out.push({ check: 7, key: 'coach.create.ga_too_many_seasons', params: { max: rules.gaMaxSeasons, value: ga.length } });
  const teamIds = new Set(world.teams.map((t) => t.id));
  for (const s of coach.seats) {
    if (s.teamId === null) continue;
    if (!teamIds.has(s.teamId)) out.push({ check: 6, key: 'coach.create.row_team_unknown', params: { season: s.seasonYear, team: s.teamId } });
    else if (s.headCoachId === null || headOf(world, s.teamId, s.seasonYear) !== s.headCoachId) out.push({ check: 6, key: 'coach.create.row_head_coach_wrong', params: { season: s.seasonYear, team: s.teamId } });
  }
  const years = coach.seats.map((s) => s.seasonYear);
  if (new Set(years).size !== years.length) out.push({ check: 6, key: 'coach.create.duplicate_season', params: {} });
  const minAge = yearsBeforeCoaching(coach) + coach.seats.length;
  const age = world.year - coach.birthDate.seasonYear;
  if (coach.start !== 'nobody' && age < minAge) out.push({ check: 4, key: 'coach.create.age_below_minimum', params: { min: minAge, value: age } });
  return out;
}
