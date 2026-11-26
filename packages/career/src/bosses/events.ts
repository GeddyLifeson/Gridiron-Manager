// Outputs of the bosses module. This module decides nothing about firing (E4 owns it) and stores no
// relationship value of its own: it emits memories for the L1 record (people.memory, G-24 ties), promises
// for the L1.3.1 ledger, and events for E4, L6 and the room. Every event names the interest or rule behind
// it (L5.1.3, L5.2.6 debug-record acceptance).

/** A memory to write on a person's record of another (L1.1.2). Strength is signed. */
export interface BossMemory {
  readonly type: 'memory';
  readonly holderPersonId: number;
  /** null when the subject is the user-coach (the user's side is never stored, G-24). */
  readonly aboutPersonId: number | null;
  readonly kind: string;
  readonly strength: number;
  readonly day: number;
  readonly because: string;
}

/** A promise for the L1.3.1 ledger, with the test E4 or the ledger runs on it. */
export interface BossPromise {
  readonly type: 'promise';
  readonly toPersonId: number;
  readonly kind: 'timeline' | 'staff_change' | 'starter' | 'condition' | 'contract_ask' | 'contract_outcome';
  readonly text: string;
  readonly day: number;
  /** Season in which a timeline promise is machine-tested by E4 expectation (L5.1.2). */
  readonly testSeason: number | null;
}

/** An event read by E4 (confidence), L6 (media), the room (L2) or the hot-seat feed. */
export interface BossSignal {
  readonly type: 'signal';
  readonly to: 'e4' | 'media' | 'room' | 'hot_seat';
  readonly kind: string;
  readonly day: number;
  readonly because: string;
}

export type BossEvent = BossMemory | BossPromise | BossSignal;

export const memory = (holderPersonId: number, aboutPersonId: number | null, kind: string, strength: number, day: number, because: string): BossMemory =>
  ({ type: 'memory', holderPersonId, aboutPersonId, kind, strength, day, because });

export const signal = (to: BossSignal['to'], kind: string, day: number, because: string): BossSignal => ({ type: 'signal', to, kind, day, because });

/**
 * The L1.1.1 record as this module reads it: the boss's side toward the coach, 0 to 100. Supplied by the
 * relationship layer (G-24 ties plus the L1 record); this module never writes it directly.
 */
export interface BossRecord {
  readonly trust: number;
  readonly respect: number;
  readonly familiarity: number;
}
