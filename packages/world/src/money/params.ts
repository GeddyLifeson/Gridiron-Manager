// Constants of club money in the world (C6.2.3). The cap itself is a rule value read by key, never stored here.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [string, number, number, number, string, 'bible' | 'assumption', string, string];

export const MODULE = 'world.money';
const ROWS: readonly Row[] = [
  // C6.2.3 rule 3: "Owner cash budget is a starting 95 to 110 percent of the cap by owner profile (Assumption (design tuning))".
  ['budget.capShareLow', 0.95, 0.5, 1.5, 'share of cap', 'bible', 'C6.2.3', 'Bible starting value, itself marked Assumption (design tuning). No source read'],
  ['budget.capShareHigh', 1.1, 0.5, 1.5, 'share of cap', 'bible', 'C6.2.3', 'Bible starting value, itself marked Assumption (design tuning). No source read'],
  // C6.2.1 rule 5: "grows by a seeded yearly percentage (starting mean 7 percent, standard deviation 3 points,
  // Assumption set from the history in the facts below)" (2013 to 2026 cap history, Verified). The CBA sets no
  // growth limit. Applied to projected revenue (AR), which the cap follows (MO-11).
  ['revenue.growthMean', 0.07, -0.2, 0.3, 'share per year', 'bible', 'C6.2.1', 'Bible starting value (Assumption) set from the Verified 2013 to 2026 cap history'],
  ['revenue.growthSd', 0.03, 0, 0.2, 'share per year', 'bible', 'C6.2.1', 'Bible starting value (Assumption) set from the Verified 2013 to 2026 cap history'],
  // CBA Art. 12 s.6(a) splits AR into League Media, NFL Ventures/Postseason and Local; the split is not public.
  // Equal thirds (MO-12). At these shares the 55/45/40 rates give 46.7% of AR, under the 48% floor, so the
  // floor sets the Player Cost Amount.
  ['revenue.mediaShare', 1 / 3, 0, 1, 'share of AR', 'assumption', 'C6.2.1', 'No source: bucket mix of AR is not public (Assumption); bounded in effect by the 48 to 48.5 percent band'],
  ['revenue.venturesShare', 1 / 3, 0, 1, 'share of AR', 'assumption', 'C6.2.1', 'No source: bucket mix of AR is not public (Assumption); bounded in effect by the 48 to 48.5 percent band'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: '1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf, constrainedBy]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf, constrainedBy, status: 'starting',
  })),
};

const BY_NAME = new Map<string, number>(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value]));

export function param(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`unknown world money parameter ${name}`);
  return v;
}
