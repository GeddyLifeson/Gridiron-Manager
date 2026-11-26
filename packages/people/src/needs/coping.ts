// Coping for strained generated people (X5.2.4 rules 3 to 7). Each habit relieves a little stress and
// carries its own cost or risk. Nothing here applies to the user's coach (rule 7); protected people and
// minors never take the habits that would invent personal conduct about them (rule 6).
import { np, type Draw } from './params.ts';

export const COPING_HABITS = ['extra_work', 'confiding', 'withdrawal', 'faith_practice', 'going_out_late', 'venting_public'] as const;
export type CopingHabit = (typeof COPING_HABITS)[number];

/** Habits a protected (imported) person may never take, and which no `coping_started` event may name (rule 6). */
export const PROTECTED_EXCLUDED_HABITS: readonly CopingHabit[] = ['going_out_late', 'venting_public', 'faith_practice'];
/** Habits a minor may never take (rule 6, L9.1.2 rule 3). */
export const MINOR_EXCLUDED_HABITS: readonly CopingHabit[] = ['going_out_late', 'venting_public'];

export interface CopingSubject {
  readonly isUser: boolean;
  readonly isProtected: boolean;
  readonly age: number;
  readonly facets: Readonly<Record<string, number>>;
  /** Has a warm X7 edge to confide in. */
  readonly hasWarmEdge: boolean;
}

export interface CopingRecord { readonly copingId: CopingHabit; readonly sinceWeek: number }

/** Side effects of a habit for its owners to apply (D10 load, D5.4.1 and L3 incident weight, L6 media, X7 edges). */
export interface CopingEffects {
  readonly reliefPerWeek: number;
  readonly fatigueLoad: boolean;
  readonly incidentWeightFactor: number;
  readonly mediaItem: boolean;
  readonly edgeChange: 'strengthen_confidant' | 'cool' | 'none';
}

const facet = (s: CopingSubject, k: string) => s.facets[k] ?? 50;

/**
 * Starting draw weights (rule 3, Assumption): each habit is weighted up by the facet the leaf names, as a
 * share of the scale. A habit a person cannot take has weight 0.
 */
export function habitWeights(s: CopingSubject): Record<CopingHabit, number> {
  const minor = s.age < np('needs.coping.minorAge');
  const w: Record<CopingHabit, number> = {
    extra_work: facet(s, 'work_habits') / 100,
    confiding: s.hasWarmEdge ? facet(s, 'sociability') / 100 : 0,
    withdrawal: (100 - facet(s, 'sociability')) / 100,
    faith_practice: s.facets.faith !== undefined && s.facets.faith >= np('needs.coping.faithMin') ? s.facets.faith / 100 : 0,
    going_out_late: (100 - facet(s, 'discipline')) / 100,
    venting_public: (100 - facet(s, 'composure')) / 100,
  };
  for (const h of COPING_HABITS) {
    if ((s.isProtected && PROTECTED_EXCLUDED_HABITS.includes(h)) || (minor && MINOR_EXCLUDED_HABITS.includes(h))) w[h] = 0;
  }
  return w;
}

export function pickHabit(s: CopingSubject, draw: Draw): CopingHabit | null {
  const w = habitWeights(s);
  const total = COPING_HABITS.reduce((t, h) => t + w[h], 0);
  if (total <= 0) return null;
  let r = draw() * total;
  for (const h of COPING_HABITS) { r -= w[h]; if (r < 0 && w[h] > 0) return h; }
  return [...COPING_HABITS].reverse().find((h) => w[h] > 0) ?? null;
}

/** Rule 4 relief and risks per habit. Sizes are bible starting values except faith practice (L4.6.1 owns it). */
export function copingEffects(h: CopingHabit): CopingEffects {
  switch (h) {
    case 'confiding': return { reliefPerWeek: np('needs.coping.relief.confiding'), fatigueLoad: false, incidentWeightFactor: 1, mediaItem: false, edgeChange: 'strengthen_confidant' };
    case 'extra_work': return { reliefPerWeek: np('needs.coping.relief.extraWork'), fatigueLoad: true, incidentWeightFactor: 1, mediaItem: false, edgeChange: 'none' };
    case 'withdrawal': return { reliefPerWeek: np('needs.coping.relief.withdrawal'), fatigueLoad: false, incidentWeightFactor: 1, mediaItem: false, edgeChange: 'cool' };
    case 'going_out_late': return { reliefPerWeek: np('needs.coping.relief.goingOutLate'), fatigueLoad: false, incidentWeightFactor: np('needs.coping.incidentFactor'), mediaItem: false, edgeChange: 'none' };
    case 'venting_public': return { reliefPerWeek: np('needs.coping.relief.ventingPublic'), fatigueLoad: false, incidentWeightFactor: 1, mediaItem: true, edgeChange: 'none' };
    case 'faith_practice': return { reliefPerWeek: np('needs.coping.relief.faithPractice'), fatigueLoad: false, incidentWeightFactor: 1, mediaItem: false, edgeChange: 'none' };
  }
}

export type CopingChange =
  | { readonly kind: 'none' }
  | { readonly kind: 'started'; readonly record: CopingRecord }
  | { readonly kind: 'stopped'; readonly previous: CopingHabit }
  | { readonly kind: 'replaced'; readonly previous: CopingHabit; readonly record: CopingRecord };

/**
 * One weekly coping step (rules 3 and 5). `strainedWeeks` and `settledWeeks` come from the stress memo.
 * `addressed` is true when the user or a staff member addressed the habit in a meeting this week (L1, L3).
 */
export function stepCoping(current: CopingRecord | null, s: CopingSubject, memo: { week: number; strainedWeeks: number; settledWeeks: number }, addressed: boolean, draw: Draw): CopingChange {
  if (s.isUser) return { kind: 'none' };
  if (current) {
    if (memo.settledWeeks >= np('needs.coping.stopSettledWeeks')) return { kind: 'stopped', previous: current.copingId };
    if (addressed && current.copingId !== 'confiding') {
      if (draw() < np('needs.coping.addressedToConfideChance') && s.hasWarmEdge) {
        return { kind: 'replaced', previous: current.copingId, record: { copingId: 'confiding', sinceWeek: memo.week } };
      }
    }
    return { kind: 'none' };
  }
  if (memo.strainedWeeks < np('needs.coping.startWeeks')) return { kind: 'none' };
  const h = pickHabit(s, draw);
  return h ? { kind: 'started', record: { copingId: h, sinceWeek: memo.week } } : { kind: 'none' };
}
