// A 53-man club for the depth chart tests: base offense 11 personnel and 12, base defense with nickel and
// dime packages, and the punt and kickoff units.
import type { DepthChart, DepthPerson, JobDef, PositionGroup, UnitDef } from '../../src/depth/index.ts';
import { depthRules } from '../../src/depth/index.ts';

const j = (job: string, group: PositionGroup, extra: Partial<JobDef> = {}): JobDef => ({ job, group, ...extra });

export const DEFS: UnitDef[] = [
  { unitId: 'off:11', jobs: [j('QB', 'qb'), j('RB', 'rb'), j('X', 'wr'), j('Z', 'wr'), j('SLOT', 'wr'), j('Y', 'te'), j('LT', 'ol'), j('LG', 'ol'), j('C', 'ol'), j('RG', 'ol'), j('RT', 'ol')] },
  { unitId: 'off:12', base: 'off:11', jobs: [j('QB', 'qb'), j('RB', 'rb'), j('X', 'wr'), j('Z', 'wr'), j('F', 'te', { mapsTo: 'SLOT' }), j('Y', 'te'), j('LT', 'ol'), j('LG', 'ol'), j('C', 'ol'), j('RG', 'ol'), j('RT', 'ol')], trigger: { situation: 'four_minute' } },
  { unitId: 'def:base', jobs: [j('LE', 'dl'), j('DT', 'dl'), j('NT', 'dl'), j('RE', 'dl'), j('SAM', 'lb'), j('MIKE', 'lb'), j('WILL', 'lb'), j('LCB', 'db'), j('RCB', 'db'), j('FS', 'db'), j('SS', 'db')] },
  { unitId: 'def:nickel', base: 'def:base', trigger: { personnel: ['11', '10'] }, jobs: [j('LE', 'dl'), j('DT', 'dl'), j('NT', 'dl'), j('RE', 'dl'), j('NB', 'db', { mapsTo: 'SAM' }), j('MIKE', 'lb'), j('WILL', 'lb'), j('LCB', 'db'), j('RCB', 'db'), j('FS', 'db'), j('SS', 'db')] },
  { unitId: 'def:dime', base: 'def:nickel', trigger: { downs: [3], minToGo: 7 }, jobs: [j('LE', 'dl'), j('DT', 'dl'), j('NT', 'dl'), j('RE', 'dl'), j('NB', 'db'), j('DB6', 'db', { mapsTo: 'MIKE' }), j('WILL', 'lb'), j('LCB', 'db'), j('RCB', 'db'), j('FS', 'db'), j('SS', 'db')] },
  { unitId: 'st:punt', core: true, load: 'coverage', jobs: [j('P', 'p', { stExempt: true }), j('LS', 'ls', { stExempt: true }), j('PP', 'lb'), j('PLG', 'ol', { stExempt: true }), j('PRG', 'ol', { stExempt: true }), j('PLT', 'te'), j('PRT', 'te'), j('LW', 'lb'), j('RW', 'lb'), j('G1', 'db'), j('G2', 'wr')] },
  { unitId: 'st:kickoff', core: true, load: 'coverage', jobs: [j('K', 'k', { stExempt: true }), j('L1', 'lb'), j('L2', 'lb'), j('L3', 'db'), j('L4', 'db'), j('L5', 'wr'), j('R1', 'lb'), j('R2', 'db'), j('R3', 'db'), j('R4', 'rb'), j('R5', 'te')] },
  { unitId: 'st:field_goal', core: true, load: 'kicking', jobs: [j('K', 'k'), j('H', 'p', { emergency: 'holder' }), j('LS', 'ls'), j('LT', 'ol', { stExempt: true }), j('LG', 'ol', { stExempt: true }), j('C', 'ol', { stExempt: true }), j('RG', 'ol', { stExempt: true }), j('RT', 'ol', { stExempt: true }), j('LW', 'te'), j('RW', 'te'), j('TE', 'te')] },
];

const groups: [PositionGroup, number[]][] = [
  ['qb', [1, 2, 3]], ['rb', [10, 11, 12]], ['wr', [20, 21, 22, 23, 24, 25, 26]], ['te', [30, 31, 32]],
  ['ol', [40, 41, 42, 43, 44, 45, 46, 47, 48]], ['dl', [50, 51, 52, 53, 54, 55, 56]], ['lb', [60, 61, 62, 63, 64, 65, 66, 67]],
  ['db', [70, 71, 72, 73, 74, 75, 76, 77, 78, 79]], ['k', [90]], ['p', [91]], ['ls', [92]],
];

export function people(over: Record<number, Partial<DepthPerson>> = {}): Map<number, DepthPerson> {
  const m = new Map<number, DepthPerson>();
  for (const [group, ids] of groups) for (const personId of ids) m.set(personId, { personId, group, service: 4, ...(group === 'ol' ? { lineCapable: true } : {}), ...over[personId] });
  return m;
}

export const ROSTER = groups.flatMap(([, ids]) => ids);

export function chart(): DepthChart {
  return {
    teamId: 7,
    week: 3,
    units: {
      'off:11': { QB: [1, 2], RB: [10, 11, 12], X: [20, 23], Z: [21, 24], SLOT: [22, 25], Y: [30, 31], LT: [40, 45], LG: [41, 46], C: [42, 46], RG: [43, 46], RT: [44, 45] },
      'off:12': { F: [31, 32] },
      'def:base': { LE: [50, 54], DT: [51, 55], NT: [52, 56], RE: [53, 54], SAM: [60, 63], MIKE: [61, 64], WILL: [62, 65], LCB: [70, 74], RCB: [71, 75], FS: [72, 76], SS: [73, 77] },
      'def:nickel': { NB: [74, 75] },
      'def:dime': { DB6: [75, 76] },
      'st:punt': { P: [91], LS: [92], PP: [63, 64], PLG: [45], PRG: [46], PLT: [31], PRT: [32], LW: [64, 65], RW: [65, 66], G1: [76, 77], G2: [23, 24] },
      'st:kickoff': { K: [90], L1: [63], L2: [66], L3: [76], L4: [77], L5: [24], R1: [67], R2: [78], R3: [79], R4: [12], R5: [32] },
      'st:field_goal': { K: [90], H: [91], LS: [92], LT: [40], LG: [41], C: [42], RG: [43], RT: [44], LW: [31], RW: [32], TE: [30] },
    },
    cascades: {
      'off:11/LT': [{ slides: [{ from: 'LG', to: 'LT' }], enters: { job: 'LG', personId: 46 } }],
    },
    emergency: { quarterback: 3, long_snapper: 30, holder: 1, kicker: 91, punter: 90, sixth_lineman: 47, seventh_lineman: 48 },
    situational: { third_down_back: [11] },
  };
}

export const RULES = depthRules({
  id: 'fixture', level: 'pro', seasonYear: 2026,
  num: (k: string) => ({ 'substitution.max_players': 11 } as Record<string, number>)[k]!,
  bool: () => false, opt: () => '', keys: () => ['substitution.max_players'],
} as never);

export const COLLEGE_RULES = depthRules({
  id: 'fixture-c', level: 'college', seasonYear: 2026,
  num: (k: string) => ({ 'substitution.max_players': 11, 'eligibility.redshirt_max_games': 4 } as Record<string, number>)[k]!,
  bool: () => false, opt: () => '', keys: () => ['substitution.max_players', 'eligibility.redshirt_max_games', 'eligibility.postseason_counts'],
} as never);

/** Pro active limit from the roster rules shape: 48 with 8 linemen, else 47 (fixture values). */
export const limitFor = (linemen: number) => (linemen >= 8 ? 48 : 47);
