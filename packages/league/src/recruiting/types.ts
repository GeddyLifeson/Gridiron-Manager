// Records of the recruiting module (G-36, bible T4). Plain data so a save can hold them.
//
// Visibility (K9.1.1, P3.2.4): fields under `truth` are hidden state that no screen may read: true
// quality, true interest, firmness, influence weights, the commitment threshold, `committable` on
// another school's offer, and academic truth. What a staff knows is in `StaffRead`, `CircleRead`,
// `FirmnessRead`, `AcademicRead` and the board grades, each built from evidence events with a basis
// and a date. `read-model.ts` is the only door a screen uses, and it takes none of the truth fields.

/** T4.8.1 position rows. A recruiting position is a room on the numbers board. */
export const POSITION_GROUPS = ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST'] as const;
export type PositionGroup = (typeof POSITION_GROUPS)[number];

/** Where a prospect comes from (T4.8.2). Transfers are T6 and enter the class plan only as places. */
export type ProspectSource = 'high_school' | 'juco';

/** What the prospect and his circle weigh (T4.1.1 preferences). Each weight 0 to 1; a member's weights sum to 1. */
export const PREFERENCE_KEYS = ['distance', 'playingTime', 'prestige', 'relationship', 'academics', 'money', 'schemeFit', 'favourite'] as const;
export type PreferenceKey = (typeof PREFERENCE_KEYS)[number];
export type Preferences = Readonly<Record<PreferenceKey, number>>;

export type CircleRelation = 'self' | 'parent' | 'second_parent' | 'hs_coach' | 'trainer' | 'adviser';

/** One person around the prospect (T4.4.2). Influence and preferences are truth. */
export interface CircleMember {
  readonly memberId: number;
  readonly relation: CircleRelation;
  /** True influence weight on the decision; the circle's weights sum to 1 (T4.4.2). Truth. */
  readonly influence: number;
  readonly prefs: Preferences;
}

/** Academic truth (T4.5.3). The staff sees `AcademicRead`. */
export interface AcademicTruth {
  /** 0 to 1: how fast grades move up (D4 aptitude, D5 diligence folded together). */
  readonly drive: number;
  coreGpa: number;
  coreCourses: number;
  /** Core courses finished before the last year of high school, and how many of those are English, mathematics or science. */
  coreBeforeFinalYear: number;
  coreBeforeFinalYearEms: number;
}

/** Junior college status (T4.1.2). */
export interface JucoStatus {
  /** Qualifier out of high school (T4.5.3) or not; sets which transfer rule applies. */
  readonly qualifierOutOfHighSchool: boolean;
  fullTimeTerms: number;
  transferableHours: number;
  transferGpa: number;
  graduated: boolean;
  /** Seasons of competition already used (the T5.2.1 clock reads it). */
  readonly seasonsUsed: number;
}

export interface Prospect {
  readonly personId: number;
  readonly origin: 'generated' | 'designed' | 'imported';
  readonly source: ProspectSource;
  /** High school graduation year: the class he signs in (T4.1.1). */
  readonly classYear: number;
  readonly position: PositionGroup;
  /** Home state code from regions.json (T4.1.1 hometown density). */
  readonly region: string;
  readonly heightIn: number;
  readonly weightLb: number;
  /** Public star rating, 2 to 5 (T4.1.1). Public. */
  publicStars: number;
  /** National rank on the public list, 1 = best, or null below the published list. Public. */
  publicRank: number | null;
  /** Truth: overall true quality on the internal skill scale, from the person generator (D13). */
  readonly trueQuality: number;
  /** Truth: forty time on a good day, seconds (D2); a camp measures it (T4.3.1). */
  readonly fortyS: number;
  /** Truth: share of the national class he is better than, 0 to 1. */
  readonly truePercentile: number;
  /** Truth: favourite program, or null. */
  readonly favouriteTeamId: number | null;
  /** Truth: everyone who has a say, including himself (relation 'self'). */
  readonly circle: readonly CircleMember[];
  /** Truth: how openly he tells a school where it stands, 0 to 1 (D5). */
  readonly openness: number;
  /** Truth: tells every school what it wants to hear (T4.4.1). */
  readonly pleaser: boolean;
  /** Truth: dislikes negative recruiting even when true (T4.4.3, D5). */
  readonly dislikesNegative: boolean;
  /** Truth: commits when one school's interest reaches this and leads the next by `commitMargin` (T4.5.2). */
  readonly commitThreshold: number;
  readonly commitMargin: number;
  readonly academics: AcademicTruth;
  readonly juco: JucoStatus | null;
}

/** One school's offer (T4.4.5 `{prospect, school, date, committable}`). `committable` is truth to everyone but the offering staff. */
export interface Offer {
  readonly prospectId: number;
  readonly teamId: number;
  readonly day: number;
  committable: boolean;
  withdrawn: boolean;
}

export type CommitStatus = 'open' | 'committed' | 'signed' | 'not_qualified' | 'enrolled';

/** Truth about where a prospect stands now. */
export interface ProspectStatus {
  status: CommitStatus;
  teamId: number | null;
  /** Day he committed to the present school, or signed. */
  sinceDay: number | null;
  /** Commitments made and broken this cycle (T4.5.2 flips), and drops by schools (T4.4.4). */
  decommits: number;
  droppedBy: number[];
  signedDay: number | null;
  /** Signed in the early period (T4.5.2). */
  signedEarly: boolean;
  /** Drawn once when the early period opens: waits for February even when committed. */
  waitsForFebruary: boolean | null;
}

/** Per (prospect, school) hidden state: impression from visits and offers, and visit history. */
export interface SchoolTie {
  readonly prospectId: number;
  readonly teamId: number;
  /** Truth: momentum from visits, offers and claims, 0 to 1, decays weekly. */
  impression: number;
  /** Main recruiter assigned by the school, or null. */
  recruiterId: number | null;
  /** The head coach's involvement, 0 to 1 (T4.4.1: where he goes signals priority). */
  hcInvolvement: number;
  officialVisits: number[];
  unofficialVisits: number[];
  /** Head coach at the time of the last official visit (T4.5.1: a second visit after a change is allowed). */
  officialVisitHeadCoach: number | null;
  /** Off-campus in-person contacts made this cycle (T4.2.1 six-contact limit). */
  offCampusContacts: number;
  /** Recruiting opportunities used under the 2027 model, January to May and fall (T4.2.2). */
  oppsSpring: number;
  oppsFall: number;
  /** Day of the last contact by this school (T4.5.2 lapse multiplier). */
  lastContactDay: number | null;
  /** Contacts this week, by week start day, for diminishing returns (T4.4.1) and the weekly limit. */
  weekStart: number;
  contactsThisWeek: number;
  inPersonThisWeek: number;
  callsThisWeek: number;
  oppsThisWeek: number;
  /** Day the main recruiter left the school (T4.5.2 multiplier), and the day he last decommitted from it. */
  recruiterLeftDay: number | null;
  decommitDay: number | null;
}

/** Relationship edge strength, 0 to 100 (X7), between a staff member and a prospect or a circle member. */
export interface Edge {
  readonly fromId: number;
  readonly toId: number;
  strength: number;
  lastDay: number;
}

export const STANDING_WORDS = ['we_lead', 'top_group', 'in_the_mix', 'trailing', 'no_real_chance'] as const;
export type StandingWord = (typeof STANDING_WORDS)[number] | 'unknown';

export type EvidenceKind = 'said_to_recruiter' | 'said_to_head_coach' | 'hs_coach_says' | 'family_says' | 'public_list' | 'visit_taken' | 'rival_seen' | 'commitment' | 'decommitment' | 'signed';

/** One evidence event (T4.4.1). The staff read is built only from these. */
export interface Evidence {
  readonly kind: EvidenceKind;
  readonly day: number;
  /** Who heard or saw it (a staff member), or null for public facts. */
  readonly byStaffId: number | null;
  /** What it says about our standing, or null when it says nothing about it. */
  readonly signal: StandingWord | null;
  /** A rival school the evidence names. */
  readonly rivalTeamId: number | null;
  /** A reason the prospect or his circle gave (a preference key), with its sign. */
  readonly reason: { readonly key: PreferenceKey; readonly positive: boolean } | null;
}

/** The staff read record `{standing_word, reasons[], rivals[], basis[], as_of}` (T4.4.1). */
export interface StaffRead {
  readonly prospectId: number;
  readonly teamId: number;
  standing: StandingWord;
  reasons: { key: PreferenceKey; positive: boolean; basis: EvidenceKind; day: number }[];
  rivals: { teamId: number; basis: EvidenceKind; day: number }[];
  basis: { kind: EvidenceKind; day: number } | null;
  asOf: number | null;
  /** Evidence events in the order heard. */
  evidence: Evidence[];
}

export type InfluenceWord = 'decides' | 'strong_say' | 'some_say' | 'little_say' | 'unknown';

/** The staff's circle record `{person, relation, influence_word, cares_about[], basis, as_of}` (T4.4.2). */
export interface CircleRead {
  readonly memberId: number;
  readonly relation: CircleRelation;
  influence: InfluenceWord;
  caresAbout: PreferenceKey[];
  basis: EvidenceKind;
  asOf: number;
}

export type FirmnessWord = 'solid' | 'listening' | 'at_risk' | 'unknown';
export type AcademicWord = 'on_track' | 'needs_strong_final_year' | 'long_shot' | 'unknown';

/** What a staff believes about one prospect: grades, bands, reads. Never truth. */
export interface Board {
  readonly teamId: number;
  /** Prospect id to the staff's grade: the mean and half-width of the band on the internal skill scale (D6.1). */
  grades: Record<number, BoardGrade>;
  reads: Record<number, StaffRead>;
  circles: Record<number, CircleRead[]>;
  firmness: Record<number, { word: FirmnessWord; basis: EvidenceKind; day: number }>;
  academics: Record<number, { word: AcademicWord; basis: 'transcript' | 'hs_coach_says' | 'none'; day: number }>;
  /** Head coach's board line on the grade scale: first-pass grades below it stay out of the position coach's queue (T4.3.1). */
  boardLine: number;
  /** Prospects in the position coach's queue (T4.3.1). Moving one by hand puts him here regardless of the line. */
  queue: number[];
  /** Classes this staff has run a first-pass board for. */
  builtClasses: number[];
}

export type LookKind = 'first_pass_film' | 'full_film' | 'live' | 'camp' | 'hs_coach_word';
/** Attribute families a look narrows (T4.3.1). */
export type BandFamily = 'production' | 'athletic' | 'measurables' | 'character';

export interface BoardGrade {
  mean: number;
  /** Half-width of the band per family, internal skill scale. */
  band: Record<BandFamily, number>;
  /** Looks taken of each kind (each further look of a kind narrows half as much, T4.3.1). */
  looks: Partial<Record<LookKind, number>>;
  /** Who set the grade on the board: a first-pass evaluator or the position coach (T4.3.1). */
  setBy: 'first_pass' | 'position_coach' | 'public';
  /** Staff measured value after a camp (T4.3.1). */
  measured: { heightIn: number; weightLb: number; fortyS: number } | null;
  /** The user's own stored grade, truth-graded later (S11.1.1). */
  userGrade: number | null;
}

/** T4.8.1 `class_plan{position, target, source_split}`. */
export interface ClassPlanRow {
  readonly position: PositionGroup;
  target: number;
  split: { highSchool: number; transfer: number; juco: number };
  /** Places held open for the January transfer window (T4.8.2). */
  heldForTransfer: number;
}

/** A recruiting program as this module needs it. Facts come from T2, T9, the roster and the staff. */
export interface ProgramInfo {
  readonly teamId: number;
  /** Prestige 0 to 100 (T2). */
  readonly prestige: number;
  /** Tier for AI offer volume and personnel size (T4.4.5, T4.6.1). */
  readonly tier: 'top' | 'middle' | 'lower';
  readonly region: string;
  /** Academic standing 0 to 100 (T2). */
  readonly academics: number;
  /** Money in recruiting 0 to 100 (T7). */
  readonly money: number;
  readonly headCoachId: number;
  /** Staff who may be named off-campus recruiters, head coach first (T4.6.1). */
  readonly staffIds: readonly number[];
}

/** Recruiting actions. Every one is available in every period (T4.2.1 acceptance 2). */
export type ActionKind =
  | 'call' | 'message'
  | 'contact_off_campus' | 'home_visit'
  | 'contact_on_campus'
  | 'evaluation'
  | 'official_visit' | 'unofficial_visit'
  | 'camp';

export const IN_PERSON_OFF_CAMPUS: readonly ActionKind[] = ['contact_off_campus', 'home_visit'];
export const IN_PERSON_ON_CAMPUS: readonly ActionKind[] = ['contact_on_campus', 'official_visit', 'unofficial_visit', 'camp'];

/** Rules an act can break (T4.2.1, T4.2.2, T4.5.1, T4.5.2, T4.4.2, T4.8.1). Each maps to one compliance class. */
export type BreachRule =
  | 'contact_out_of_period' | 'on_campus_in_dead_period' | 'evaluation_out_of_period'
  | 'contact_before_start_date' | 'message_before_start_date' | 'call_before_start_date' | 'call_weekly_limit'
  | 'weekly_contact_limit' | 'total_contact_limit'
  | 'pool_exceeded' | 'no_offcampus_seat' | 'offcampus_seats_exceeded' | 'head_coach_spring_offcampus'
  | 'opportunities_exceeded' | 'weekly_opportunity_limit'
  | 'second_official_visit' | 'official_visit_dead_period' | 'visit_too_long' | 'paid_companions' | 'school_visit_cap'
  | 'visit_inducement' | 'circle_benefit' | 'iawp_hire'
  | 'contact_signed_prospect' | 'signing_day_contact'
  | 'academic_fraud' | 'roster_over_limit';

export interface Breach {
  readonly rule: BreachRule;
  /** Compliance class (G-28) the act is logged under. */
  readonly classId: string;
}

/** A violation the module recorded beside the compliance log row (which carries only the class). */
export interface RecruitingViolation {
  readonly logId: number;
  readonly rules: readonly BreachRule[];
  readonly teamId: number;
  readonly actorId: number;
  readonly prospectId: number | null;
  readonly day: number;
}

/** Memory entries for the prospect, his circle and his high school coach (L1.1.2, T4.4.4). */
export interface MemoryNote {
  readonly aboutTeamId: number;
  readonly holderId: number;
  readonly kind: 'offer_pulled' | 'commitment_refused' | 'promise_broken' | 'false_claim_found' | 'dropped_late';
  readonly day: number;
  readonly weight: number;
}

/** The whole recruiting state of a world. */
export interface RecruitingState {
  prospects: Record<number, Prospect>;
  status: Record<number, ProspectStatus>;
  /** Key `${prospectId}:${teamId}`. */
  ties: Record<string, SchoolTie>;
  /** Index: prospect id to the teams that hold a tie with him. */
  tieTeams: Record<number, number[]>;
  /** Key `${fromId}:${toId}`. */
  edges: Record<string, Edge>;
  offers: Offer[];
  boards: Record<number, Board>;
  plans: Record<number, ClassPlanRow[]>;
  /** Recruiting days used: key `${teamId}:${pool}` to the list of `${staffId}@${day}`. */
  daysUsed: Record<string, string[]>;
  /** Named off-campus recruiters per team for the current period (T4.2.2). */
  named: Record<number, number[]>;
  /** Official visits hosted per team per recruiting year (T4.5.1 school cap). Key `${teamId}:${year}`. */
  visitsHosted: Record<string, number>;
  violations: RecruitingViolation[];
  memory: MemoryNote[];
  /** Promises on playing time or position (L1), checked later. */
  promises: { prospectId: number; teamId: number; byId: number; kind: 'playing_time' | 'position'; day: number }[];
  /** Negative-recruiting claims waiting for the world to confirm or contradict them (T4.4.3). */
  claims: { id: number; speakerTeamId: number; speakerId: number; rivalTeamId: number; prospectId: number; topic: PreferenceKey; isTrue: boolean; day: number; settled: boolean }[];
  nextClaimId: number;
}

export function emptyRecruiting(): RecruitingState {
  return {
    prospects: {}, status: {}, ties: {}, tieTeams: {}, edges: {}, offers: [], boards: {}, plans: {}, daysUsed: {}, named: {},
    visitsHosted: {}, violations: [], memory: [], promises: [], claims: [], nextClaimId: 1,
  };
}
