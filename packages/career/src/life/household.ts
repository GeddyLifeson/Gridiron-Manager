// E8.3.1 the household object and E8.3.2 time at home and household satisfaction. Members have facts
// and wishes, never personality scores or a hidden compatibility value. Satisfaction is the
// household's opinion (0 to 100), moved by hours at home, life events, moves and money only.
import { param } from './params.ts';
import { assertGenerated, type LifeRealism, type LifeSubject } from './realism.ts';

export type MemberRole = 'partner' | 'child' | 'parent';
export type Occupation = 'none' | 'job' | 'placeTied';

export interface Member {
  readonly id: number;
  readonly role: MemberRole;
  readonly birthYear: number;
  /** For a partner: none, a job with income, or a career tied to a place (E8.3.1 rule 4). */
  readonly occupation: Occupation;
  /** Region the member is attached to, or null. */
  readonly tieRegion: string | null;
}

/** A level offset that holds for a while: a tier drop (-5 for a year), housing stability (+0 to +3). */
export interface Offset { readonly kind: string; readonly amount: number; readonly untilWeek: number }

export interface Household {
  readonly personId: number;
  readonly members: readonly Member[];
  readonly satisfaction: number;
  readonly offsets: readonly Offset[];
  /** Consecutive weeks below the conversation line, and below the separation line since the last talk. */
  readonly weeksBelowConversation: number;
  readonly weeksBelowSeparation: number;
  readonly conversations: number;
  readonly separated: boolean;
  /** Years of every move that took the whole household (E8.4.1 rule 1). */
  readonly moveYears: readonly number[];
  /** Calendar year the break was last spent away together (rule 5: once a year). */
  readonly breakTogetherYear: number | null;
}

/** Created at coach creation (E1). An empty household is allowed and skips every member rule. */
export function newHousehold(s: LifeSubject, members: readonly Member[]): Household {
  assertGenerated(s, 'household');
  return {
    personId: s.personId, members, satisfaction: param('satisfactionStart'), offsets: [],
    weeksBelowConversation: 0, weeksBelowSeparation: 0, conversations: 0, separated: false, moveYears: [], breakTogetherYear: null,
  };
}

export const isEmpty = (h: Household): boolean => h.members.length === 0;

export function ageOf(m: Member, year: number): number { return year - m.birthYear; }

export type SchoolStage = 'notYet' | 'primary' | 'secondary' | 'grown';

/** E8.3.1 rule 3 school stages (starting ages). Children age with the calendar. */
export function schoolStage(age: number): SchoolStage {
  if (age >= param('school.grown')) return 'grown';
  if (age >= param('school.secondary')) return 'secondary';
  if (age >= param('school.primary')) return 'primary';
  return 'notYet';
}

/** A strong tie to staying put: a place-tied career, or a child in the last two years of secondary. */
export function strongTie(m: Member, year: number): boolean {
  if (m.role === 'partner') return m.occupation === 'placeTied';
  if (m.role !== 'child') return false;
  const a = ageOf(m, year);
  return a < param('school.grown') && a >= param('school.grown') - param('school.finalYears');
}

export const hasPartner = (h: Household): boolean => !h.separated && h.members.some((m) => m.role === 'partner');

const clamp = (x: number): number => Math.max(0, Math.min(100, x));

export function homeTarget(inSeason: boolean): number {
  return inSeason ? param('homeTarget.inSeason') : param('homeTarget.offSeason');
}

export interface HomeWeek {
  readonly week: number;
  readonly homeHours: number;
  readonly inSeason: boolean;
  /** Living apart this week (E8.4.1): the target ratio is capped at 0.5 (rule 3). */
  readonly livingApart: boolean;
}

export interface HouseholdNotice {
  readonly kind: 'conversation' | 'separation';
  readonly week: number;
  /** For a conversation: the specific ask in hours (E8.3.2 rule 6). */
  readonly askHomeHours: number | null;
}

/** One week of E8.3.2 rule 1 plus the rule 6 chain. Returns the new household and any notice. */
export function weekSatisfaction(h: Household, w: HomeWeek, realism: LifeRealism): { household: Household; notice: HouseholdNotice | null } {
  if (isEmpty(h) || h.separated) return { household: h, notice: null };
  const target = homeTarget(w.inSeason);
  let ratio = Math.min(param('homeRatioCap'), target > 0 ? w.homeHours / target : param('homeRatioCap'));
  if (w.livingApart) ratio = Math.min(ratio, param('apartRatioCap'));
  const offsets = h.offsets.filter((o) => o.untilWeek > w.week);
  const level = clamp((100 * ratio) / param('homeRatioCap') + offsets.reduce((s, o) => s + o.amount, 0));
  const scale = w.inSeason ? param('inSeasonDriftScale') : 1;
  const satisfaction = clamp(h.satisfaction + param('homeDriftRate') * (level - h.satisfaction) * scale);
  let { weeksBelowConversation, weeksBelowSeparation, conversations } = h;
  let separated: boolean = h.separated;
  weeksBelowConversation = satisfaction < param('conversationBelow') ? weeksBelowConversation + 1 : 0;
  weeksBelowSeparation = conversations > 0 && satisfaction < param('separationBelow') ? weeksBelowSeparation + 1 : 0;
  let notice: HouseholdNotice | null = null;
  const year = param('strainWindowWeeks');
  if (realism.separation && conversations >= param('separationWarnings') && weeksBelowSeparation >= year) {
    separated = true;
    notice = { kind: 'separation', week: w.week, askHomeHours: null };
  } else if (weeksBelowConversation >= year) {
    conversations += 1;
    weeksBelowConversation = 0;
    weeksBelowSeparation = 0;
    notice = { kind: 'conversation', week: w.week, askHomeHours: homeTarget(w.inSeason) };
  }
  return { household: { ...h, satisfaction, offsets, weeksBelowConversation, weeksBelowSeparation, conversations, separated }, notice };
}

/** A one-time change (life events, moves, the break). */
export function bump(h: Household, amount: number): Household {
  if (isEmpty(h) || h.separated) return h;
  return { ...h, satisfaction: clamp(h.satisfaction + amount) };
}

/** E8.3.2 rule 4: dropping two lifestyle tiers at once lowers satisfaction by 5 for a year (E6.3.1). */
export function tierDrop(h: Household, tiersDropped: number, week: number): Household {
  if (tiersDropped < 2 || isEmpty(h)) return h;
  return { ...h, offsets: [...h.offsets, { kind: 'tierDrop', amount: -param('tierDropPenalty'), untilWeek: week + param('tierDropWeeks') }] };
}

/** E8.3.2 rule 4: housing stability from E6.4.1 adds up to +3 (stability 0 to 1). Wealth adds nothing. */
export function setHousingStability(h: Household, stability: number, week: number): Household {
  const rest = h.offsets.filter((o) => o.kind !== 'housing');
  const amount = Math.max(0, Math.min(1, stability)) * param('housingStabilityMax');
  return { ...h, offsets: [...rest, { kind: 'housing', amount, untilWeek: week + param('strainWindowWeeks') }] };
}

/** E8.3.2 rule 5: the break spent away together, +5 once a year. */
export function breakTogether(h: Household, year: number): Household {
  if (h.breakTogetherYear === year) return h;
  return { ...bump(h, param('breakTogetherBonus')), breakTogetherYear: year };
}

export type SatisfactionWord = 'strained' | 'distant' | 'steady' | 'good' | 'close';

/** Five words on the household page (E8.3.2). Equal fifths: an assumption, the leaf gives no cuts. */
export function satisfactionWord(s: number): SatisfactionWord {
  if (s < 20) return 'strained';
  if (s < 40) return 'distant';
  if (s < 60) return 'steady';
  if (s < 80) return 'good';
  return 'close';
}

/** Reason line for weekly home hours, e.g. "You were home 6 hours a week in October." */
export function homeHoursLine(meanHomeHours: number, period: string): string {
  return `You were home ${Math.round(meanHomeHours)} hours a week in ${period}.`;
}
