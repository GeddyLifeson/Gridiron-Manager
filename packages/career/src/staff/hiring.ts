// Hiring (L4.2.1 to L4.2.4, K7.6.1 mechanics). Openings, interviews with topics and evidence (no rating
// is ever shown, L4.2.2), references shaded by trust and ties, the scheme compatibility panel, offers and
// acceptance, the candidate score shared by AI head coaches and the user-as-candidate (K7.6.1 rule 4),
// and the diverse-interview requirement (E2.3.1, counted on interviews, never outcomes).
import { possible, type RandomStream, type WorldDate } from '@gm/schema';
import { clamp, param } from './params.ts';
import type { HiringRules } from './keys.ts';
import { STAFF_NEEDS, type NeedWeights, type StaffNeed } from './record.ts';

// ---------- the candidate file ----------

/** One measured unit season he coached (his units' results, linked to log rows). */
export interface UnitSeason { readonly seasonYear: number; readonly unitKey: string; readonly evidenceEventIds: readonly number[] }

/** His past rooms' teaching record (D9 knowledge gain, N1 assignment errors) with the sample behind it. */
export interface RoomRecord { readonly weeks: number; readonly knowledgeGainRatio: number; readonly assignmentErrorRate: number; readonly evidenceEventIds: readonly number[] }

/** What a candidate is, as far as records go. Every statement an interview makes links to these rows. */
export interface CandidateFile {
  readonly personId: number;
  /** The rung he holds now (null: out of work or off the ladder). */
  readonly currentRung: number | null;
  readonly units: readonly UnitSeason[];
  readonly rooms: readonly RoomRecord[];
  readonly callersWorkedFor: readonly number[];
  readonly schemeFamily: string;
  /** Terms he already knows, by family history (G4 language). */
  readonly knownTerms: readonly string[];
  /** K6 tendency answers to named situations: situation key to answer text key with evidence. */
  readonly schemeAnswers: Readonly<Record<string, { readonly textKey: string; readonly evidenceEventIds: readonly number[] }>>;
  /** Staff he would bring (person ids). */
  readonly wouldBring: readonly number[];
  readonly needs: NeedWeights;
}

// ---------- interviews (L4.2.2) ----------

export const INTERVIEW_TOPICS = ['scheme', 'teaching', 'references', 'terminology', 'staff', 'wants'] as const;
export type InterviewTopic = (typeof INTERVIEW_TOPICS)[number];

export interface InterviewNote {
  readonly topic: InterviewTopic;
  readonly textKey: string;
  readonly params: Readonly<Record<string, string | number>>;
  /** Record rows behind the statement (L4.2.2 acceptance: every statement links to rows). */
  readonly evidenceEventIds: readonly number[];
}

export interface InterviewInput {
  readonly file: CandidateFile;
  readonly topics: readonly InterviewTopic[];
  /** Situations the user asks about under "scheme". */
  readonly situations: readonly string[];
  /** The user's installed terms (G4). */
  readonly installedTerms: readonly string[];
  /** G4 owns relearning weeks; the caller passes its mapping. */
  readonly relearnWeeks: (unknownTerms: number, totalTerms: number) => number;
  /** The user's familiarity with him before the interview (L1.1.3). */
  readonly familiarity: number;
}

export interface InterviewResult {
  readonly notes: readonly InterviewNote[];
  readonly minutes: number;
  readonly familiarityAfter: number;
}

export function interview(input: InterviewInput): InterviewResult {
  const topics = [...new Set(input.topics)];
  if (topics.length > param('interview.maxTopics')) throw new Error(`staff: an interview covers at most ${param('interview.maxTopics')} topics (L4.2.2)`);
  const f = input.file;
  const notes: InterviewNote[] = [];
  for (const t of topics) {
    switch (t) {
      case 'scheme':
        for (const sit of input.situations) {
          const a = f.schemeAnswers[sit];
          notes.push(a ? { topic: t, textKey: a.textKey, params: { situation: sit }, evidenceEventIds: a.evidenceEventIds }
            : { topic: t, textKey: 'staff.interview.scheme_no_answer', params: { situation: sit }, evidenceEventIds: [] });
        }
        break;
      case 'teaching': {
        if (f.rooms.length === 0) { notes.push({ topic: t, textKey: 'staff.interview.teaching_no_record', params: {}, evidenceEventIds: [] }); break; }
        const weeks = f.rooms.reduce((s, r) => s + r.weeks, 0);
        const gain = f.rooms.reduce((s, r) => s + r.knowledgeGainRatio * r.weeks, 0) / Math.max(1, weeks);
        const errors = f.rooms.reduce((s, r) => s + r.assignmentErrorRate * r.weeks, 0) / Math.max(1, weeks);
        notes.push({
          topic: t, textKey: weeks < param('teaching.smallSampleWeeks') ? 'staff.interview.teaching_small_sample' : 'staff.interview.teaching',
          params: { weeks, knowledgeGainRatio: gain, assignmentErrorRate: errors }, evidenceEventIds: f.rooms.flatMap((r) => r.evidenceEventIds),
        });
        break;
      }
      case 'references':
        notes.push({ topic: t, textKey: 'staff.interview.references', params: { names: f.callersWorkedFor.length }, evidenceEventIds: f.units.flatMap((u) => u.evidenceEventIds) });
        break;
      case 'terminology': {
        const known = new Set(f.knownTerms);
        const unknown = input.installedTerms.filter((x) => !known.has(x)).length;
        notes.push({ topic: t, textKey: 'staff.interview.terminology', params: { carryOver: input.installedTerms.length - unknown, unknown, weeks: input.relearnWeeks(unknown, input.installedTerms.length) }, evidenceEventIds: [] });
        break;
      }
      case 'staff':
        notes.push({ topic: t, textKey: 'staff.interview.would_bring', params: { count: f.wouldBring.length }, evidenceEventIds: [] });
        break;
      case 'wants':
        for (const n of revealedNeeds(f.needs, input.familiarity)) notes.push({ topic: t, textKey: `staff.need.${n}`, params: {}, evidenceEventIds: [] });
        break;
    }
  }
  return { notes, minutes: topics.length * param('interview.minutesPerTopic'), familiarityAfter: clamp(input.familiarity + param('interview.familiarityGain'), 0, 100) };
}

/** "What he wants" (L4.2.2): his strongest needs, more of them the better the user knows him (L1.1.3). */
export function revealedNeeds(needs: NeedWeights, familiarity: number): readonly StaffNeed[] {
  const ranked = [...STAFF_NEEDS].filter((n) => needs[n] >= param('need.weightMin')).sort((a, b) => needs[b] - needs[a] || STAFF_NEEDS.indexOf(a) - STAFF_NEEDS.indexOf(b));
  const n = Math.round((clamp(familiarity, 0, 100) / 100) * ranked.length);
  return ranked.slice(0, Math.max(1, n));
}

/** One remark a reference has about the candidate: positive or negative, with its rows. */
export interface Remark { readonly sign: 1 | -1; readonly textKey: string; readonly evidenceEventIds: readonly number[] }

/**
 * A reference call (L4.2.2). Honest in proportion to his trust in the user; a referee tied above 70 to the
 * candidate omits negatives. `stream` decides which remarks an imperfectly honest referee passes on.
 */
export function referenceCall(remarks: readonly Remark[], trustInUser: number, tieToCandidate: number, stream: RandomStream): readonly Remark[] {
  const omitNegatives = tieToCandidate > param('reference.omitNegativesTieAbove');
  const honesty = clamp(trustInUser, 0, 100) / 100;
  return remarks.filter((r) => {
    if (r.sign === 1) return true;
    if (omitNegatives) return false;
    return stream.chance(honesty);
  });
}

/** Promises commonly asked in interviews (L4.2.2); each is machine-testable and goes to the L1.3.1 ledger. */
export const STAFF_PROMISES = ['calls_plays', 'hires_own_position_coach', 'title', 'head_coach_interviews_not_discouraged'] as const;
export type StaffPromise = (typeof STAFF_PROMISES)[number];

export const promiseSubject = (p: StaffPromise): string => `staff.promise.${p}`;

// ---------- scheme compatibility (L4.2.4) ----------

export interface CompatibilityPanel {
  readonly sameFamily: boolean;
  readonly carryOverTerms: readonly string[];
  readonly options: readonly ({ readonly kind: 'learn_house'; readonly coachSlowWeeks: number } | { readonly kind: 'convert_side'; readonly renamedConcepts: number; readonly headCoachSlowWeeks: number })[];
}

/**
 * The panel before an offer. Weeks and knowledge loss come from G4 and G5 through the callbacks, so the
 * panel shows exactly what they then apply (L4.2.4 acceptance). `headCoachCallsSide`: the edge case where
 * converting also makes the head coach relearn.
 */
export function compatibility(file: CandidateFile, houseFamily: string, installedTerms: readonly string[], relearnWeeks: (unknown: number, total: number) => number, headCoachCallsSide: boolean): CompatibilityPanel {
  const known = new Set(file.knownTerms);
  const carry = installedTerms.filter((t) => known.has(t));
  const unknown = installedTerms.length - carry.length;
  if (file.schemeFamily === houseFamily && unknown === 0) return { sameFamily: true, carryOverTerms: carry, options: [{ kind: 'learn_house', coachSlowWeeks: 0 }] };
  return {
    sameFamily: file.schemeFamily === houseFamily,
    carryOverTerms: carry,
    options: [
      { kind: 'learn_house', coachSlowWeeks: relearnWeeks(unknown, installedTerms.length) },
      { kind: 'convert_side', renamedConcepts: unknown, headCoachSlowWeeks: headCoachCallsSide ? relearnWeeks(unknown, installedTerms.length) : 0 },
    ],
  };
}

// ---------- offers and acceptance (L4.2.3, K7.6.1 rule 3) ----------

export interface Offer {
  readonly seatId: number;
  readonly rung: number | null;
  readonly titleKey: string;
  readonly years: number;
  readonly salaryCents: number;
  readonly callsPlays: boolean;
  readonly promises: readonly StaffPromise[];
}

export interface CandidateView {
  readonly currentRung: number | null;
  readonly askCents: number;
  readonly needs: NeedWeights;
  /** His trust in the hiring head coach (relationship record; memories of broken promises lower it). */
  readonly trustInHeadCoach: number;
  /** The hiring team's prospects as he sees them, -1 to 1. */
  readonly prospects: number;
}

/** Chance he accepts: job (rung, pay, play calling, length), team prospects and trust. Bounded 0 to 1. */
export function acceptChance(o: Offer, v: CandidateView): number {
  const rungGain = o.rung === null || v.currentRung === null ? 0 : o.rung - v.currentRung;
  const pay = v.askCents > 0 ? clamp(o.salaryCents / v.askCents - 1, -1, 1) : 0;
  const calls = o.callsPlays ? param('accept.callingWeight') * (0.5 + v.needs.advancement) : 0;
  const promises = o.promises.length * param('accept.callingWeight') * 0.25;
  const security = (o.years - 1) * param('accept.securityPerYear') * (0.5 + v.needs.security);
  const p = param('accept.base') + param('accept.perRung') * rungGain + param('accept.payWeight') * pay + calls + promises + security
    + param('accept.prospectsWeight') * clamp(v.prospects, -1, 1) + param('accept.trustWeight') * (clamp(v.trustInHeadCoach, 0, 100) - 50) / 50;
  return possible(clamp(p, 0, 1));
}

export function decideOffer(o: Offer, v: CandidateView, stream: RandomStream): boolean {
  return stream.chance(acceptChance(o, v));
}

// ---------- candidate score (K7.6.1 rules 1, 2, 4) ----------

/**
 * What a hiring coach knows about a candidate. Only views: his labels and first-hand memory boiled into
 * `viewOfQuality` (X2.3.1), never hidden parameters. There is no person id here, so the user and an AI
 * candidate with identical records and views get identical scores (K7.6.1 acceptance).
 */
export interface CandidateScoreInput {
  readonly sameFamily: boolean;
  /** Share of the hiring side's terms he knows, 0 to 1. */
  readonly termOverlap: number;
  readonly viewOfQuality: number;
  /** Tie between hiring coach and candidate, 0 to 100. */
  readonly tie: number;
  readonly askCents: number;
  readonly budgetLeftCents: number;
}

export function candidateScore(c: CandidateScoreInput): number {
  const fit = (c.sameFamily ? 0.5 : 0) + 0.5 * clamp(c.termOverlap, 0, 1);
  const cost = c.budgetLeftCents <= 0 ? 0 : clamp(1 - c.askCents / c.budgetLeftCents, 0, 1);
  const known = c.tie > 0 ? param('score.familiarityBonus') : 0;
  return param('score.fitWeight') * fit + param('score.qualityWeight') * clamp(c.viewOfQuality, 0, 1)
    + param('score.tieWeight') * clamp(c.tie, 0, 100) / 100 + param('score.costWeight') * cost + known;
}

/** Rank candidates by score, ties broken by person id for determinism. Unaffordable asks drop out. */
export function rankCandidates(cands: readonly { readonly personId: number; readonly input: CandidateScoreInput }[]): readonly number[] {
  return cands.filter((c) => c.input.askCents <= c.input.budgetLeftCents)
    .map((c) => ({ id: c.personId, s: candidateScore(c.input) }))
    .sort((a, b) => b.s - a.s || a.id - b.id).map((c) => c.id);
}

export interface SearchResult { readonly hiredPersonId: number | null; readonly offered: readonly number[]; readonly declined: readonly number[] }

/**
 * One AI search for one vacancy (K7.6.1): offer down the ranked list until someone accepts. No hire means
 * the caller fills by internal promotion or from who is left (positions.fillVacancy).
 */
export function runSearch(ranked: readonly number[], offerFor: (personId: number) => { offer: Offer; view: CandidateView } | null, stream: RandomStream): SearchResult {
  const offered: number[] = []; const declined: number[] = [];
  for (const id of ranked) {
    const o = offerFor(id);
    if (!o) continue;
    offered.push(id);
    if (decideOffer(o.offer, o.view, stream)) return { hiredPersonId: id, offered, declined };
    declined.push(id);
  }
  return { hiredPersonId: null, offered, declined };
}

/** K7.6.1 rule 5: an AI head coach fires when the unit was below his standard for the starting 2 seasons, or under owner pressure. */
export function aiFiresAssistant(seasonsBelowStandard: number, ownerPressure: boolean): boolean {
  return ownerPressure || seasonsBelowStandard >= param('fire.seasonsBelowStandard');
}

// ---------- diverse-candidate interview requirement (E2.3.1) ----------

export type SearchRole = 'head_coach' | 'coordinator' | 'quarterback_coach' | 'other';

export function searchRole(positionId: string, roleGroup: string): SearchRole {
  if (positionId === 'pos:head_coach') return 'head_coach';
  if (positionId === 'pos:position_coach.qb') return 'quarterback_coach';
  if (roleGroup === 'coordinators') return 'coordinator';
  return 'other';
}

export interface InterviewHeld { readonly personId: number; readonly external: boolean; readonly inPerson: boolean; readonly date: WorldDate }

export interface DiverseCheck { readonly required: number; readonly counted: number; readonly met: boolean; readonly ruleText: string }

/**
 * Counts qualifying interviews for a search. `qualifies` is the league definition applied by the people
 * module (people of colour or women, with `women_count_toward_requirement`); the engine never reads the
 * outcome. A search that closes unmet is a violation through L8.2.5 (`diverseInterviewAct`), never blocked.
 */
export function diverseCheck(role: SearchRole, held: readonly InterviewHeld[], qualifies: (personId: number) => boolean, r: HiringRules): DiverseCheck {
  const ids = new Set<number>();
  let required = 0;
  let ruleText = 'staff.diverse.none';
  if (role === 'head_coach' && r.hcExternal !== null) {
    required = r.hcExternal; ruleText = 'staff.diverse.head_coach';
    for (const h of held) if (h.external && qualifies(h.personId) && (!r.hcInPerson || h.inPerson)) ids.add(h.personId);
  } else if (role === 'coordinator' && r.coordExternal !== null) {
    required = r.coordExternal; ruleText = 'staff.diverse.coordinator';
    for (const h of held) if (h.external && qualifies(h.personId)) ids.add(h.personId);
  } else if (role === 'quarterback_coach' && r.qbCandidates !== null) {
    required = r.qbCandidates; ruleText = 'staff.diverse.quarterback_coach';
    for (const h of held) if (qualifies(h.personId)) ids.add(h.personId);
  }
  return { required, counted: ids.size, met: ids.size >= required, ruleText };
}
