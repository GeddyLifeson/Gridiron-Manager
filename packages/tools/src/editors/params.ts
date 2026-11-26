// Safety limits for user content (P7.2.1) that the G-08 loader does not already hold. Bible rows are
// P7.2.1 starting values; the two `assumption` rows are this package's choices where P7.2.1 names a
// danger but no number (see README, decisions E-03 and E-04).
import type { ParamFile } from '@gm/schema';

type Basis = 'bible' | 'assumption';
const row = (name: string, value: number, unit: string, basis: Basis, min = 1, max = value * 10) =>
  ({ name, value, min, max, unit, belongsTo: 'tools.editors', basis, leaf: 'P7.2.1', constrainedBy: 'P7.2.1 hostile pack corpus (packages/tools/test/editors)', status: 'starting' as const });

export const PARAMS: ParamFile = {
  module: 'tools.editors',
  version: 'g96.1',
  params: [
    row('safety.ruleTreeMaxDepth', 12, 'count', 'bible'),
    row('safety.ruleMaxNodes', 200, 'count', 'bible'),
    row('safety.peoplePerPack', 500_000, 'count', 'bible'),
    row('safety.fileTimeLimitMs', 5000, 'ms', 'bible'),
    // E-03: JSON nesting is checked on the raw text before JSON.parse, so a hostile file cannot
    // overflow the parser's stack. No shipped content kind nests deeper than about 20 levels.
    row('safety.jsonMaxDepth', 64, 'count', 'assumption', 16, 512),
    // E-04: a pack with this many objects in one file is refused before any walk (pathological size
    // that stays under the byte limit). 2 million objects is about four times a full people pack row count.
    row('safety.maxNodesPerFile', 2_000_000, 'count', 'assumption', 100_000, 20_000_000),
  ],
};

export interface SafetyLimits {
  readonly ruleTreeMaxDepth: number;
  readonly ruleMaxNodes: number;
  readonly peoplePerPack: number;
  readonly fileTimeLimitMs: number;
  readonly jsonMaxDepth: number;
  readonly maxNodesPerFile: number;
}

function p(name: string): number {
  const r = PARAMS.params.find((x) => x.name === name);
  if (!r) throw new Error(`unknown parameter ${name}`);
  return r.value;
}

export const DEFAULT_SAFETY: SafetyLimits = {
  ruleTreeMaxDepth: p('safety.ruleTreeMaxDepth'),
  ruleMaxNodes: p('safety.ruleMaxNodes'),
  peoplePerPack: p('safety.peoplePerPack'),
  fileTimeLimitMs: p('safety.fileTimeLimitMs'),
  jsonMaxDepth: p('safety.jsonMaxDepth'),
  maxNodesPerFile: p('safety.maxNodesPerFile'),
};
