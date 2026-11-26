// Constants of the world's compliance binding (L8.2.5 context, K7.7.1 beliefs). Every row is a named
// Assumption until its owner's research lands; detection and penalty numbers stay in league.compliance.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [string, number, number, number, string, 'bible' | 'assumption', string, string];

export const MODULE = 'world.compliance';
const ROWS: readonly Row[] = [
  // K7.7.1 CaughtBelief: what a general manager believes about being caught comes from the public record (C10
  // sanctions news). The world holds no sanctions news yet, so every person starts from this shared read.
  ['belief.publicDetectRate', 0.1, 0, 1, 'ratio', 'assumption', 'K7.7.1', 'Share of acts of a class believed punished, until C10 sanctions news is read here. No source read'],
  // K7.7.1 CaughtBelief.penalty on the K2.8.2 desirability scale (0 to 1), by the class's severity.
  ['belief.penaltyMajor', 0.6, 0, 1, 'desirability', 'assumption', 'K7.7.1', 'Published penalty for a major act on the desirability scale. No source read'],
  ['belief.penaltyMinor', 0.2, 0, 1, 'desirability', 'assumption', 'K7.7.1', 'Published penalty for a minor act on the desirability scale. No source read'],
  // L5.4.5 compliance office strictness, 0 to 100, for a club whose rule set has a school compliance office
  // (rule key eligibility.seasons_of_competition held). No staff or culture record carries it off-screen yet.
  ['context.officeStrictness', 50, 0, 100, 'facet points', 'assumption', 'L5.4.5', 'Population middle of the 0 to 100 facet scale (X1.2.1). No source read'],
  // T9.5.1 rule 5 head coach monitoring record, 0 to 100. Off-screen head coaches log no compliance hours yet (E7).
  ['context.monitoring', 50, 0, 100, 'index', 'assumption', 'T9.5.1', 'Population middle until E7 compliance hours are logged off-screen. No source read'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: '1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf, constrainedBy]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf, constrainedBy, status: 'starting',
  })),
};

const BY_NAME = new Map<string, number>(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value]));

/** Reads a compliance binding constant by short name. Throws on an unknown name. */
export function param(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`unknown world compliance parameter ${name}`);
  return v;
}
