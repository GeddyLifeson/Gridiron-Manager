// T4.3.1 judging a prospect. Each look narrows the band on the attribute families it covers: film on
// production and instincts, a live look on athletic traits, a camp measures height, weight and speed, a
// high school coach's word hints at character with bias. Each further look of a kind narrows half as much.
// Grades live on the internal skill scale (D6.1). The truth-reading draw is `observeGrade`, world side only;
// the full estimate update of the scouting package (G-19) is wired by the world loop through `GradeSink`.
import type { RecruitingContext } from './context.ts';
import { clamp, powInt } from './context.ts';
import { P } from './params.ts';
import { boardOf } from './interest.ts';
import type { BandFamily, BoardGrade, LookKind, RecruitingState } from './types.ts';

const FAMILIES: readonly BandFamily[] = ['production', 'athletic', 'measurables', 'character'];

/** Which families a look narrows and by how much the first time (T4.3.1 starting band effects). */
export function lookEffect(kind: LookKind): Partial<Record<BandFamily, number>> {
  switch (kind) {
    case 'first_pass_film': return { production: P('look.firstPassNarrow') };
    case 'full_film': return { production: P('look.filmNarrow') };
    case 'live': return { athletic: P('look.liveNarrow') };
    case 'camp': return { measurables: 1, athletic: P('look.campAthleticNarrow') };
    case 'hs_coach_word': return { character: P('look.coachWordNarrow') };
  }
}

/** The starting grade a staff has before any look: the public rating's read, with the widest band (T4.3.1, D6.4.1). */
export function priorGrade(state: RecruitingState, prospectId: number): BoardGrade {
  const p = state.prospects[prospectId]!;
  const mean = P('grade.starsIntercept') + P('grade.perStar') * p.publicStars;
  const band = {} as Record<BandFamily, number>;
  for (const f of FAMILIES) band[f] = P('grade.priorHalfWidth');
  return { mean, band, looks: {}, setBy: 'public', measured: null, userGrade: null };
}

export function gradeOf(state: RecruitingState, teamId: number, prospectId: number): BoardGrade {
  const b = boardOf(state, teamId);
  let g = b.grades[prospectId];
  if (!g) { g = priorGrade(state, prospectId); b.grades[prospectId] = g; }
  return g;
}

/** Optional port to the scouting package (G-19): the world loop updates the person view with the same look. */
export type GradeSink = (teamId: number, prospectId: number, look: LookKind, day: number) => void;

/**
 * Take one look (T4.3.1). Narrows the band on the families the look covers by its share of the current
 * width, halved for each earlier look of the same kind. The grade mean moves toward a noisy observation of
 * true quality (world side: `skill` is the evaluator's 0 to 1 accuracy, the K2 evaluation parameter for AI).
 * Film is discounted by the level of competition: a weak schedule moves the grade less (T4.7.1).
 */
export function takeLook(
  state: RecruitingState, ctx: RecruitingContext, teamId: number, prospectId: number, kind: LookKind, day: number,
  opts: { skill: number; competition: number; byPositionCoach: boolean; sink?: GradeSink },
): BoardGrade {
  const p = state.prospects[prospectId]!;
  const g = gradeOf(state, teamId, prospectId);
  const n = g.looks[kind] ?? 0;
  const factor = powInt(P('half'), n);
  const eff = lookEffect(kind);
  for (const f of FAMILIES) {
    const share = eff[f];
    if (share === undefined) continue;
    g.band[f] = f === 'measurables' && kind === 'camp' ? P('look.measuredHalfWidth') : g.band[f] * (1 - share * factor);
  }
  g.looks[kind] = n + 1;
  if (kind === 'camp') {
    const r = ctx.rng(['camp', teamId, prospectId, day]);
    g.measured = { heightIn: p.heightIn, weightLb: p.weightLb, fortyS: p.fortyS + P('look.campTimingError') * (r.uniform() + r.uniform() - 1) };
  }
  // Observation: noise shrinks with evaluator skill; film against weak opposition counts less.
  const r = ctx.rng(['look', teamId, prospectId, kind, n, day]);
  const sd = P('look.observationSd') * (1 - P('look.skillCut') * clamp(opts.skill, 0, 1));
  const observed = p.trueQuality + sd * r.normal();
  const weight = P('look.meanWeight') * factor * (kind === 'full_film' || kind === 'first_pass_film' ? clamp(opts.competition, P('look.minCompetition'), 1) : 1);
  g.mean = clamp(g.mean + weight * (observed - g.mean), 0, P('grade.max'));
  if (opts.byPositionCoach) g.setBy = 'position_coach';
  else if (g.setBy === 'public') g.setBy = 'first_pass';
  opts.sink?.(teamId, prospectId, kind, day);
  // Board line (T4.3.1): a first-pass grade at or above the line enters the position coach's queue.
  const board = boardOf(state, teamId);
  if (g.setBy === 'first_pass' && g.mean >= board.boardLine && !board.queue.includes(prospectId)) board.queue.push(prospectId);
  return g;
}

/** Move a prospect into the position coach's queue by hand, whatever his grade (T4.3.1 acceptance). */
export function queueByHand(state: RecruitingState, teamId: number, prospectId: number): void {
  const board = boardOf(state, teamId);
  if (!board.queue.includes(prospectId)) board.queue.push(prospectId);
}

/** The user's own grade, stored and truth-graded at age 21 (S11.1.1). */
export function setUserGrade(state: RecruitingState, teamId: number, prospectId: number, grade: number): void {
  gradeOf(state, teamId, prospectId).userGrade = clamp(grade, 0, P('grade.max'));
}

/** Board order: grade mean, best first (the head coach or general manager orders it, T4.3.1). */
export function boardOrder(state: RecruitingState, teamId: number, filter: (prospectId: number) => boolean = () => true): number[] {
  const b = boardOf(state, teamId);
  return Object.keys(b.grades).map(Number).filter(filter).sort((x, y) => b.grades[y]!.mean - b.grades[x]!.mean || x - y);
}
