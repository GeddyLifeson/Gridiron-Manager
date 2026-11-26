// Off-screen transfer portal constants (T6, X12.1.1). Rule values (window dates, the postseason and
// coaching-change exceptions, the transfer limit) are read by key from the league rules and the G-12
// calendar, never stored here. Entry-chance weights are league college's (`league.college.entry*`). Rows
// below are the world binding's own stand-ins and market tuning, each an Assumption until its data is held.
import type { ParamFile, TuningParam } from '@gm/schema';

type Row = readonly [string, number, number, number, string, 'bible' | 'assumption', string, string];

export const MODULE = 'world.portal';
const ROWS: readonly Row[] = [
  // PT-04 stand-ins for retention facts the world does not hold yet.
  ['stand.satisfaction', 0.5, 0, 1, 'ratio', 'assumption', 'D12, T6.2.1', 'D12 satisfaction is not held on a world player: the middle of the scale for everyone'],
  ['stand.relationship', 0.5, 0, 1, 'ratio', 'assumption', 'L1, T6.2.1', 'L1 ties to the position coach are not held off-screen: a middling tie for everyone'],
  ['stand.payToMarket', 1, 0, 2, 'ratio', 'assumption', 'T7, T6.2.1', 'No college pay in the world yet (T7 unbound): everyone paid at market, so pay never drives entry'],
  ['losing.winShareBelow', 0.5, 0, 1, 'win share', 'assumption', 'T6.2.1', '"Team losing": a losing record last season (ties count half, C3)'],
  // PT-05 starters by recruiting room on an 11-man side: 11 personnel on offense (1 QB, 1 RB, 3 WR, 1 TE,
  // 5 OL) and nickel on defense (4 DL, 2 LB, 5 DB), the most used groupings (F1), plus a kicker and punter.
  ['starters.QB', 1, 0, 11, 'players', 'assumption', 'F1, M2', '11 personnel'],
  ['starters.RB', 1, 0, 11, 'players', 'assumption', 'F1, M2', '11 personnel'],
  ['starters.WR', 3, 0, 11, 'players', 'assumption', 'F1, M2', '11 personnel'],
  ['starters.TE', 1, 0, 11, 'players', 'assumption', 'F1, M2', '11 personnel'],
  ['starters.OL', 5, 0, 11, 'players', 'assumption', 'F1, M2', 'Five linemen'],
  ['starters.DL', 4, 0, 11, 'players', 'assumption', 'F1, M2', 'Nickel, four down linemen'],
  ['starters.LB', 2, 0, 11, 'players', 'assumption', 'F1, M2', 'Nickel, two linebackers'],
  ['starters.DB', 5, 0, 11, 'players', 'assumption', 'F1, M2', 'Nickel, five defensive backs'],
  ['starters.ST', 2, 0, 11, 'players', 'assumption', 'F12, M2', 'Kicker and punter'],
  // PT-03: players who enrolled this season (signed this January) do not enter the same January.
  ['entry.skipNewlyEnrolled', 1, 0, 1, 'switch', 'assumption', 'T6.2.1', 'A class that enrolls in January is the class the program just signed; no count of same-month entries was read'],
  // PT-07 market: each recruiting Wednesday a program with room offers its best-graded fits, up to this many.
  ['market.depthToSign', 1, 1, 5, 'deep (times starters)', 'assumption', 'T6.3.1, M2', 'T6.3.1 "programs with money buy starters": a program signs a transfer who would start in his room by its own grade (1 = starters only, 2 = the two-deep). At 1 the trimmed world leaves 26 to 36 percent unplaced against the T6.2.1 30 percent (Assumption) and the 35 to 40 percent mid-window snapshot (2 of 3); at 2 it left 11 percent'],
  ['market.offersPerWeek', 3, 1, 20, 'offers per program per week', 'assumption', 'T6.3.1', 'T6.3.1: "T4 at ten times the speed". No count of weekly portal offers read'],
  // PT-08 the entrant's choice: T6.3.1 weights money, role, winning, the position coach and distance.
  // Money and winning are both read as prestige (no college pay in the world); coach and distance are not held.
  ['choice.prestigeWeight', 1, 0, 5, 'weight', 'assumption', 'T6.3.1', 'Prestige stands for money and winning'],
  ['choice.roleWeight', 1, 0, 5, 'weight', 'assumption', 'T6.3.1', 'Role: would he start there, from the room\'s observed grades'],
  ['choice.noise', 0.25, 0, 2, 'weight', 'assumption', 'T6.3.1', 'Unmodelled reasons (home, a coach he knows); no source read'],
];

export const PARAMS: ParamFile = {
  module: MODULE,
  version: '1',
  params: ROWS.map(([name, value, min, max, unit, basis, leaf, constrainedBy]): TuningParam => ({
    name: `${MODULE}.${name}`, value, min, max, unit, belongsTo: MODULE, basis, leaf, constrainedBy, status: 'starting',
  })),
};

const BY_NAME = new Map<string, number>(PARAMS.params.map((p) => [p.name.slice(MODULE.length + 1), p.value]));

/** Reads a portal binding constant by short name. Throws on an unknown name. */
export function param(name: string): number {
  const v = BY_NAME.get(name);
  if (v === undefined) throw new Error(`unknown world portal parameter ${name}`);
  return v;
}
