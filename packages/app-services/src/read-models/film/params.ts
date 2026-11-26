// Tuning constants of the film room (G-63, N1). No real-world number lives here as a fact: every value
// is a starting value a bible leaf states (basis `bible`), or a named assumption. The one value with a
// real source behind it (the offensive-line plus/minus tiers of N1.4.2) is 1 of 3 sources in the bible
// and is printed PROVISIONAL by `provisionalParams()` until two more sources are found.
import type { ParamFile, TuningParam } from '@gm/schema';

type Basis = TuningParam['basis'];
const row = (name: string, value: number, min: number, max: number, unit: string, basis: Basis, leaf: string, constrainedBy: string): TuningParam =>
  ({ name: `film.${name}`, value, min, max, unit, belongsTo: 'app-services.film', basis, leaf, constrainedBy, status: 'starting' });

export const PARAMS: ParamFile = {
  module: 'app-services.film',
  version: 'g63.1',
  params: [
    // N1.1.1 playback
    row('loadBudgetMs', 200, 10, 2000, 'ms', 'bible', 'N1.1.1', 'test film/library: load of one play record'),
    row('queryBudgetMs', 300, 10, 5000, 'ms', 'bible', 'N1.2.1', 'test film/library: filter over a season of plays'),
    // N1.2.1 charting
    row('chart.baseErrorRate', 0.01, 0, 0.2, 'ratio', 'bible', 'N1.2.1', 'test film/chart: base-set error rate on opponent film'),
    row('breakdown.defaultGames', 4, 1, 17, 'count', 'bible', 'N1.2.1', 'test film/library: default opponent breakdown window'),
    row('breakdown.extendedGames', 6, 1, 17, 'count', 'bible', 'N1.2.1', 'test film/library: extended opponent breakdown window'),
    row('breakdown.priorSeasonWeeks', 3, 0, 8, 'count', 'bible', 'N1.2.1', 'test film/library: weeks in which prior-season film is added'),
    // N1.1.2 guessed overlays
    row('guess.minMatchingPlays', 2, 1, 20, 'count', 'bible', 'N1.1.2', 'test film/library: guessed assignment needs matching plays'),
    row('guess.perMatchGain', 0.05, 0, 0.5, 'ratio', 'bible', 'N1.1.2', 'test film/library: guess accuracy gain per matching play'),
    // N1.2.2 cut-ups
    row('cutup.attentionPlays', 20, 1, 200, 'count', 'bible', 'N1.2.2', 'test film/cutups: long-reel warning'),
    row('reel.twoMinuteS', 120, 30, 600, 's', 'assumption', 'N1.2.2', 'test film/library: two-minute reel window (a coaching situation the user can edit, not a rule value)'),
    row('cutup.scriptedPlays', 15, 1, 40, 'count', 'bible', 'N1.2.2', 'test film/cutups: opening scripted plays template'),
    // N1.2.3 notes
    row('note.softLimitChars', 280, 20, 5000, 'count', 'bible', 'N1.2.3', 'test film/annotations: soft note limit on the film screen'),
    // N1.3.2 staff attribution
    row('staff.accuracyMin', 0.7, 0, 1, 'ratio', 'bible', 'N1.3.2', 'test film/breakdown: lowest staff attribution accuracy'),
    row('staff.accuracyMax', 0.95, 0, 1, 'ratio', 'bible', 'N1.3.2', 'test film/breakdown: highest staff attribution accuracy'),
    // N1.4.1 grade formula and loaf patterns
    row('grade.plusPlus', 1, -4, 4, 'ratio', 'bible', 'N1.4.1', 'test film/grading: snap score, correct with plus technique'),
    row('grade.zero', 0, -4, 4, 'ratio', 'bible', 'N1.4.1', 'test film/grading: snap score, correct with zero technique'),
    row('grade.minus', -1, -4, 4, 'ratio', 'bible', 'N1.4.1', 'test film/grading: snap score, minus technique or lost contest'),
    row('grade.mentalError', -2, -4, 4, 'ratio', 'bible', 'N1.4.1', 'test film/grading: snap score, mental error'),
    row('grade.loaf', -2, -4, 4, 'ratio', 'bible', 'N1.4.1', 'test film/grading: snap score, loaf'),
    row('loaf.speedDropShare', 0.25, 0.05, 0.9, 'ratio', 'bible', 'N1.4.1', 'test film/loafs: pattern a speed drop'),
    row('loaf.speedDropS', 0.5, 0.1, 3, 's', 'bible', 'N1.4.1', 'test film/loafs: pattern a duration'),
    row('loaf.nearBallYd', 15, 1, 60, 'yd', 'bible', 'N1.4.1', 'test film/loafs: pattern a radius'),
    row('loaf.downS', 2, 0.5, 10, 's', 'bible', 'N1.4.1', 'test film/loafs: pattern c time on the ground'),
    row('loaf.pileStopS', 0.5, 0.1, 3, 's', 'bible', 'N1.4.1', 'test film/loafs: pattern d early stop at the pile'),
    row('loaf.stillYdPerS', 0.5, 0.05, 3, 'yd_per_s', 'assumption', 'N1.4.1', 'test film/loafs: speed under which a player counts as stopped'),
    row('loaf.pileYd', 2, 0.5, 6, 'yd', 'assumption', 'N1.4.1', 'test film/loafs: distance from the ball that counts as at the pile'),
    // N1.4.2 assignment-percentage tiers (offensive line, SI 2014 via the bible: 1 of 3, PROVISIONAL)
    row('tier.bestShare', 0.89, 0, 1, 'ratio', 'bible', 'N1.4.2', 'PROVISIONAL 1 of 3 (SI 2014): best-player tier floor'),
    row('tier.averageShare', 0.85, 0, 1, 'ratio', 'bible', 'N1.4.2', 'PROVISIONAL 1 of 3 (SI 2014): average tier floor'),
    // N1.4.3 production against grade
    row('divergence.percentilePoints', 30, 1, 100, 'count', 'bible', 'N1.4.3', 'test film/production: divergence threshold'),
    row('divergence.combineGames', 4, 1, 17, 'count', 'bible', 'N1.4.3', 'test film/production: streak folded into one note'),
    row('garbage.wp', 0.95, 0.5, 1, 'ratio', 'bible', 'N1.4.3', 'test film/production: garbage-time line'),
    // N1.4.4 grade policy effects
    row('policy.loafBoardCut', 0.1, 0, 1, 'ratio', 'bible', 'N1.4.4', 'test film/grading: posted loaf board effect'),
    row('policy.loafBoardWeeks', 4, 1, 17, 'count', 'bible', 'N1.4.4', 'test film/grading: posted loaf board duration'),
    row('policy.awardCut', 0.05, 0, 1, 'ratio', 'bible', 'N1.4.4', 'test film/grading: award effect'),
    // N1.5.1 corrections
    row('correction.repeatBonusEp', 0.5, 0, 5, 'points', 'bible', 'N1.5.1', 'test film/corrections: repeat weight'),
    row('correction.repeatGames', 2, 1, 8, 'count', 'bible', 'N1.5.1', 'test film/corrections: games looked back for repeats'),
    row('correction.topPerUnit', 8, 1, 50, 'count', 'assumption', 'N1.5.1', 'test film/corrections: default list length per unit'),
    row('correction.wentRightEp', 2, 0, 7, 'points', 'bible', 'N1.5.1', 'test film/corrections: what-went-right line'),
    row('correction.uncorrectedRepeat', 1.5, 1, 5, 'ratio', 'bible', 'N1.5.1', 'repeat multiplier read by D9 and the engine (not applied here)'),
    // N1.6.1 film time
    row('time.freePlays', 60, 0, 1000, 'count', 'bible', 'N1.6.1', 'test film/access: weekly free allowance'),
    row('time.minutesPerPlay', 0.5, 0, 10, 'min', 'bible', 'N1.6.1', 'test film/access: cost per play past the allowance'),
    row('time.gradeHours', 1, 0, 10, 'h', 'bible', 'N1.6.1', 'test film/access: grading one player for one game'),
    row('time.chartStaffHours', 4, 0, 40, 'h', 'bible', 'N1.6.1', 'test film/access: charting one opponent game'),
    // I9.4.1 watching without calling
    row('watch.insideYd', 20, 1, 50, 'yd', 'bible', 'I9.4.1', 'test film/watch: default stop rule inside either 20'),
    row('watch.oneScoreMargin', 8, 1, 30, 'points', 'assumption', 'I9.4.1', 'test film/watch: one-score game for the late-game stop rule; to be read from the score.* rule keys (touchdown plus the two-point try) once the stop rules take a rule set'),
    row('watch.maxStopRules', 10, 1, 50, 'count', 'bible', 'I9.4.1', 'test film/watch: stop rules per game'),
  ],
};

/** Reads a value by name, with or without the `film.` prefix. */
export function param(name: string): number {
  const full = name.startsWith('film.') ? name : `film.${name}`;
  const p = PARAMS.params.find((x) => x.name === full);
  if (!p) throw new Error(`film: unknown parameter ${name}`);
  return p.value;
}

/** Parameters whose basis is a real-world source short of three (Q6.3.1 prints these as PROVISIONAL). */
export function provisionalParams(): string[] {
  return PARAMS.params.filter((p) => p.constrainedBy.startsWith('PROVISIONAL')).map((p) => p.name);
}
