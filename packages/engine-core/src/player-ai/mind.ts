// What the player AI is told about a player and a play. Everything here is hidden truth about the
// player himself (D4, D5, D12, X1, X5) or public facts of the play. Nothing here describes another
// player's true state, so handing it to a decision function keeps K1.6.1.
//
// The contract's `SimPlayer` does not yet carry personality or relationship state, so the caller
// (the game-day snapshot, later the people package) supplies a `PlayerMind` per slot. Requested as
// a contract change in the WP-19 report.
import type { CompiledAssignment } from '@gm/schema';

/** K1.7.3 rule 1 situation families. One knowledge item each (D9.1.1). */
export const SITUATION_FAMILIES = ['sticks', 'clock', 'field', 'score', 'possession'] as const;
export type SituationFamily = (typeof SITUATION_FAMILIES)[number];

/** Hidden make-up of one player. Facets are on the X1 scale: 0 to 100 with 50 in the middle. */
export interface PlayerMind {
  /** D5 motor, internal skill scale. */
  readonly motor: number;
  readonly competitiveness: number;
  readonly workHabits: number;
  readonly riskTolerance: number;
  readonly ego: number;
  /** D5 team orientation. */
  readonly teamOrientation: number;
  /** X1 `discipline` (rule respect on the field, K1.3.3). */
  readonly discipline: number;
  /** D12.3.2 buy-in and D12.3.1 trust in the coach, 0 to 100. */
  readonly buyIn: number;
  readonly trust: number;
  /** K1.7.4 `needSelf`: 1 in a contract year or with a statistical incentive in reach, 0.5 when his role is below what he expects, else 0. */
  readonly needSelf: number;
  /** D12.1.1 role gap, 0 to 1. Weights the `protest` motive. */
  readonly roleGap: number;
  /** X5 accumulated stress, 0 to 1, and whether it is past a breakpoint tagged "effort drop" (K1.2.1 rule 3). */
  readonly stress: number;
  readonly stressEffortDrop: boolean;
  /** Share of his contests lost so far this game, 0 to 1 (D12.5.1). Weights `frustration`. */
  readonly losingContests: number;
  /** A scout or opposing coach is watching in a showcase game (K1.7.4 rule 3). */
  readonly showcase: boolean;
  /** X5 need state that raises effort: contract year, fighting for a roster spot (K1.2.1 edge case). */
  readonly effortNeed: boolean;
  /** Years at this level and seasons in this system (K1.7.3, K1.7.5 gate). */
  readonly yearsAtLevel: number;
  readonly seasonsInSystem: number;
  /** High-leverage snaps played, for the D4.3.1 experience factor. */
  readonly highLeverageSnaps: number;
  /** D9 knowledge of each situation family, 0 to 1. */
  readonly situationKnowledge: Readonly<Record<SituationFamily, number>>;
  /** A real imported person: neutral trait block, self weight fixed at its base (X14, K1.7.4 edge case). */
  readonly neutralBlock: boolean;
  /** K1.7.7: added to his self weight after a selfish act was rewarded (X6 memory). */
  readonly selfWeightShift: number;
  /** K1.7.7: added to his adjustment threshold after a team-minded act was punished. */
  readonly thresholdShift: number;
}

export const NEUTRAL_MIND: PlayerMind = {
  motor: 50, competitiveness: 50, workHabits: 50, riskTolerance: 50, ego: 50, teamOrientation: 50, discipline: 50,
  buyIn: 60, trust: 50, needSelf: 0, roleGap: 0, stress: 0, stressEffortDrop: false, losingContests: 0, showcase: false,
  effortNeed: false, yearsAtLevel: 4, seasonsInSystem: 2, highLeverageSnaps: 200,
  situationKnowledge: { sticks: 1, clock: 1, field: 1, score: 1, possession: 1 },
  neutralBlock: false, selfWeightShift: 0, thresholdShift: 0,
};

/** The coach's standing instruction for one player (I1.4.3, I3). The same switches exist for the user and for AI coaches. */
export interface StandingInstruction {
  /** "No freelancing": raises the gamble threshold and costs him standing if he defies it for himself (K1.7.4 rule 6). */
  readonly noFreelancing?: boolean;
  /** "Stay on top": instructed discipline in coverage (K1.3.1 rule 2). */
  readonly stayOnTop?: boolean;
  /** "Go for the strip": more attempts and more missed tackles together (K1.3.1 rule 5). */
  readonly goForStrips?: boolean;
  /** K1.3.3: "no deliberate fouls" (+1) or "prevent the touchdown" (-1); 0 leaves his own threshold. */
  readonly deliberateFouls?: -1 | 0 | 1;
  /** K1.3.2 rule 3: "press the hole" (-1) or "take what's there" (+1), a bounded shift of the J8 patience parameter. */
  readonly carrierPatience?: -1 | 0 | 1;
}

/** In-play acts a player may choose that are outside his assignment (K1.3.1 rule 1, K1.7.4 rule 4, K1.7.5). Content list. */
export const TRIGGERS = ['sitOnRoute', 'rescue', 'pickUpFree', 'jumpRoute', 'undercut', 'shootGap', 'peek', 'strip', 'leaveContain'] as const;
export type TriggerId = (typeof TRIGGERS)[number];

/** One slot's part of a play, set before the snap. */
export interface SlotPlay {
  readonly compiled: (CompiledAssignment & { readonly eventBase?: number }) | null;
  /** Concept id of his assignment, the key into `gameDay.knowledge` (D9.1.1). */
  readonly conceptId: string;
  readonly mind: PlayerMind;
  readonly instruction?: StandingInstruction;
  /** D9.4.1 assignment difficulty factor for the position, 0.6 to 1.6. */
  readonly difficulty?: number;
  /** A check or audible changed his job at the line (J5). */
  readonly jobChangedAtLine?: boolean;
  /** Look complexity: 0 for a look practised this week, 1 for one never seen (J4.5.2). */
  readonly complexity?: number;
  /** A floor on J4.5.2 temptation, for a job the call knows is tempting. The near-ball rule is computed from what he perceives. */
  readonly temptation?: number;
  /** K1.7.4 rule 3: chance this play offers him a statistic. */
  readonly statChance?: number;
  /** His job includes contain or a rush lane (K1.7.4 rule 4). */
  readonly contain?: boolean;
  /** Acts the call itself allows him (G1, G2 freedom tags). An allowed act is not a deviation (K1.7.4 edge case). */
  readonly freedom?: readonly TriggerId[];
  /** Teammates whose rules assume his position (J4.3.3), with his cohesion with each, 0 to 1 (D9.5.1). */
  readonly dependents?: readonly { readonly slot: number; readonly cohesion: number }[];
  /** H2.3.3 film tell he studied for this look: where the ball tends to go, and how strongly the look matches, 0 to 1. */
  readonly tell?: { readonly px: number; readonly py: number; readonly strength: number } | null;
  /** The assignment he runs when he "ran the previous play" or kept the old call (J4.5.3). Null: the engine mirrors his path. */
  readonly alternate?: CompiledAssignment | null;
  /** D9 knowledge of the installed scramble rule, 0 to 1 (K1.3.2 rule 1), and chemistry with the quarterback, 0 to 1 (X7). */
  readonly scrambleKnowledge?: number;
  readonly chemistry?: number;
  /** A sideline reminder about the situation reached him this snap (I11, K1.7.3 rule 2). */
  readonly reminder?: boolean;
}

/** A unit and the player who makes its calls (K1.5.1). */
export interface CommUnit { readonly communicator: number; readonly members: readonly number[] }

/** Facts of the play that are the same for everyone. All public or team-level; no player truth. */
export interface PlayContext {
  /** D9.4.1 noise factor on knowledge errors, per side of the ball: [snapping team, other team]. 1 is neutral. */
  readonly noiseFactor?: readonly [number, number];
  /** Crowd noise 0 to 1 as each unit hears it (J12.6.1), same order. */
  readonly noise?: readonly [number, number];
  /** J12.8.1 residual familiarity at the home venue: a z bonus to composure and communication, same order. Absent: 0. */
  readonly familiarityZ?: readonly [number, number];
  /** D4.3.1 pressure of the moment, 0 to 1. */
  readonly pressure?: number;
  /** 0 huddle to 1 hurry-up: less time to talk (K1.5.1). */
  readonly tempo?: number;
  /** Seconds left on the play clock when the units are set (J5.8.1). */
  readonly playClockLeftS?: number;
  readonly secondHalf?: boolean;
  readonly qbSlot?: number;
  /** A clock or field-goal-range state in which a sack costs more (K1.3.3 rule 1). */
  readonly sackCostsMore?: boolean;
  readonly units?: readonly CommUnit[];
  /**
   * D9 knowledge (0 to 100) of a concept a player holds no item for in `gameDay.knowledge`, per side of the ball:
   * [snapping team, other team]. A roster with no install record (a placeholder team) reads this for every
   * assignment. Absent: full knowledge, so the D9.4.1 knowledge draw is zero.
   */
  readonly knowledgeDefault?: readonly [number, number];
}
