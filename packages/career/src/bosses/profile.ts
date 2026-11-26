// L5.1.1 owner profile and needs, L5.2.4 general manager needs, L5.3.2 executives, T9.1.1 athletic director
// and president dispositions, L5.4.3 major donors. Weights are hidden truth (0 to 1), never shown as
// numbers; the user sees only what the person has done (the learned page, built from incidents).
import type { RandomStream } from '@gm/schema';

export const BOSS_KINDS = [
  'owner', 'general_manager', 'business_president', 'football_executive', 'athletic_director', 'university_president', 'donor',
] as const;
export type BossKind = (typeof BOSS_KINDS)[number];

/** Hidden weights. Each kind reads the ones its leaf names; the rest stay at their drawn values unused. */
export interface BossWeights {
  readonly patience: number;
  /** Involvement in football decisions (L5.1.1); football knowledge for an athletic director (T9.1.1). */
  readonly involvement: number;
  readonly spending: number;
  /** How public his behaviour is: a private owner gives fewer public signs (L5.1.5). */
  readonly publicBehaviour: number;
  /** Image interest, read by obligations (L5.3.1). */
  readonly imageInterest: number;
  /** Appetite for risk (T9.1.1). */
  readonly riskAppetite: number;
  /** Closeness to boosters (T9.1.1). */
  readonly boosterCloseness: number;
  /** General manager interest in the draft and his own young picks (L5.2.6). */
  readonly draftInterest: number;
  /** President and board (L5.4.2). */
  readonly academicStrictness: number;
  readonly footballPriority: number;
}

/** What an owner can care about (L5.1.1). */
export const OWNER_INTERESTS = ['wins_now', 'drafted_quarterback', 'attendance', 'image', 'favoured_player', 'fourth_downs', 'money'] as const;
export type OwnerInterest = (typeof OWNER_INTERESTS)[number];

/** Need types by kind (L5.1.1, L5.2.4, L5.3.2, T9.1.1, L5.4.3). */
export const NEEDS: Readonly<Record<BossKind, readonly string[]>> = {
  owner: ['results_vs_expectation', 'informed_before_press', 'his_people_respected', 'image_clean', 'money_not_wasted', 'access'],
  general_manager: ['picks_get_fair_chance', 'united_public_front', 'no_end_runs', 'shared_credit'],
  business_president: ['business_events_attended', 'image_clean', 'informed_before_press'],
  football_executive: ['results_vs_expectation', 'informed_before_press', 'no_end_runs'],
  athletic_director: ['results_vs_expectation', 'informed_before_press', 'image_clean', 'money_not_wasted', 'donors_kept_happy', 'compliance_clean'],
  university_president: ['school_name_clean', 'academics_respected', 'money_not_wasted'],
  donor: ['access', 'results_vs_expectation', 'a_say'],
};

export interface BossProfile {
  readonly personId: number;
  readonly kind: BossKind;
  readonly weights: BossWeights;
  /** Ordered strongest first; an owner holds one to three (L5.1.1). */
  readonly interests: readonly OwnerInterest[];
  readonly needs: readonly string[];
  /** A favoured player or staff member (`his_people_respected`), or null. */
  readonly favouredPersonId: number | null;
  /** An interim athletic director defers all large requests (T9.1.1 edge case). */
  readonly interim: boolean;
}

/** Draw a profile. Fixed draw order: ten weights, the interest count, then interests without repeats. */
export function generateProfile(personId: number, kind: BossKind, stream: RandomStream, favouredPersonId: number | null = null): BossProfile {
  const u = () => stream.uniform();
  const weights: BossWeights = {
    patience: u(), involvement: u(), spending: u(), publicBehaviour: u(), imageInterest: u(),
    riskAppetite: u(), boosterCloseness: u(), draftInterest: u(), academicStrictness: u(), footballPriority: u(),
  };
  const count = stream.int(1, 3);
  const pool: OwnerInterest[] = [...OWNER_INTERESTS];
  const interests: OwnerInterest[] = [];
  for (let i = 0; i < count; i++) interests.push(pool.splice(stream.int(0, pool.length - 1), 1)[0]!);
  return { personId, kind, weights, interests, needs: NEEDS[kind], favouredPersonId, interim: false };
}

// ---- The learned page (L5.1.1) ---------------------------------------------------------------------------

/** Things the boss has done that the coach can know of. Each label on the page links to these. */
export const INCIDENT_KINDS = [
  'fired_coach', 'public_remark', 'asked_about', 'spent_big', 'refused_spend', 'protected_star', 'interfered', 'backed_coach',
] as const;
export type IncidentKind = (typeof INCIDENT_KINDS)[number];

export interface Incident {
  readonly id: number;
  readonly kind: IncidentKind;
  readonly day: number;
  /** For `fired_coach`: the coach's tenure in seasons. For `asked_about`: the topic. */
  readonly detail: string | number;
}

export interface PageLabel { readonly text: string; readonly incidentIds: readonly number[] }

const DAYS_PER_SEASON = 365;

/**
 * Labels from incidents, each with the incidents behind it (L5.1.1 acceptance: no numeric trait, every label
 * links to incidents). These are candidates for the shared label engine (G-22), which owns final wording.
 */
export function learnedLabels(incidents: readonly Incident[], today: number): PageLabel[] {
  const out: PageLabel[] = [];
  const recentFirings = incidents.filter((i) => i.kind === 'fired_coach' && today - i.day <= 3 * DAYS_PER_SEASON);
  if (recentFirings.length >= 2) out.push({ text: `has fired ${recentFirings.length === 2 ? 'two' : recentFirings.length} coaches inside three seasons`, incidentIds: recentFirings.map((i) => i.id) });
  const quick = incidents.filter((i) => i.kind === 'fired_coach' && typeof i.detail === 'number' && i.detail <= 2);
  if (quick.length >= 1) out.push({ text: 'has fired a coach inside two seasons', incidentIds: quick.map((i) => i.id) });
  const stars = incidents.filter((i) => i.kind === 'protected_star');
  if (stars.length >= 2) out.push({ text: 'protects stars', incidentIds: stars.map((i) => i.id) });
  const topics = new Map<string, number[]>();
  for (const i of incidents) if (i.kind === 'asked_about') topics.set(String(i.detail), [...(topics.get(String(i.detail)) ?? []), i.id]);
  for (const [topic, ids] of [...topics].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) if (ids.length >= 2) out.push({ text: `asks about ${topic}`, incidentIds: ids });
  const spend = incidents.filter((i) => i.kind === 'spent_big');
  const refuse = incidents.filter((i) => i.kind === 'refused_spend');
  if (spend.length >= 2 && spend.length > refuse.length) out.push({ text: 'opens his wallet', incidentIds: spend.map((i) => i.id) });
  if (refuse.length >= 2 && refuse.length > spend.length) out.push({ text: 'watches every dollar', incidentIds: refuse.map((i) => i.id) });
  const meddles = incidents.filter((i) => i.kind === 'interfered' || i.kind === 'public_remark');
  if (meddles.length >= 3) out.push({ text: 'gets involved in football', incidentIds: meddles.map((i) => i.id) });
  return out;
}
