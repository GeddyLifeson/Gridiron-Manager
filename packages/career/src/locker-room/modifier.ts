// The team discipline modifier (L3.4.1, L2.4.3): the ONLY channel from culture and standards to the game.
// It scales four foul hazards and nothing else: pre-snap fouls by the offense, pre-snap fouls by the
// defense, defensive coverage fouls, post-play and unsportsmanlike fouls. No fumble hazard, no blocking,
// coverage, catching or tackling contest reads it (audit Part 11.1; research/audit-r-discipline-followups.md
// finds team fumble rates near pure luck within a season, and the head coach's share of pre-snap fouls not
// distinguishable from zero). Individual players and the venue term (J) carry most of the team spread; this
// is a small coach-controlled layer on top, at most half the measured team range.
import type { DisciplineRules } from './keys.ts';
import { clamp, lp } from './params.ts';

/** The four hazards the modifier may scale. A test checks no other consumer exists. */
export const DISCIPLINE_HAZARDS = ['off_presnap', 'def_presnap', 'def_coverage', 'post_play'] as const;
export type DisciplineHazard = (typeof DISCIPLINE_HAZARDS)[number];

export type TeamDiscipline = Readonly<Record<DisciplineHazard, number>>;

export interface ModifierInput {
  /** L2.4.1 culture strength, 0 to 100. */
  readonly culture: number;
  /** L3.3.1 consistency, 0 to 100. */
  readonly consistency: number;
  /** L3.1.1 strictness, 0 to 100. */
  readonly strictness: number;
  /** L2.5.2 flag: every multiplier at its worst bound. */
  readonly roomLost: boolean;
}

const PARAM_KEY: Record<DisciplineHazard, string> = {
  off_presnap: 'offPresnap', def_presnap: 'defPresnap', def_coverage: 'defCoverage', post_play: 'postPlay',
};

/**
 * Bounds of one hazard. Under the school code model the coach-controlled part is widened x1.25 around 1.0
 * (L2.6.1, L3.4.1; Assumption from one study). Branches on the rule-set's discipline model, never a level.
 */
export function bounds(h: DisciplineHazard, d: Pick<DisciplineRules, 'model'>): { readonly lo: number; readonly hi: number } {
  const lo = lp(`modifier.${PARAM_KEY[h]}.lo`);
  const hi = lp(`modifier.${PARAM_KEY[h]}.hi`);
  if (d.model !== 'school_code') return { lo, hi };
  const w = lp('college.boundWiden');
  return { lo: 1 - (1 - lo) * w, hi: 1 + (hi - 1) * w };
}

/**
 * score = 0.5 culture + 0.3 consistency + 0.2 strictness_effect, strictness_effect = strictness * consistency/100
 * (strict rules unevenly applied give nothing). Each multiplier = hi - (hi - lo) * score/100. room_lost sets
 * every multiplier to its upper (worst) bound.
 */
export function disciplineScore(i: ModifierInput): number {
  const max = lp('scale.max');
  const c = clamp(i.consistency, 0, max);
  const strictEffect = clamp(i.strictness, 0, max) * c / max;
  return clamp(lp('modifier.w.culture') * clamp(i.culture, 0, max) + lp('modifier.w.consistency') * c + lp('modifier.w.strictness') * strictEffect, 0, max);
}

export function teamDiscipline(i: ModifierInput, d: Pick<DisciplineRules, 'model'>): TeamDiscipline {
  const max = lp('scale.max');
  const score = disciplineScore(i);
  const out = {} as Record<DisciplineHazard, number>;
  for (const h of DISCIPLINE_HAZARDS) {
    const { lo, hi } = bounds(h, d);
    out[h] = i.roomLost ? hi : clamp(hi - (hi - lo) * score / max, lo, hi);
  }
  return out;
}

/** The neutral modifier (every hazard 1.0): what a config that removes the coach part, or a calibration run, uses. */
export const NEUTRAL_DISCIPLINE: TeamDiscipline = { off_presnap: 1, def_presnap: 1, def_coverage: 1, post_play: 1 };
