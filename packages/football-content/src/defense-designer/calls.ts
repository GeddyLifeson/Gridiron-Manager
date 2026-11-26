// Starter defensive calls in the designer's rule form (G2.1.1): one per main pressure and coverage family,
// with checks, motion answers and run-fit puller answers. They restate the WP-15 starter calls
// (starter/defense.ts, whose basis rows carry the sources) as rules relative to the offense, plus what G2
// adds. The alignments, depths and checks chosen here are DESIGN DEFAULTS (Assumption) a coordinator edits.
import type { Align, CallSlot, Check, Coverage, DefensiveCall, Job, Package, Position } from './types.ts';

const slot = (id: string, pos: Position, align: Align, job: Job, extra: Partial<CallSlot> = {}): CallSlot => ({ id, pos, align, job, ...extra });
const BASE: Package = { id: 'base_43', name: '4-3 base', dl: 4, lb: 3, db: 4 };
const NICKEL: Package = { id: 'nickel_425', name: 'Nickel (4-2-5)', dl: 4, lb: 2, db: 5 };

/** Four-man line of the over front: 5 weak, 1 weak (shade), 3 strong, 5 strong; all one-gap. */
const LINE_OVER = (rush = true): CallSlot[] => [
  slot('E', 'DE', { kind: 'tech', blocker: 'T', shade: 'outside', side: 'weak' }, { kind: 'rush', gap: 'C', side: 'weak' }, { gapControl: 'one' }),
  slot('N', 'NT', { kind: 'tech', blocker: 'C', shade: 'outside', side: 'weak' }, { kind: 'rush', gap: 'A', side: 'weak' }, { gapControl: 'one' }),
  slot('T', 'DT', { kind: 'tech', blocker: 'G', shade: 'outside', side: 'strong' }, { kind: 'rush', gap: 'B', side: 'strong' }, { gapControl: 'one' }),
  slot('K', 'DE', { kind: 'tech', blocker: 'T', shade: 'outside', side: 'strong' }, rush ? { kind: 'rush', gap: 'C', side: 'strong' } : { kind: 'zone', area: 'flat', side: 'strong' }, { gapControl: 'one' }),
];
const CORNERS_DEEP3: CallSlot[] = [
  slot('LC', 'CB', { kind: 'rcv', n: 1, side: 'left', depthYd: 7, leverage: 'outside' }, { kind: 'zone', area: 'deepThird', side: 'left' }),
  slot('RC', 'CB', { kind: 'rcv', n: 1, side: 'right', depthYd: 7, leverage: 'outside' }, { kind: 'zone', area: 'deepThird', side: 'right' }),
];
const CORNERS_MAN: CallSlot[] = [
  slot('LC', 'CB', { kind: 'rcv', n: 1, side: 'left', depthYd: 1, leverage: 'inside' }, { kind: 'man', target: { n: 1, side: 'left' }, technique: 'press' }),
  slot('RC', 'CB', { kind: 'rcv', n: 1, side: 'right', depthYd: 1, leverage: 'inside' }, { kind: 'man', target: { n: 1, side: 'right' }, technique: 'press' }),
];
const DECL = { runStrength: 'tightEnd', tie: 'field', caller: 'M' } as const;
const FITS = { onePuller: { strong: 'spill', weak: 'box' }, twoPuller: { strong: 'spill', weak: 'spill' }, overrides: {} } as const;
const common = { declarations: DECL, runFits: FITS, matchups: [], source: 'starter', status: 'valid', ruleFailures: [] } as const;

const cov = (id: string, name: string, family: string, shell: Coverage['shell'], motion: Coverage['motion'], match: Coverage['match'] = []): Coverage => ({ id, name, family, shell, match, motion });

const WALK_OUT_EMPTY: Check = { id: 'empty_walk_out', when: ['empty'], note: 'Empty: the overhang walks out over number 2 to the passing strength', patch: { slots: { S: { align: { kind: 'rcv', n: 2, side: 'passStrong', depthYd: 5, leverage: 'inside' }, job: { kind: 'zone', area: 'curlFlat', side: 'passStrong' } } } } };
const TE_WING_DOWN: Check = { id: 'te_wing_safety_down', when: ['teWing'], note: 'Tight end and wing: the strong safety walks down to own the extra gap', patch: { slots: { SS: { align: { kind: 'lb', gap: 'E', side: 'strong', depthYd: 3 }, job: { kind: 'zone', area: 'curlFlat', side: 'strong' } } } } };

export const OVER_3_SKY: DefensiveCall = {
  ...common, id: 'dd_over_3_sky', name: 'Over 3 Sky', package: BASE,
  slots: [
    ...LINE_OVER(),
    slot('S', 'OLB', { kind: 'overhang', side: 'strong' }, { kind: 'zone', area: 'hook', side: 'strong' }),
    slot('M', 'ILB', { kind: 'lb', gap: 'A', side: 'strong' }, { kind: 'zone', area: 'hook', side: 'weak' }),
    slot('W', 'OLB', { kind: 'lb', gap: 'B', side: 'weak' }, { kind: 'zone', area: 'curlFlat', side: 'weak' }),
    slot('SS', 'S', { kind: 'rcv', n: 2, side: 'passStrong', depthYd: 8, leverage: 'outside' }, { kind: 'zone', area: 'curlFlat', side: 'passStrong' }),
    slot('FS', 'S', { kind: 'deep', side: 'middle', depthYd: 12, outsideHashYd: 0 }, { kind: 'zone', area: 'deepMiddle' }),
    ...CORNERS_DEEP3,
  ],
  front: { id: 'over', name: 'Over', convention: 'oddOutside' },
  movement: { stunts: [], pressure: null },
  coverage: cov('cover3_sky', 'Cover 3 Sky', 'cover3', 'oneHigh', { normal: 'bump', jet: 'spin' }),
  checks: [WALK_OUT_EMPTY, TE_WING_DOWN],
  disguise: null,
  tempo: { isTempoCall: true, word: 'Sky' },
  intent: { beats: ['inside run', 'deep shots outside'], weakTo: ['seam', 'flood', 'curl'] },
};

export const NICKEL_1_ROBBER: DefensiveCall = {
  ...common, id: 'dd_nickel_1_robber', name: 'Nickel 1 Robber', package: NICKEL,
  slots: [
    ...LINE_OVER(),
    slot('M', 'ILB', { kind: 'lb', gap: 'A', side: 'strong' }, { kind: 'man', target: 'back' }),
    slot('W', 'ILB', { kind: 'lb', gap: 'B', side: 'weak' }, { kind: 'man', target: { n: 2, side: 'passWeak' } }),
    slot('NB', 'NB', { kind: 'rcv', n: 2, side: 'passStrong', depthYd: 4, leverage: 'inside' }, { kind: 'man', target: { n: 2, side: 'passStrong' } }),
    slot('SS', 'S', { kind: 'lb', gap: 'over', side: 'strong', depthYd: 8 }, { kind: 'zone', area: 'hole' }),
    slot('FS', 'S', { kind: 'deep', side: 'middle', depthYd: 13, outsideHashYd: 0 }, { kind: 'zone', area: 'deepMiddle' }),
    ...CORNERS_MAN,
  ],
  front: { id: 'over', name: 'Over', convention: 'oddOutside' },
  movement: { stunts: [{ kind: 'twist', penetrator: 'T', looper: 'K', penetratorGap: 'C', looperGap: 'B', side: 'strong', delayS: 0.3, downs: 'pass' }], pressure: null },
  coverage: cov('cover1_robber', 'Cover 1 Robber', 'cover1', 'oneHigh', { normal: 'lock', jet: 'lock' }),
  checks: [
    { id: 'empty_mike_on_3', when: ['empty'], note: 'Empty: the Mike takes number 3 to the passing strength', patch: { slots: { M: { align: { kind: 'rcv', n: 3, side: 'passStrong', depthYd: 5, leverage: 'inside' }, job: { kind: 'man', target: { n: 3, side: 'passStrong' } } } } } },
    { id: 'trips_robber_on_3', when: ['trips'], note: 'Trips: the robber takes number 3 to the trips side', patch: { slots: { SS: { align: { kind: 'rcv', n: 3, side: 'passStrong', depthYd: 6, leverage: 'inside' }, job: { kind: 'man', target: { n: 3, side: 'passStrong' } } } } } },
    { id: 'te_mike_on_te', when: ['heavy'], note: 'Heavy: the robber takes the tight end', patch: { slots: { SS: { job: { kind: 'man', target: 'tightEnd' } } } } },
  ],
  disguise: { shell: 'twoHigh', moment: 'late', positions: { SS: { kind: 'deep', side: 'strong', depthYd: 12, outsideHashYd: 2 }, FS: { kind: 'deep', side: 'weak', depthYd: 12, outsideHashYd: 2 } } },
  tempo: { isTempoCall: false, word: null },
  intent: { beats: ['quick game', 'crossers'], weakTo: ['rub', 'mesh', 'pick'] },
};

const quarterMatch: Coverage['match'] = [
  { slot: 'LC', triggers: [{ n: 1, side: 'left', release: 'vertical', job: 'man' }], otherwise: 'deep' },
  { slot: 'RC', triggers: [{ n: 1, side: 'right', release: 'vertical', job: 'man' }], otherwise: 'deep' },
  { slot: 'FS', triggers: [{ n: 2, side: 'left', release: 'vertical', job: 'man' }, { n: 2, side: 'left', release: 'out', job: 'pass' }], otherwise: 'deep' },
  { slot: 'SS', triggers: [{ n: 2, side: 'right', release: 'vertical', job: 'man' }, { n: 2, side: 'right', release: 'out', job: 'pass' }], otherwise: 'deep' },
];

export const NICKEL_QUARTERS: DefensiveCall = {
  ...common, id: 'dd_nickel_quarters', name: 'Nickel Quarters', package: NICKEL,
  slots: [
    ...LINE_OVER(),
    slot('M', 'ILB', { kind: 'lb', gap: 'A', side: 'strong' }, { kind: 'zone', area: 'hook', side: 'strong' }),
    slot('W', 'ILB', { kind: 'lb', gap: 'B', side: 'weak' }, { kind: 'zone', area: 'curlFlat', side: 'weak' }),
    slot('NB', 'NB', { kind: 'rcv', n: 2, side: 'passStrong', depthYd: 5, leverage: 'outside' }, { kind: 'zone', area: 'curlFlat', side: 'passStrong' }),
    slot('SS', 'S', { kind: 'rcv', n: 2, side: 'right', depthYd: 10, leverage: 'inside' }, { kind: 'zone', area: 'insideQuarter', side: 'right' }),
    slot('FS', 'S', { kind: 'rcv', n: 2, side: 'left', depthYd: 10, leverage: 'inside' }, { kind: 'zone', area: 'insideQuarter', side: 'left' }),
    slot('LC', 'CB', { kind: 'rcv', n: 1, side: 'left', depthYd: 7, leverage: 'outside' }, { kind: 'zone', area: 'deepQuarter', side: 'left' }),
    slot('RC', 'CB', { kind: 'rcv', n: 1, side: 'right', depthYd: 7, leverage: 'outside' }, { kind: 'zone', area: 'deepQuarter', side: 'right' }),
  ],
  front: { id: 'over', name: 'Over', convention: 'oddOutside' },
  movement: { stunts: [], pressure: null },
  coverage: cov('cover4_quarters', 'Quarters', 'cover4', 'twoHigh', { normal: 'bump', jet: 'track' }, quarterMatch),
  checks: [],
  disguise: null,
  tempo: { isTempoCall: true, word: 'Quarters' },
  intent: { beats: ['four verticals', 'inside run'], weakTo: ['flat', 'out', 'flood'] },
};

export const NICKEL_FIRE_ZONE: DefensiveCall = {
  ...common, id: 'dd_nickel_fire_zone', name: 'Nickel Fire Zone', package: NICKEL,
  slots: [
    slot('E', 'DE', { kind: 'tech', blocker: 'T', shade: 'outside', side: 'weak' }, { kind: 'zone', area: 'curlFlat', side: 'weak' }, { gapControl: 'one' }),
    slot('N', 'NT', { kind: 'tech', blocker: 'C', shade: 'outside', side: 'weak' }, { kind: 'rush', gap: 'A', side: 'weak' }, { gapControl: 'one' }),
    slot('T', 'DT', { kind: 'tech', blocker: 'G', shade: 'outside', side: 'strong' }, { kind: 'rush', gap: 'B', side: 'strong' }, { gapControl: 'one' }),
    slot('K', 'DE', { kind: 'tech', blocker: 'T', shade: 'outside', side: 'strong' }, { kind: 'rush', gap: 'C', side: 'strong' }, { gapControl: 'one' }),
    slot('M', 'ILB', { kind: 'lb', gap: 'A', side: 'strong' }, { kind: 'rush', gap: 'A', side: 'strong' }),
    slot('W', 'ILB', { kind: 'lb', gap: 'B', side: 'weak' }, { kind: 'zone', area: 'hook', side: 'weak' }),
    slot('NB', 'NB', { kind: 'rcv', n: 2, side: 'passStrong', depthYd: 4, leverage: 'inside' }, { kind: 'rush', gap: 'D', side: 'passStrong', delayS: 0 }),
    slot('SS', 'S', { kind: 'rcv', n: 2, side: 'passStrong', depthYd: 9, leverage: 'outside' }, { kind: 'zone', area: 'curlFlat', side: 'passStrong' }),
    slot('FS', 'S', { kind: 'deep', side: 'middle', depthYd: 12, outsideHashYd: 0 }, { kind: 'zone', area: 'deepMiddle' }),
    ...CORNERS_DEEP3,
  ],
  front: { id: 'over', name: 'Over', convention: 'oddOutside' },
  movement: { stunts: [], pressure: { name: 'Nickel Fire', family: 'zone', blockedMan: 'greenDog' } },
  coverage: cov('fire_zone_3u3d', 'Three under, three deep', 'cover3', 'oneHigh', { normal: 'bump' }),
  checks: [{ id: 'empty_cancel', when: ['empty'], note: 'Empty: cancel the pressure, play the zone', patch: { cancelPressure: true } }],
  disguise: null,
  tempo: { isTempoCall: false, word: null },
  intent: { beats: ['slide protection', 'third and medium'], weakTo: ['screen', 'hot', 'seam'] },
};

export const BASE_0_SIX: DefensiveCall = {
  ...common, id: 'dd_base_0_six', name: 'Cover 0, six-man', package: BASE,
  slots: [
    ...LINE_OVER(),
    slot('M', 'ILB', { kind: 'lb', gap: 'A', side: 'strong' }, { kind: 'rush', gap: 'A', side: 'strong' }),
    slot('W', 'OLB', { kind: 'lb', gap: 'B', side: 'weak' }, { kind: 'rush', gap: 'B', side: 'weak' }),
    slot('S', 'OLB', { kind: 'overhang', side: 'strong' }, { kind: 'man', target: 'back' }),
    slot('SS', 'S', { kind: 'rcv', n: 2, side: 'passStrong', depthYd: 5, leverage: 'inside' }, { kind: 'man', target: { n: 2, side: 'passStrong' } }),
    slot('FS', 'S', { kind: 'rcv', n: 2, side: 'passWeak', depthYd: 6, leverage: 'inside' }, { kind: 'man', target: { n: 2, side: 'passWeak' } }),
    ...CORNERS_MAN,
  ],
  front: { id: 'over', name: 'Over', convention: 'oddOutside' },
  movement: { stunts: [], pressure: { name: 'Zero', family: 'allOut', blockedMan: 'greenDog' } },
  coverage: cov('cover0', 'Cover 0', 'cover0', 'zeroHigh', { normal: 'lock' }),
  checks: [{ id: 'empty_sam_on_3', when: ['empty'], note: 'Empty: the Sam takes number 3 to the passing strength', patch: { slots: { S: { align: { kind: 'rcv', n: 3, side: 'passStrong', depthYd: 4, leverage: 'inside' }, job: { kind: 'man', target: { n: 3, side: 'passStrong' } } } } } }],
  disguise: null,
  tempo: { isTempoCall: false, word: null },
  intent: { beats: ['long developing pass', 'slide protection'], weakTo: ['screen', 'slant', 'quick'] },
};

export const BASE_TAMPA_2: DefensiveCall = {
  ...common, id: 'dd_base_tampa_2', name: 'Tampa 2', package: BASE,
  slots: [
    ...LINE_OVER(),
    slot('S', 'OLB', { kind: 'overhang', side: 'strong' }, { kind: 'zone', area: 'hook', side: 'strong' }),
    slot('M', 'ILB', { kind: 'lb', gap: 'A', side: 'strong' }, { kind: 'zone', area: 'deepMiddle' }),
    slot('W', 'OLB', { kind: 'lb', gap: 'B', side: 'weak' }, { kind: 'zone', area: 'hook', side: 'weak' }),
    slot('SS', 'S', { kind: 'deep', side: 'right', depthYd: 13, outsideHashYd: 2 }, { kind: 'zone', area: 'deepHalf', side: 'right' }),
    slot('FS', 'S', { kind: 'deep', side: 'left', depthYd: 13, outsideHashYd: 2 }, { kind: 'zone', area: 'deepHalf', side: 'left' }),
    slot('LC', 'CB', { kind: 'rcv', n: 1, side: 'left', depthYd: 5, leverage: 'outside' }, { kind: 'zone', area: 'flat', side: 'left' }, { load: 1 }),
    slot('RC', 'CB', { kind: 'rcv', n: 1, side: 'right', depthYd: 5, leverage: 'outside' }, { kind: 'zone', area: 'flat', side: 'right' }),
  ],
  front: { id: 'over', name: 'Over', convention: 'oddOutside' },
  movement: { stunts: [], pressure: null },
  coverage: cov('tampa2', 'Tampa 2', 'other', 'twoHigh', { normal: 'bump' }),
  checks: [WALK_OUT_EMPTY],
  disguise: null,
  tempo: { isTempoCall: true, word: 'Tampa' },
  intent: { beats: ['deep middle', 'outside verticals'], weakTo: ['corner', 'smash', 'seam'] },
};

export const DESIGNER_CALLS: readonly DefensiveCall[] = [OVER_3_SKY, NICKEL_1_ROBBER, NICKEL_QUARTERS, NICKEL_FIRE_ZONE, BASE_0_SIX, BASE_TAMPA_2];
