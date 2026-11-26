// The perceived world of one player (contract `PerceivedView`, J3.1.1). A view holds only what the
// player has perceived: copies, delayed and filtered. It keeps no reference to the world, the true
// arrays or any other player's state, so nothing true is reachable from it (Q1.4.1).
import { BALL_STATES, SLOT_COUNT, type BallStateKind, type PerceivedEntity, type PerceivedView, type PlayRead, type Slot } from '@gm/schema';

export interface MutableEntity { slot: number; px: number; py: number; velPx: number; velPy: number; staleTicks: number }
export const BALL_ENTITY = SLOT_COUNT;
export const ENTITY_COUNT = SLOT_COUNT + 1;
export const UNKNOWN_BALL = 255;
const SIDES = ['none', 'left', 'right'] as const;
export const READS: readonly PlayRead[] = ['unknown', 'run', 'pass', 'screen', 'draw'];

export class PlayerView implements PerceivedView {
  readonly selfSlot: Slot;
  tSinceSnapS = 0;
  readonly self = { px: 0, py: 0, velPx: 0, velPy: 0, headingRad: 0 };
  /** Index 0 to 21 are players; index 22 is the ball. */
  readonly entities: MutableEntity[] = [];
  readonly valid = new Uint8Array(ENTITY_COUNT);
  ballKindCode = UNKNOWN_BALL;
  readonly read: { read: PlayRead; side: 'left' | 'right' | 'none'; confidence: number } = { read: 'unknown', side: 'none', confidence: 0 };
  carrier = -1;
  readonly heardCalls: string[] = [];
  readonly receiverNumbers = new Uint8Array(SLOT_COUNT);

  constructor(selfSlot: Slot) {
    this.selfSlot = selfSlot;
    for (let e = 0; e < ENTITY_COUNT; e++) this.entities.push({ slot: e === BALL_ENTITY ? -1 : e, px: 0, py: 0, velPx: 0, velPy: 0, staleTicks: 0 });
  }

  entity(slot: Slot): PerceivedEntity | null {
    return slot >= 0 && slot < SLOT_COUNT && this.valid[slot] === 1 ? this.entities[slot]! : null;
  }
  ball(): PerceivedEntity | null { return this.valid[BALL_ENTITY] === 1 ? this.entities[BALL_ENTITY]! : null; }
  ballKind(): BallStateKind | 'unknown' { return this.ballKindCode === UNKNOWN_BALL ? 'unknown' : BALL_STATES[this.ballKindCode]!; }
  playRead(): { readonly read: PlayRead; readonly side: 'left' | 'right' | 'none'; readonly confidence: number } { return this.read; }
  believedCarrierSlot(): Slot | -1 { return this.carrier; }
  heard(call: string): boolean { return this.heardCalls.includes(call); }
  receiverNumber(slot: Slot): number { return slot >= 0 && slot < SLOT_COUNT ? this.receiverNumbers[slot]! : 0; }

  setSide(sign: number): void { this.read.side = SIDES[sign > 0 ? 1 : sign < 0 ? 2 : 0]!; }
}
