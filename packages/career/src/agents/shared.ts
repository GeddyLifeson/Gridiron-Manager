// Shapes this module hands to the memory, promise and relationship systems (X6, L1.3.1, G-24). They are
// plain writes: the owning module applies them. Nothing here keeps a pooled trust or reputation number.

/** One memory row to write: holder remembers something about `aboutId` (L1.1.2). */
export interface MemoryWrite {
  readonly holderId: number;
  readonly aboutId: number;
  readonly delta: number;
  /** Half-life of the row in weeks, or null for the memory module's default turnover. */
  readonly halfLifeWeeks: number | null;
  /** 1 first-hand, 0.5 a witness copy (L1.1.2), other shares where a leaf says so. */
  readonly strength: number;
  readonly cause: string;
}

/** One promise to open in the L1.3.1 ledger. `strength` is how hard a break lands on the promiser. */
export interface PromiseEntry {
  readonly promiserId: number;
  readonly holderId: number;
  readonly about: 'role' | 'pass_to_gm' | 'coach_word' | 'money';
  readonly statedRole: string | null;
  /** Week index by which it must happen, or null for no date. */
  readonly byWeek: number | null;
  readonly strength: number;
  /** Kept on the spot (a promise to pass a request upward, L7.2.4). */
  readonly keptAtOnce: boolean;
  /** True when the promiser does not hold the budget that would fund it (L7.3.3). */
  readonly unfunded: boolean;
  readonly cause: string;
}

export const mem = (holderId: number, aboutId: number, delta: number, cause: string, strength = 1, halfLifeWeeks: number | null = null): MemoryWrite =>
  ({ holderId, aboutId, delta, halfLifeWeeks, strength, cause });
