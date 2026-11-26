// Scouting parameter file (D6). Every number the estimator uses is a row here.
// `basis: 'bible'` rows are the starting values D6 states; `basis: 'assumption'` rows are forms or values
// D6 names without a number, chosen by this module and to be moved by calibration (Q2). None is a
// real-world football fact: D6 marks every effect size as "Assumption (design tuning)".
import type { ParamFile, TuningParam } from '@gm/schema';

type Basis = 'b' | 'a';
type Row = readonly [name: string, value: number, min: number, max: number, unit: string, basis: Basis];

function group(belongsTo: string, leaf: string, constrainedBy: string, rows: readonly Row[]): TuningParam[] {
  return rows.map(([name, value, min, max, unit, basis]) => ({
    name: `scouting.${name}`, value, min, max, unit, belongsTo,
    basis: basis === 'b' ? 'bible' as const : 'assumption' as const,
    leaf, constrainedBy, status: 'starting' as const,
  }));
}

const COVERAGE = 'D6.1.1 80 percent coverage test (76 to 84)';
const HALVING = 'D6.4.2 tuning target: a new starter band halves in about 4 games (250 snaps), within 20 percent';

export const PARAMS: ParamFile = {
  module: 'people.scouting',
  version: '0.1.0',
  params: [
    ...group('band', 'D6.1.1', COVERAGE, [
      // z for an 80 percent two-sided band.
      ['band.z', 1.28, 0.67, 1.96, 'z', 'b'],
    ]),
    ...group('prior', 'D6.4.1', 'D6.4.1 prior means unbiased within 1 ISS', [
      ['prior.sdNoInformation', 12, 6, 20, 'iss', 'b'],
      ['prior.sdPublicProduction', 8, 4, 14, 'iss', 'b'],
      ['prior.sdEstablishedStarter', 6, 3, 10, 'iss', 'b'],
      // Share of the gap between the position-and-level mean and what public facts imply that the prior
      // moves (the "regression held in config"). Form chosen here.
      ['prior.publicRegression', 0.5, 0, 1, 'share', 'a'],
    ]),
    // Noise sd per single unit before evaluator skill (D6.4.2 table).
    ...group('evidence noise', 'D6.4.2', HALVING, [
      ['noise.gameLive', 25, 5, 80, 'iss per snap', 'b'],
      ['noise.gameFilm', 18, 5, 80, 'iss per snap', 'b'],
      ['noise.opponentFilm', 22, 5, 80, 'iss per snap', 'b'],
      ['noise.practiceFull', 28, 5, 90, 'iss per rep', 'b'],
      ['noise.practiceWalk', 30, 5, 90, 'iss per rep', 'b'],
      ['noise.workout', 12, 3, 40, 'iss per session', 'b'],
      ['noise.interview', 15, 3, 40, 'iss per interview', 'b'],
      ['noise.seasonStats', 10, 3, 40, 'iss per season', 'b'],
      ['noise.gradingService', 20, 5, 80, 'iss per snap', 'b'],
      // The D6.4.2 table values do not meet the D6.4.2 halving target under the D6.1.1 update rule
      // (18 ISS film noise halves a prior of 8 in about 20 snaps, not 250). This one tuning multiplier
      // applies to every per-snap and per-rep source alike, so their ratios stay as the table gives them,
      // and is set so the halving test passes (README decision S-03).
      ['noise.snapTuning', 2.85, 1, 5, 'multiplier', 'a'],
    ]),
    ...group('evaluator skill', 'D6.4.2', 'D6.4.3 band floor acceptance', [
      // noise multiplier = skillBase - skill / skillDivisor: skill 80 gives 0.8, skill 30 gives 1.3.
      ['skill.base', 1.6, 1, 2, 'multiplier', 'b'],
      ['skill.divisor', 100, 50, 200, 'skill points', 'b'],
      // The user's grades weigh as the median evaluator (D6.4.3, E9.1.3 case 1, `user_term_constant`).
      ['skill.userTerm', 50, 0, 100, 'skill points', 'a'],
    ]),
    ...group('opponent quality', 'D6.4.5', 'D6.4.5 acceptance: college-champion quarterbacks rarely exceed ISS 60 as pros', [
      // Variance is multiplied by 1 + ((estimate - opponent - offset) / scale)^2 above the offset.
      ['opponent.offset', 10, 0, 30, 'iss', 'b'],
      ['opponent.scale', 10, 2, 30, 'iss', 'b'],
      // Lean of a low-skill evaluator toward the dominance he sees against weak opposition, per ISS of gap
      // above the offset, at skill 0; scaled by (1 - skill / divisor). Form chosen here for D6.4.5 rule 3
      // "staff who ignore this overrate players from weak schedules".
      ['opponent.weakScheduleLean', 0.25, 0, 1, 'iss per iss', 'a'],
    ]),
    ...group('evaluator bias and floor', 'D6.4.3', 'D6.4.3: one evaluator of skill 50 never below a half-width of 4.5 ISS', [
      ['bias.leniencySd', 3, 0, 10, 'iss', 'b'],
      ['bias.favouriteSd', 3, 0, 10, 'iss', 'b'],
      ['floor.base', 1.5, 0.5, 5, 'iss', 'b'],
      ['floor.skillSpan', 4, 0, 10, 'iss', 'b'],
      ['floor.minimum', 1.5, 0.5, 5, 'iss', 'b'],
    ]),
    ...group('aging of evidence', 'D6.4.4', 'D6.4.4: coverage holds for players unseen 1, 2 and 3 years', [
      ['drift.sdUnder23', 4, 0, 10, 'iss per year', 'b'],
      ['drift.sd23to29', 2, 0, 10, 'iss per year', 'b'],
      ['drift.sd30Plus', 3, 0, 10, 'iss per year', 'b'],
      ['drift.youngBelowAge', 23, 18, 26, 'years', 'b'],
      ['drift.oldFromAge', 30, 27, 34, 'years', 'b'],
      ['drift.majorInjurySd', 5, 0, 15, 'iss', 'b'],
      // Calendar length used to turn day differences into years. Not a football number.
      ['drift.daysPerYear', 365, 360, 366, 'days', 'a'],
    ]),
    ...group('reported tests', 'D6.1.2', 'D6.1.2: school-reported tests carry a marker', [
      ['reported.fortyBiasS', -0.05, -0.2, 0, 's', 'b'],
      ['reported.fortySdS', 0.05, 0.01, 0.2, 's', 'b'],
    ]),
    ...group('projection', 'D6.5.1', 'D6.5.1: projection at 17 correlates 0.45 to 0.65 with true peak for an average staff', [
      ['projection.noiseSdAt17', 14, 5, 25, 'iss per look', 'b'],
      ['projection.noiseSdAt23', 6, 2, 15, 'iss per look', 'b'],
      ['projection.youngAge', 17, 14, 19, 'years', 'b'],
      ['projection.settledAge', 23, 20, 26, 'years', 'b'],
      ['projection.arrowIss', 3, 1, 10, 'iss', 'b'],
      ['projection.noneAfterAge', 28, 25, 32, 'years', 'b'],
      ['projection.levelJumpSd', 3, 0, 10, 'iss per level', 'b'],
      // Age at which the expected curve reaches the ceiling when no D7 curve is supplied. Form chosen here.
      ['projection.defaultPeakAge', 27, 23, 30, 'years', 'a'],
    ]),
    // Words shown in place of numbers (D6.1.1 confidence words, D6.5.1 potential words; MA-48). The bible
    // names the words ("thin look", "well watched") but not where they switch, so the cut points are chosen
    // here against D6 reference widths: one skill-50 evaluator's floor is a half-width of 4.5 ISS
    // (D6.4.3), a no-information prior 15.4 and a public-production prior 10.2 (D6.4.1).
    ...group('words', 'D6.1.1', 'MA-48: confidence in words by default, numeric band one tap away', [
      ['words.wellWatchedHalfIss', 5, 2, 10, 'iss', 'a'],
      ['words.fairLookHalfIss', 9, 5, 15, 'iss', 'a'],
    ]),
    ...group('potential words', 'D6.5.1', 'D6.5.1: potential is words only; hunch strength from projected minus current over the band', [
      // Hunch strength = (projected mean - current mean) / projected sd.
      ['words.strongHunchZ', 1, 0.3, 3, 'sd', 'a'],
      ['words.modestHunchZ', 0.3, 0, 1, 'sd', 'a'],
      ['words.doubtZ', -0.3, -2, 0, 'sd', 'a'],
      // "Young players read more tentative": below this age the hunch is hedged.
      ['words.tentativeBelowAge', 21, 17, 24, 'years', 'a'],
      // A driver pulls into the explanation when it moves the internal projection by at least this much.
      ['words.driverMinIss', 1, 0, 5, 'iss', 'a'],
    ]),
    ...group('belief encoding', 'P3.2.3', 'Round trip of AttributeBelief.confidence (README decision S-02)', [
      // confidence = ref^2 / (ref^2 + variance): the no-information prior reads 0.5.
      ['belief.confidenceRefSd', 12, 1, 30, 'iss', 'a'],
    ]),
  ],
};

const BY_NAME = new Map(PARAMS.params.map((p) => [p.name, p.value]));

/** Reads one scouting parameter. Throws on an unknown name so a typo never reads as zero. */
export function p(name: string): number {
  const v = BY_NAME.get(`scouting.${name}`);
  if (v === undefined) throw new Error(`unknown scouting parameter ${name}`);
  return v;
}

/** Rule keys this module reads. Scouting reads no league rule value. */
export const RULE_KEYS: readonly string[] = [];
