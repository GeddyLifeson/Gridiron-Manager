// Import parameter file (U3, U4, U2.2.2, X14.3.1). Every number the importer uses is a row here.
// `basis: 'bible'` rows are the starting values the U, X14 and D13.6 leaves state (all marked "starting value"
// in the bible, none a real-world football fact). `basis: 'assumption'` rows are forms or values those leaves
// name without a number, chosen by this module and to be fitted by the U3.3.1 back-test.
import type { ParamFile, TuningParam } from '@gm/schema';

type Basis = 'b' | 'a';
type Row = readonly [name: string, value: number, min: number, max: number, unit: string, basis: Basis];

function group(belongsTo: string, leaf: string, constrainedBy: string, rows: readonly Row[]): TuningParam[] {
  return rows.map(([name, value, min, max, unit, basis]) => ({
    name: `import.${name}`, value, min, max, unit, belongsTo,
    basis: basis === 'b' ? 'bible' as const : 'assumption' as const,
    leaf, constrainedBy, status: 'starting' as const,
  }));
}

const BACKTEST = 'U3.3.1 hold-out rank correlation >= 0.5 per position group';

export const PARAMS: ParamFile = {
  module: 'people.import',
  version: '0.1.0',
  params: [
    ...group('confidence', 'U3.1.1', 'D6.4.1 prior widths', [
      ['confidence.sdMeasured', 6, 3, 10, 'iss', 'b'],
      ['confidence.sdInferred', 8, 4, 14, 'iss', 'b'],
      ['confidence.sdPrior', 12, 6, 20, 'iss', 'b'],
    ]),
    ...group('role signal', 'U3.1.3', BACKTEST, [
      ['role.starter', 50, 40, 60, 'iss', 'b'],
      ['role.rotation', 40, 30, 50, 'iss', 'b'],
      ['role.reserve', 32, 20, 45, 'iss', 'b'],
      // Snap or start share at which a season counts as starter and as rotation (the leaf names the three
      // roles without cut points; 0.7 is the leaf's own starter line in its acceptance criterion).
      ['role.starterShare', 0.7, 0.5, 0.9, 'share', 'b'],
      ['role.rotationShare', 0.35, 0.15, 0.55, 'share', 'a'],
      ['role.weightLast', 0.5, 0, 1, 'weight', 'b'],
      ['role.weightPrev', 0.3, 0, 1, 'weight', 'b'],
      ['role.weightThird', 0.2, 0, 1, 'weight', 'b'],
      // Regression to the prior (rule 4): weight n / (n + k) with n = games observed in the weighted seasons.
      ['role.shrinkGames', 6, 1, 40, 'games', 'a'],
      // The position prior for a pro roster player with no signal: the rotation value (rule 7 form).
      ['role.priorPro', 40, 30, 50, 'iss', 'a'],
    ]),
    ...group('production signal', 'U3.1.3', BACKTEST, [
      // ISS moved per shrunk z of a per-opportunity statistic (rule 2), and the cap on its total move.
      ['production.issPerZ', 3, 0, 8, 'iss per sd', 'a'],
      ['production.capIss', 6, 0, 15, 'iss', 'a'],
      ['production.minPositionSample', 20, 5, 200, 'players', 'a'],
      // Shrink constant k per statistic, in the statistic's own opportunities (rule 2: "k set per stat in config").
      ['production.k.attempts', 300, 50, 2000, 'attempts', 'a'],
      ['production.k.targets', 60, 10, 400, 'targets', 'a'],
      ['production.k.carries', 100, 20, 600, 'carries', 'a'],
      ['production.k.games', 16, 4, 80, 'games', 'a'],
      ['production.k.fgAttempts', 30, 5, 200, 'attempts', 'a'],
      ['production.k.punts', 60, 10, 400, 'punts', 'a'],
    ]),
    ...group('draft signal', 'U3.1.3', BACKTEST, [
      ['draft.fadeSeasons', 4, 1, 6, 'seasons', 'b'],
      // Share of the gap toward the slot value moved in the first season (rule 3: "a little").
      ['draft.weight', 0.25, 0, 0.6, 'share', 'a'],
      ['draft.firstPickIss', 50, 35, 65, 'iss', 'a'],
      ['draft.lastPickIss', 34, 20, 45, 'iss', 'a'],
    ]),
    ...group('mental', 'U3.1.3', BACKTEST, [
      ['mental.perStarterSeason', 2, 0, 4, 'iss per season', 'a'],
      ['mental.capIss', 8, 0, 12, 'iss', 'b'],
    ]),
    ...group('stamina', 'U3.1.2', BACKTEST, [
      ['stamina.capIss', 5, 0, 10, 'iss', 'b'],
    ]),
    ...group('ceiling', 'U3.1.1', 'D7 distribution (G-20) replaces this stand-in', [
      ['ceiling.rateSd', 0.15, 0.05, 0.4, 'ratio', 'a'],
      ['ceiling.noiseSd', 3, 0, 8, 'iss', 'a'],
    ]),
    ...group('college', 'U3.1.4', 'D13.4.1 census tolerance', [
      // Age on September 1 by class year when the pack has no birth date (D13.6.3 rule 1 fill).
      ['college.ageFreshman', 19, 17, 21, 'years', 'a'],
      // Age on September 1 of a pro rookie season when the pack has neither birth date nor class (D13.6.3 rule 1).
      ['pro.rookieAge', 22, 20, 25, 'years', 'a'],
    ]),
    ...group('coach', 'U3.2.1', 'U3.2.1 acceptance (pass rate over expected within 3 points)', [
      ['coach.shrinkPlays', 2000, 200, 10000, 'plays', 'b'],
      ['coach.minPlays', 500, 100, 2000, 'plays', 'b'],
      ['coach.outOfFootballSeasons', 2, 1, 5, 'seasons', 'b'],
    ]),
    ...group('links', 'U2.2.2', 'U2.2.2 edge count limit', [
      ['links.strongSeasons', 3, 2, 6, 'seasons', 'b'],
      ['links.teammateMinSeasons', 2, 1, 4, 'seasons', 'b'],
      ['links.maxEdges', 2_000_000, 10_000, 10_000_000, 'edges', 'b'],
    ]),
    ...group('placement', 'U4.2.1', 'U4.2.1 balanced spread', [
      // "1 standard deviation of real team strength": no measured value yet, so a named assumption on the
      // team metric (mean ISS of the starters), to be replaced by a fact row when research measures it.
      ['placement.balancedSpreadIss', 3, 0.5, 10, 'iss', 'a'],
      ['placement.swapPasses', 200, 0, 5000, 'passes', 'a'],
    ]),
    ...group('dial', 'X14.3.1', 'Marlon to confirm the default (X14.3.1 open question)', [
      ['dial.default', 50, 0, 100, 'percent', 'b'],
    ]),
  ],
};

const BY_NAME = new Map(PARAMS.params.map((p) => [p.name, p.value]));

/** One import parameter by its short name ("role.starter"). Throws on an unknown name. */
export function param(name: string): number {
  const v = BY_NAME.get(`import.${name}`);
  if (v === undefined) throw new Error(`unknown import parameter ${name}`);
  return v;
}
