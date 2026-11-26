// Practice test fixtures. Rule values come from the G-10 league files and the week's key rows through
// the week fixtures; nothing here restates a real-world number.
import { collegeLeague, proLeague, checker, rs, rng, SUN } from '../week/fixtures.ts';
import { weekLookup } from '../../src/week/index.ts';
import {
  NO_ENVIRONMENT, newPeriod, practiceLookup, DEFAULT_SPLIT,
  type AssignContext, type DepthChart, type Period, type Practice, type Script, type Side, type UnitShape, type ScoutCard, type PeriodLeader,
} from '../../src/practice/index.ts';

export { checker, rs, rng, SUN };
export const proRules = practiceLookup(weekLookup(proLeague, 'pro'), 'pro');
export const collegeRules = practiceLookup(weekLookup(collegeLeague, 'college'), 'college');

export const SHAPES: Record<Side, UnitShape> = {
  offense: ['QB', 'RB', 'WR', 'WR', 'TE', 'LT', 'LG', 'C', 'RG', 'RT', 'WR'],
  defense: ['DE', 'DT', 'DT', 'DE', 'LB', 'LB', 'LB', 'CB', 'CB', 'S', 'S'],
  special_teams: ['K', 'H', 'LS'],
};

/** Three deep at every slot: ids are position + depth index, e.g. QB0, QB1, QB2; WR0..WR8. */
export function depthChart(): DepthChart {
  const d: Record<string, string[]> = {};
  for (const shape of Object.values(SHAPES)) for (const pos of new Set(shape)) {
    const per = shape.filter((p) => p === pos).length;
    d[pos] = Array.from({ length: per * 3 }, (_, i) => `${pos}${i}`);
  }
  return d;
}

export function ctx(over: Partial<AssignContext> = {}): AssignContext {
  return { depth: depthChart(), shapes: SHAPES, split: DEFAULT_SPLIT, participation: new Map(), out: new Set(), ...over };
}

export const OC: PeriodLeader = { staffId: 'oc', role: 'coordinator', user: false };
export const PC: PeriodLeader = { staffId: 'olc', role: 'position_coach', user: false };

export const CARDS: ScoutCard[] = [
  { id: 'c-cover3', side: 'offense', look: { ref: 'cover3_sky', family: 'cover3' }, sourceTags: ['t1'], coachsOwn: false, count: 12 },
  { id: 'c-cover1', side: 'offense', look: { ref: 'cover1_robber', family: 'cover1' }, sourceTags: ['t2'], coachsOwn: false, count: 8 },
  { id: 'c-zone', side: 'defense', look: { ref: 'inside_zone', family: 'zone_run' }, sourceTags: ['t3'], coachsOwn: false, count: 20 },
];

export function script(id: string, side: Side, calls: string[], n: number, approved = true): Script {
  const units = ['first', 'first', 'second'] as const;
  return {
    id, side, approved, drafted: !approved,
    reps: Array.from({ length: n }, (_, k) => ({ index: k + 1, callId: calls[k % calls.length]!, cardId: side === 'offense' ? 'c-cover3' : 'c-zone', hash: 'middle' as const, down: 1, distance: 10, unit: units[k % units.length]! })),
  };
}

export function teamPeriod(number: number, over: Partial<Period> = {}): Period {
  return newPeriod(number, 'team_scout', OC, { minutes: 10, groups: ['offense'], scriptRef: 's-off', ...over });
}

export function practice(periods: Period[], over: Partial<Practice> = {}): Practice {
  return { id: 'p1', blockId: 'b1', blockMinutes: 120, day: SUN + 3, pads: 'shells', periods, environment: NO_ENVIRONMENT, headCoachPresent: false, ...over };
}
