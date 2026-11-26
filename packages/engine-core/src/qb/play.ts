// What the quarterback is handed before the snap (J7 inputs): the play's drop and progression (F6),
// his pre-snap result (J5.4), the coach's standing instructions (I8) and the situation's value model
// (N2). All of it is his own side's knowledge or public information. No opponent truth appears here.
import { SLOTS_PER_TEAM, type PlayPoint } from '@gm/schema';
import type { DropType, RiskInstruction } from './formulas.ts';

/** One receiver he may throw to. Coordinates are play frame. */
export interface QbTarget {
  readonly slot: number;
  /**
   * The route as designed, start point first. He projects the receiver along it (J7.3.1 step 1).
   * Empty for a receiver with no fixed path (a back checking down in place).
   */
  readonly route: readonly PlayPoint[];
  /** Index into `route` of the break he times the throw to (J7.1.2). -1: no break, throw when he looks. */
  readonly breakIndex: number;
  /** True when the route ends by sitting down; false when he keeps running on the last heading. */
  readonly settles: boolean;
  /** What the quarterback knows of his own receiver from practice, as z. 0 when the caller gives none. */
  readonly zHands?: number;
  readonly zContestedCatch?: number;
  /**
   * His receiver's legs, known from practice (J2.2), for walking him along the route (J7.3.1 step 1).
   * When the caller gives none the league-typical rows `qb.judge.route*` stand in.
   */
  readonly topSpeedYps?: number;
  readonly accelTauS?: number;
  readonly brakeYps2?: number;
  /**
   * Share of his top speed he carries through each point of `route` (J2.1.3): 1 where he runs
   * through, less where he plants. Same length as `route`. Absent: only the break is planted, at the
   * league-typical share for its angle.
   */
  readonly cutShare?: readonly number[];
}

/** One step of the progression (J7.2.1). */
export interface QbRead {
  /** 'receiver': judge this man. 'coverageKey': watch a defender and throw off him (J7.2.1 step 4). */
  readonly kind: 'receiver' | 'coverageKey';
  readonly target: QbTarget;
  /** Coverage read only: the defender watched, and the receiver thrown to when he drives instead of sinking. */
  readonly keySlot?: number;
  readonly ifDrives?: QbTarget;
  /** Value of this read as the play design expects it, in expected points (J7.3.2 base). */
  readonly priorValue: number;
  /** Tagged as an alert by the call (I2.5.1). */
  readonly alert?: boolean;
}

/** J7.3.3 hot rule: the rusher the protection left for the quarterback, and the receiver who is hot off him. */
export interface HotRule {
  readonly rusherSlot: number;
  readonly target: QbTarget;
  /** His pre-snap look expected pressure from that side (J5.4.1). */
  readonly expectedPreSnap: boolean;
}

/** J7.7.1 mesh read on a zone read, option or run-pass option. */
export interface MeshRead {
  /** The conflict defender left unblocked on purpose. */
  readonly keySlot: number;
  readonly backSlot: number;
  /** Mesh window in seconds since the snap (0.4 to 0.7 s long). */
  readonly startS: number;
  readonly endS: number;
  /** What "the key crashed" means for this play: he keeps and runs, or he throws the attached route. */
  readonly onCrash: 'keep' | 'throw';
  readonly throwTarget?: QbTarget;
  /** Option pitch after a keep: the second defender read and the pitch man. */
  readonly pitch?: { readonly keySlot: number; readonly toSlot: number };
}

/** J7.5.3 designed movement: a boot or sprint-out path, with a keep option at the edge. */
export interface MovementAction {
  readonly path: readonly PlayPoint[];
  readonly keepOption: boolean;
}

/**
 * A designed handoff with no read (F4): he turns, meets the back and gives the ball. Nothing a
 * defender does changes it. A give that depends on a key is a `MeshRead`.
 */
export interface Handoff {
  readonly backSlot: number;
  /** Where he carries the ball to meet the back, play frame. Null: he gives it where he took the snap. */
  readonly meet: PlayPoint | null;
}

export const QB_PLAY_KINDS = ['pass', 'hailMary', 'mesh', 'handoff', 'spike', 'kneel', 'sneak'] as const;
export type QbPlayKind = (typeof QB_PLAY_KINDS)[number];

/** N2 stand-in: the value of a completion for these yards, and the cost of a turnover, in expected points. */
export interface QbValueModel {
  yards(gainYd: number): number;
  readonly turnoverCost: number;
  /** What an incompletion costs (the down is gone). Left out, an incompletion costs nothing. */
  readonly incompleteCost?: number;
}

export interface QbInstructions {
  /** I8 risk instruction. */
  readonly risk: RiskInstruction;
  /** +1 "run when it is there", -1 "stay in the pocket", 0 otherwise. */
  readonly scramble: -1 | 0 | 1;
  /** "Protect the ball": favours taking the sack with two hands on it (J7.4.2). */
  readonly protectBall: boolean;
}
export const NORMAL_INSTRUCTIONS: QbInstructions = { risk: 'normal', scramble: 0, protectBall: false };

export interface QbPlay {
  readonly qbSlot: number;
  readonly kind: QbPlayKind;
  readonly drop: DropType;
  /** Snap taken under centre (J7.8.1 spike legality). */
  readonly underCenter: boolean;
  /** Play-action time added to the drop, 0 for none (0.4 to 0.7 s, J7.1.1). His eyes leave the defense for it. */
  readonly playActionS: number;
  /** Bad-snap time from J5.6.2, 0 for a clean snap. */
  readonly badSnapS: number;
  /** Lateral position of the launch point. Null: straight behind where he takes the snap. */
  readonly launchPy: number | null;
  /**
   * Depth of the launch point as play-frame px (negative is behind the line), for a passer the drop
   * table does not describe: a punter or a holder who takes a long snap deep and throws from near
   * where he stands (F12.7.1). Null or absent: the drop's table depth (J7.1.1).
   */
  readonly launchPx?: number | null;
  readonly movement: MovementAction | null;
  /** Reads in the order the play gives for his believed coverage (J7.2.1 step 1 is done by J5.4). */
  readonly reads: readonly QbRead[];
  readonly checkdown: QbTarget | null;
  readonly hot: HotRule | null;
  /**
   * J7.2.1 step 5: the order to switch to when the true coverage shows and differs from his belief.
   * Null when his pre-snap read was right.
   */
  readonly correctedReads: readonly QbRead[] | null;
  readonly mesh: MeshRead | null;
  /** The designed handoff of a `handoff` play. Absent or null on every other kind. */
  readonly handoff?: Handoff | null;
  readonly instructions: QbInstructions;
  /** Slots of the originally eligible receivers (J7.5.2). */
  readonly eligible: readonly number[];
  /** Lateral edges of the pocket area: the tackles' alignment at the snap (B5.4.1). Null: a default width about the ball. */
  readonly pocket: { readonly leftPy: number; readonly rightPy: number } | null;
  /** +1 when his throwing arm is on the +py (offense's left) side, -1 for the usual right-hander. */
  readonly throwingSidePy: 1 | -1;
  /** Hits and sacks he has taken this game (J7.4.1 false pressure). */
  readonly hitsThisGame: number;
  /** A defensive pre-snap foul with the play live (J5.7): a free play if he recognises it (J7.8.2). */
  readonly freePlay: boolean;
  /** Hail Mary landmark, play frame. */
  readonly landmark: PlayPoint | null;
  /** N2 value model. Null: the module's stand-in. */
  readonly value: QbValueModel | null;
}

/** A dropback pass with nothing special, for callers and tests to spread over. */
export function basePlay(qbSlot: number, drop: DropType, reads: readonly QbRead[]): QbPlay {
  return {
    qbSlot, kind: 'pass', drop, underCenter: drop === 'uc3' || drop === 'uc5' || drop === 'uc7', playActionS: 0, badSnapS: 0, launchPy: null,
    movement: null, reads, checkdown: null, hot: null, correctedReads: null, mesh: null, instructions: NORMAL_INSTRUCTIONS,
    eligible: reads.map((r) => r.target.slot), pocket: null, throwingSidePy: -1, hitsThisGame: 0, freePlay: false, landmark: null, value: null,
  };
}

/** Problems with a play the stage cannot run. Empty when it can. */
export function qbPlayProblems(play: QbPlay): string[] {
  const out: string[] = [];
  const slotOk = (s: number): boolean => Number.isInteger(s) && s >= 0 && s < SLOTS_PER_TEAM;
  if (!slotOk(play.qbSlot)) out.push('qbSlot must be a slot of the snapping team');
  const target = (t: QbTarget, where: string): void => {
    if (!slotOk(t.slot) || t.slot === play.qbSlot) out.push(`${where}: target slot must be a teammate`);
    if (t.breakIndex >= t.route.length) out.push(`${where}: breakIndex is past the end of the route`);
  };
  play.reads.forEach((r, i) => {
    target(r.target, `read ${i}`);
    if (r.kind === 'coverageKey') {
      if (r.keySlot === undefined || r.keySlot < SLOTS_PER_TEAM) out.push(`read ${i}: a coverage read names a defender`);
      if (!r.ifDrives) out.push(`read ${i}: a coverage read needs the receiver thrown to when the key drives`); else target(r.ifDrives, `read ${i} ifDrives`);
    }
  });
  if (play.checkdown) target(play.checkdown, 'checkdown');
  if (play.hot) { target(play.hot.target, 'hot'); if (play.hot.rusherSlot < SLOTS_PER_TEAM) out.push('hot: the rusher is a defender'); }
  if (play.kind === 'mesh') {
    if (!play.mesh) out.push('a mesh play needs its mesh read');
    else {
      if (play.mesh.endS <= play.mesh.startS) out.push('mesh: the window must have a length');
      if (play.mesh.onCrash === 'throw' && !play.mesh.throwTarget) out.push('mesh: a run-pass option needs its route');
    }
  }
  if (play.kind === 'handoff') {
    const h = play.handoff ?? null;
    if (h === null) out.push('a handoff play needs its handoff');
    else if (!slotOk(h.backSlot) || h.backSlot === play.qbSlot) out.push('handoff: the back must be a teammate');
  }
  if (play.kind === 'hailMary' && !play.landmark) out.push('a Hail Mary needs its landmark');
  if (play.kind === 'pass' && play.reads.length === 0 && !play.checkdown) out.push('a pass needs at least one read');
  return out;
}
