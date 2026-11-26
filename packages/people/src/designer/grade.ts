// The side panel's staff grade (D13.1.1: "the D6 grade the staff would give"). The designer has the true
// values, so it runs the scouting module's own look (G-19 observe, update, roleGrade) for one standard
// look by an average position coach, and returns an estimate. The screen formats it as an assigned grade
// with grader, date and amount watched (MA-48); no true value is shown as a grade.
import type { AttributeId, WorldDate } from '@gm/schema';
import { GROUPS, PHYSICAL, POSITION_RELEVANCE, profileOf } from '../generator/catalogue.ts';
import { makePrior, updateAll, type EvidenceItem } from '../scouting/estimate.ts';
import { observe, NO_LEAN, type NormalSource } from '../scouting/observe.ts';
import { roleGrade } from '../scouting/role.ts';
import { param } from './params.ts';

/** Attributes the role grade weighs for a position: its primary groups and the physical four, equally. */
export function primaryAttributes(position: string): AttributeId[] {
  const rel = POSITION_RELEVANCE[profileOf(position)];
  const out: AttributeId[] = [...PHYSICAL];
  for (const [g, list] of Object.entries(GROUPS)) if (rel[g] === 'p') out.push(...list);
  return out;
}

export interface StaffGrade {
  mean: number;
  variance: number;
  /** Snaps of film the look stands for, shown as "graded on N snaps". */
  snaps: number;
  on: WorldDate;
}

const GRADER = { id: 0, line: 'designer.staff' } as const;

/** One standard look at the player's true values (D6.4.2), folded into the D6.2.2 role grade. */
export function staffGrade(position: string, attributes: Readonly<Partial<Record<AttributeId, number>>>, on: WorldDate, age: number, rng: NormalSource): StaffGrade | null {
  const attrs = primaryAttributes(position);
  if (attrs.some((a) => attributes[a] === undefined)) return null;
  const snaps = param('gradeLookSnaps');
  const skill = param('gradeStaffSkill');
  const est: Record<string, { mean: number; variance: number }> = {};
  for (const a of attrs) {
    const prior = makePrior(param('gradePriorMean'), param('gradePriorSd'), on);
    const item: EvidenceItem = observe(attributes[a]!, {
      attribute: a, source: 'game_film', units: snaps, date: on, evaluator: GRADER, skill, estimateMean: prior.mean, opponent: null,
    }, NO_LEAN, rng);
    est[a] = updateAll(prior, [item], age, () => skill);
  }
  const w = 1 / attrs.length;
  const g = roleGrade(est, Object.fromEntries(attrs.map((a) => [a, w])));
  return { mean: g.mean, variance: g.variance, snaps, on };
}
