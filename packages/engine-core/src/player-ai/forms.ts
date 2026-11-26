// Content tables of the player AI: deviation kinds and motives (K1.7.1), error forms per behavior
// (J4.5.3), forms of a selfish act by motive (K1.7.4 rule 4), accident forms (K1.7.2 rule 3) and the
// in-play acts (K1.3.1 rule 1, K1.7.5). The bible calls these lists content with starting weights;
// they live here until the content pipeline owns them.
// Each form names one PRIMITIVE: the one way the engine changes what the player does.
import type { Behavior } from '@gm/schema';
import type { TriggerId } from './mind.ts';
import type { PlayerAiParamName } from './params.ts';

export const DEVIATION_KINDS = ['accident', 'didNotKnow', 'forSelf', 'forTeam'] as const;
export type DeviationKind = (typeof DEVIATION_KINDS)[number];

/**
 * K1.7.1 rule 2 motive list. Two rows are added as content, which the leaf allows, and are reported:
 * `technique` (a plain execution miss with no fatigue, contact, traffic or pressure behind it) and
 * `preventScore` (the K1.3.3 deliberate foul that is not about the clock).
 */
export const MOTIVES = {
  slip: { kind: 'accident', leaf: 'J12.5.1' }, fatigue: { kind: 'accident', leaf: 'K1.7.2' }, contact: { kind: 'accident', leaf: 'K1.7.2' },
  traffic: { kind: 'accident', leaf: 'K1.7.2' }, panic: { kind: 'accident', leaf: 'K1.7.2' }, technique: { kind: 'accident', leaf: 'K1.7.2' },
  notInstalled: { kind: 'didNotKnow', leaf: 'J4.5.2' }, forgot: { kind: 'didNotKnow', leaf: 'J4.5.2' }, misread: { kind: 'didNotKnow', leaf: 'K1.5.1' },
  situation: { kind: 'didNotKnow', leaf: 'K1.7.3' },
  stats: { kind: 'forSelf', leaf: 'K1.7.4' }, touches: { kind: 'forSelf', leaf: 'K1.7.4' }, contract: { kind: 'forSelf', leaf: 'K1.7.4' },
  protest: { kind: 'forSelf', leaf: 'K1.7.4' }, frustration: { kind: 'forSelf', leaf: 'K1.7.4' }, showcase: { kind: 'forSelf', leaf: 'K1.7.4' },
  read: { kind: 'forTeam', leaf: 'K1.7.5' }, tell: { kind: 'forTeam', leaf: 'K1.7.5' }, rescue: { kind: 'forTeam', leaf: 'K1.7.5' },
  clock: { kind: 'forTeam', leaf: 'K1.3.3' }, preventScore: { kind: 'forTeam', leaf: 'K1.3.3' },
} as const satisfies Record<string, { kind: DeviationKind; leaf: string }>;
export type Motive = keyof typeof MOTIVES;

/**
 * The ways an error or a selfish act changes what a player does:
 *  mirror: his path flipped side to side about where he lined up
 *  mirrorAfterRule: the same, but only once one of his rules has fired (a conversion taken the wrong way)
 *  depth / shallow / lateral: his target moved along or across the field
 *  wrongMan: he works on the perceived opponent next to the right one
 *  chase: he goes to the ball as he sees it; chaseFake: to a backfield player who does not have it
 *  jump: he drives on the nearest receiver in front of him
 *  late: he keeps doing the last thing for a while after each of his rules fires
 *  deaf: he acts as if he heard no call; blind: as if he did not see the nearest opponent who is not his own
 *  alternate: he runs the old assignment (or its mirror when none is supplied)
 *  standDown: he does not finish his job and coasts; halfEffort: he does it without full effort
 *  presnap: an alignment or offside error, applied by the pre-snap phase (J5), no change after the snap
 */
export type Primitive = 'mirror' | 'mirrorAfterRule' | 'depth' | 'shallow' | 'lateral' | 'wrongMan' | 'chase' | 'chaseFake' | 'jump'
  | 'late' | 'deaf' | 'blind' | 'alternate' | 'standDown' | 'halfEffort' | 'presnap';

export interface FormDef {
  readonly form: string;
  readonly prim: Primitive;
  readonly weight: number;
  /** Size of the change, as a parameter name; sign +1 or -1 where the primitive has a direction. */
  readonly size?: PlayerAiParamName;
  readonly sign?: 1 | -1;
  /** 'old' forms are favoured by a communication error, 'man' forms by a complex look (J4.5.3). */
  readonly leans?: 'old' | 'man';
}

const f = (form: string, prim: Primitive, weight: number, extra: Partial<FormDef> = {}): FormDef => ({ form, prim, weight, ...extra });

const ZONE: readonly FormDef[] = [
  f('wrongLandmark', 'lateral', 3, { size: 'errGapYd' }), f('didNotCarryVertical', 'shallow', 3, { size: 'errShallowYd' }),
  f('jumpedShortRoute', 'jump', 2), f('wrongRotation', 'mirror', 2, { leans: 'old' }),
];
const RUSH: readonly FormDef[] = [
  f('wrongGap', 'lateral', 4, { size: 'errGapYd' }), f('leftContain', 'chase', 3), f('rushedLate', 'late', 1, { size: 'errLateS' }),
];
/** Used for a behavior the J4.5.3 list does not name. */
const GENERIC: readonly FormDef[] = [
  f('wrongDirection', 'mirror', 3), f('late', 'late', 3, { size: 'errLateS' }), f('wrongMan', 'wrongMan', 2, { leans: 'man' }),
];

/** J4.5.3 error forms by behavior. Weights are starting values (Assumption). */
export const ERROR_FORMS: Readonly<Partial<Record<Behavior, readonly FormDef[]>>> = {
  route: [
    f('wrongDepth', 'depth', 3, { size: 'errDepthYd', sign: -1 }), f('wrongBreakDirection', 'mirror', 2),
    f('wrongConversion', 'mirrorAfterRule', 2), f('ranPreviousRoute', 'alternate', 1, { leans: 'old' }), f('noHotAdjust', 'deaf', 2, { leans: 'old' }),
  ],
  passSet: [
    f('wrongMan', 'wrongMan', 3, { leans: 'man' }), f('slidWrongWay', 'mirror', 2), f('missedStuntExchange', 'late', 2, { size: 'errLateS' }),
    f('didNotSeeBlitzer', 'blind', 2),
  ],
  runBlock: [
    f('wrongMan', 'wrongMan', 3, { leans: 'man' }), f('wrongDirection', 'mirror', 2), f('missedComboClimb', 'late', 2, { size: 'errLateS' }),
    f('letRunThroughGo', 'blind', 2),
  ],
  runFit: [f('wrongGap', 'lateral', 4, { size: 'errGapYd' }), f('lostContain', 'chase', 3), f('chasedFake', 'chaseFake', 3)],
  zoneDrop: ZONE, deepZone: ZONE,
  manCover: [
    f('wrongManAfterMotion', 'wrongMan', 4, { leans: 'man' }), f('noPassOff', 'deaf', 3, { leans: 'old' }),
    // The leaf lists two forms for man coverage and asks for three per behavior; this third is an Assumption (reported).
    f('wrongLeverage', 'lateral', 2, { size: 'errGapYd' }),
  ],
  blitz: RUSH, passRush: RUSH,
};
export const GENERIC_ERROR_FORMS = GENERIC;

/** J4.5.3 alignment errors before the snap, offered only when the error is decided before the snap. Applied by J5. */
export const PRESNAP_FORMS: readonly FormDef[] = [f('wrongSide', 'presnap', 1), f('wrongSplit', 'presnap', 1), f('illegalFormation', 'presnap', 1)];
/** Offered only to rushers (J4.5.3 "jumped offside", J5.7). */
export const OFFSIDE_FORM: FormDef = f('jumpedOffside', 'presnap', 1);

export const SELF_MOTIVES = ['stats', 'touches', 'protest', 'frustration', 'showcase'] as const;
export type SelfMotive = (typeof SELF_MOTIVES)[number];

type Group = 'rush' | 'cover' | 'fit' | 'route' | 'carry' | 'block';
export function behaviorGroup(b: Behavior): Group | null {
  switch (b) {
    case 'passRush': case 'blitz': case 'rushKick': return 'rush';
    case 'manCover': case 'zoneDrop': case 'deepZone': case 'spy': return 'cover';
    case 'runFit': case 'pursue': return 'fit';
    case 'route': return 'route';
    case 'ballCarrier': case 'returner': return 'carry';
    case 'passSet': case 'runBlock': case 'pull': return 'block';
    default: return null;
  }
}

/** K1.7.4 rule 4: what a selfish act looks like, by motive and job. A motive with no form for the job falls back to the J4.5.3 list. */
export const SELF_FORMS: Readonly<Record<SelfMotive, Readonly<Partial<Record<Group, readonly FormDef[]>>>>> = {
  stats: {
    rush: [f('leftRushLaneForSack', 'chase', 1)], cover: [f('jumpedRouteAgainstCall', 'jump', 1)], fit: [f('leftGapToChase', 'chase', 1)],
    route: [f('ranDeeperThanAdjustment', 'depth', 1, { size: 'errDeeperYd', sign: 1 })],
  },
  touches: {
    carry: [f('bouncedOutside', 'lateral', 1, { size: 'errBounceYd' })], route: [f('driftedIntoTeammate', 'lateral', 1, { size: 'errGapYd' })],
  },
  protest: { route: [f('didNotBlock', 'standDown', 1)], block: [f('halfEffortPickup', 'halfEffort', 1)], fit: [f('joggedPursuit', 'halfEffort', 1)], cover: [f('joggedPursuit', 'halfEffort', 1)] },
  frustration: { route: [f('didNotBlock', 'standDown', 1)], block: [f('halfEffortPickup', 'halfEffort', 1)], fit: [f('joggedPursuit', 'halfEffort', 1)] },
  showcase: {
    rush: [f('leftRushLaneForSack', 'chase', 1)], cover: [f('jumpedRouteAgainstCall', 'jump', 1)], fit: [f('leftGapToChase', 'chase', 1)],
    route: [f('ranDeeperThanAdjustment', 'depth', 1, { size: 'errDeeperYd', sign: 1 })],
  },
};

/** K1.7.2 rule 3 accident forms. `technique` is the D3 attribute whose grade lowers the chance. */
export type AccidentPrim = 'depth' | 'angle' | 'landmark' | 'falseStep';
export interface AccidentDef { readonly form: string; readonly prim: AccidentPrim; readonly weight: number }
export interface CheckpointDef { readonly technique: string; readonly forms: readonly AccidentDef[] }
const DROP: CheckpointDef = { technique: 'zone_coverage', forms: [{ form: 'dropLandmarkOff', prim: 'landmark', weight: 3 }, { form: 'falseStep', prim: 'falseStep', weight: 1 }] };
/** Behaviors whose targets are landmarks, so a new target is a moment where precision matters (rule 1). */
export const CHECKPOINTS: Readonly<Partial<Record<Behavior, CheckpointDef>>> = {
  route: { technique: 'route_running_intermediate', forms: [{ form: 'routeDepthOff', prim: 'depth', weight: 2 }, { form: 'roundedBreak', prim: 'angle', weight: 2 }] },
  zoneDrop: DROP, deepZone: DROP,
  runFit: { technique: 'run_fit_technique', forms: [{ form: 'falseStep', prim: 'falseStep', weight: 2 }, { form: 'fitPointOff', prim: 'landmark', weight: 1 }] },
  pull: { technique: 'pulling', forms: [{ form: 'pullTrackWide', prim: 'angle', weight: 2 }, { form: 'falseStep', prim: 'falseStep', weight: 1 }] },
  kickCoverage: { technique: 'coverage_lane_discipline', forms: [{ form: 'lostLane', prim: 'landmark', weight: 1 }] },
};
/** Route technique by depth of the break (D3.4.1): short, intermediate, deep. Depths are D3's bands as starting values (Assumption). */
export const ROUTE_BANDS: readonly { readonly maxYd: number; readonly technique: string }[] = [
  { maxYd: 8, technique: 'route_running_short' }, { maxYd: 18, technique: 'route_running_intermediate' }, { maxYd: Infinity, technique: 'route_running_deep' },
];

export interface TriggerDef {
  readonly id: TriggerId;
  readonly leaf: 'K1.3.1' | 'K1.7.4' | 'K1.7.5';
  readonly behaviors: readonly Behavior[];
  /** His estimate of the team gain when the read is right, and the credit to him. Parameter names. */
  readonly value: PlayerAiParamName;
  readonly credit: PlayerAiParamName;
  /** Explain-record text (J4.6.2). */
  readonly note: string;
}
const COVER: readonly Behavior[] = ['manCover', 'zoneDrop', 'deepZone'];
/** In arbiter order (K1.7.1 rule 3): K1.7.5 acts, then K1.3.1 gambles, then the K1.7.4 in-play form. */
export const TRIGGER_DEFS: readonly TriggerDef[] = [
  { id: 'sitOnRoute', leaf: 'K1.7.5', behaviors: COVER, value: 'valueSitOnRoute', credit: 'creditInterception', note: 'left assignment: sat on the route he studied' },
  { id: 'rescue', leaf: 'K1.7.5', behaviors: COVER, value: 'valueRescue', credit: 'creditTackle', note: 'left assignment: covered for a teammate' },
  { id: 'pickUpFree', leaf: 'K1.7.5', behaviors: ['passSet'], value: 'valuePickUpFree', credit: 'creditPeek', note: 'left assignment: picked up the free rusher' },
  { id: 'jumpRoute', leaf: 'K1.3.1', behaviors: ['manCover', 'deepZone'], value: 'valueJumpRoute', credit: 'creditInterception', note: 'left assignment: jumped route' },
  { id: 'undercut', leaf: 'K1.3.1', behaviors: ['zoneDrop'], value: 'valueUndercut', credit: 'creditInterception', note: 'left assignment: undercut the crosser' },
  { id: 'shootGap', leaf: 'K1.3.1', behaviors: ['runFit'], value: 'valueShootGap', credit: 'creditTackle', note: 'left assignment: shot the gap' },
  { id: 'peek', leaf: 'K1.3.1', behaviors: ['manCover'], value: 'valuePeek', credit: 'creditPeek', note: 'left assignment: peeked in the backfield' },
  { id: 'strip', leaf: 'K1.3.1', behaviors: ['pursue', 'runFit', 'manCover', 'zoneDrop', 'deepZone', 'spy', 'blitz', 'passRush', 'kickCoverage', 'gunner'], value: 'valueStrip', credit: 'creditStrip', note: 'went for the strip' },
  { id: 'leaveContain', leaf: 'K1.7.4', behaviors: ['passRush', 'blitz', 'runFit'], value: 'valueLeaveContain', credit: 'creditSack', note: 'left assignment: left contain for the sack' },
];
