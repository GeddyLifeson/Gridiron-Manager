// A 53-player club for the depth chart read model tests: base offense 11 and 12 personnel, base defense
// with nickel and dime packages, punt, kickoff and field goal units (shape copied from G-56's own test
// fixture, since a test may not reach into another package's files).
import { depth } from '@gm/league';
import type { DepthChartInput } from '../../../src/read-models/depth-chart/index.ts';

type J = depth.JobDef;
const j = (job: string, group: depth.PositionGroup, extra: Partial<J> = {}): J => ({ job, group, ...extra });

export const DEFS: depth.UnitDef[] = [
  { unitId: 'st:punt', core: true, load: 'coverage', jobs: [j('P', 'p', { stExempt: true }), j('LS', 'ls', { stExempt: true }), j('PP', 'lb'), j('PLG', 'ol', { stExempt: true }), j('PRG', 'ol', { stExempt: true }), j('PLT', 'te'), j('PRT', 'te'), j('LW', 'lb'), j('RW', 'lb'), j('G1', 'db'), j('G2', 'wr')] },
  { unitId: 'def:nickel', base: 'def:base', trigger: { personnel: ['11', '10'] }, jobs: [j('LE', 'dl'), j('DT', 'dl'), j('NT', 'dl'), j('RE', 'dl'), j('NB', 'db', { mapsTo: 'SAM' }), j('MIKE', 'lb'), j('WILL', 'lb'), j('LCB', 'db'), j('RCB', 'db'), j('FS', 'db'), j('SS', 'db')] },
  { unitId: 'off:12', base: 'off:11', jobs: [j('QB', 'qb'), j('RB', 'rb'), j('X', 'wr'), j('Z', 'wr'), j('F', 'te', { mapsTo: 'SLOT' }), j('Y', 'te'), j('LT', 'ol'), j('LG', 'ol'), j('C', 'ol'), j('RG', 'ol'), j('RT', 'ol')] },
  { unitId: 'off:11', jobs: [j('QB', 'qb'), j('RB', 'rb'), j('X', 'wr'), j('Z', 'wr'), j('SLOT', 'wr'), j('Y', 'te'), j('LT', 'ol'), j('LG', 'ol'), j('C', 'ol'), j('RG', 'ol'), j('RT', 'ol')] },
  { unitId: 'def:base', jobs: [j('LE', 'dl'), j('DT', 'dl'), j('NT', 'dl'), j('RE', 'dl'), j('SAM', 'lb'), j('MIKE', 'lb'), j('WILL', 'lb'), j('LCB', 'db'), j('RCB', 'db'), j('FS', 'db'), j('SS', 'db')] },
  { unitId: 'st:kickoff', core: true, load: 'coverage', jobs: [j('K', 'k', { stExempt: true }), j('L1', 'lb'), j('L2', 'lb'), j('L3', 'db'), j('L4', 'db'), j('L5', 'wr'), j('R1', 'lb'), j('R2', 'db'), j('R3', 'db'), j('R4', 'rb'), j('R5', 'te')] },
];

const GROUPS: [depth.PositionGroup, string, number[]][] = [
  ['qb', 'QB', [1, 2, 3]], ['rb', 'RB', [10, 11, 12]], ['wr', 'WR', [20, 21, 22, 23, 24, 25, 26]], ['te', 'TE', [30, 31, 32]],
  ['ol', 'OL', [40, 41, 42, 43, 44, 45, 46, 47, 48]], ['dl', 'DL', [50, 51, 52, 53, 54, 55, 56]], ['lb', 'LB', [60, 61, 62, 63, 64, 65, 66, 67]],
  ['db', 'DB', [70, 71, 72, 73, 74, 75, 76, 77, 78, 79]], ['k', 'K', [90]], ['p', 'P', [91]], ['ls', 'LS', [92]],
];

export function chart(): depth.DepthChart {
  return {
    teamId: 7, week: 3,
    units: {
      'off:11': { QB: [1, 2], RB: [10, 11, 12], X: [20, 23], Z: [21, 24], SLOT: [22, 25], Y: [30, 31], LT: [40, 45], LG: [41, 46], C: [42, 46], RG: [43, 46], RT: [44, 45] },
      'off:12': { F: [31, 32] },
      'def:base': { LE: [50, 54], DT: [51, 55], NT: [52, 56], RE: [53, 54], SAM: [60, 63], MIKE: [61, 64], WILL: [62, 65], LCB: [70, 74], RCB: [71, 75], FS: [72, 76], SS: [73, 77] },
      'def:nickel': { NB: [74, 75] },
      'st:punt': { P: [91], LS: [92], PP: [63, 64], PLG: [45], PRG: [46], PLT: [31], PRT: [32], LW: [64, 65], RW: [65, 66], G1: [76, 77], G2: [23, 24] },
      'st:kickoff': { K: [90], L1: [63], L2: [66], L3: [76], L4: [77], L5: [24], R1: [67], R2: [78], R3: [79], R4: [12], R5: [32] },
    },
    cascades: {},
    emergency: { quarterback: 3, long_snapper: 30, holder: 1, kicker: 91, punter: 90, sixth_lineman: 47, seventh_lineman: 48 },
    situational: {},
  };
}

export const RULES = depth.depthRules({
  id: 'fixture', level: 'pro', seasonYear: 2026,
  // substitution.max_players: F-rule-0021 in rules-data pro_2026.json
  num: (k: string) => ({ 'substitution.max_players': 11 } as Record<string, number>)[k]!,
  bool: () => false, opt: () => '', keys: () => ['substitution.max_players'],
} as never);

export function input(over: Partial<DepthChartInput> = {}): DepthChartInput {
  const people: depth.DepthPerson[] = [];
  const cards: { personId: number; name: string; position: string }[] = [];
  for (const [group, pos, ids] of GROUPS) {
    for (const personId of ids) {
      people.push({ personId, group, service: 4, ...(group === 'ol' ? { lineCapable: true } : {}), emergencyReps: { quarterback: 30, long_snapper: 30, holder: 30, kicker: 30, punter: 30, sixth_lineman: 30, seventh_lineman: 30 } });
      cards.push({ personId, name: `${pos} ${personId}`, position: pos });
    }
  }
  return { clubId: 7, chart: chart(), defs: DEFS, people, cards, rules: RULES, actives: null, battles: [], today: 200, openerDay: 250, locked: false, ...over };
}
