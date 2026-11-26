// The call sheet as the console reads it (O2.2.1, O2.2.2, I2.2.2, I3.2.2, O2.2.4). The sheet designer (G-68,
// bible G7) writes sheets; until it lands this is the shape the console consumes, and G-68 fills it. The console
// adds key hints and readiness marks and nothing else: it never sorts, ranks, greys out or recommends entries.
import type { DefenseCall, KickCall, OffenseCall, ReturnCall } from '@gm/schema';

export type Unit = 'offense' | 'defense' | 'special';
/** Staff readiness estimate against config thresholds (G5.4.1). Never true knowledge. */
export type Readiness = 'ready' | 'shaky' | 'not_installed';
export type Relay = 'radio' | 'wristband' | 'signals' | 'messenger';
export type TagKind = 'flip' | 'motion' | 'protection' | 'route';

/** A call object minus the players: the console adds whoever the depth chart sends (decision.ts). */
export type CallTemplate =
  | Omit<OffenseCall, 'players'> | Omit<DefenseCall, 'players'> | Omit<KickCall, 'players'> | Omit<ReturnCall, 'players'>;

/** A named, pre-validated substitution inside a play (I2.3.2, G1). Tags in one group conflict. */
export interface TagDef {
  readonly id: string;
  readonly kind: TagKind;
  readonly label: string;
  readonly group: string;
  /** Spoken seconds the tag adds to the call (G4), in tenths. */
  readonly spokenTenths: number;
  readonly installed: boolean;
}

export interface SheetEntry {
  readonly id: string;
  /** The call as the coach says it, rendered by the terminology system (G-67) when the sheet is saved. */
  readonly label: string;
  readonly call: CallTemplate;
  /** Spoken length of the call by the playbook's language (G4.3.1), in tenths. */
  readonly spokenTenths: number;
  readonly readiness: Readiness;
  readonly tags: readonly TagDef[];
  /** Relays this call has installed: a wristband cell, a signal (I2.4.1). Radio and messenger always work. */
  readonly onBand: boolean;
  readonly signal: boolean;
  /** A player the call needs is out; the name is who would run it (I2.3.1, I6). */
  readonly replacement: string | null;
}

/** A situation rule (I2.2.2). Every present field must match; absent fields match anything. */
export interface BoxRule {
  readonly downs?: readonly number[];
  readonly distMin?: number;
  readonly distMax?: number;
  /** Yards from the ball to the goal line being attacked. */
  readonly toGoalMin?: number;
  readonly toGoalMax?: number;
  readonly twoMinute?: boolean;
  readonly lastPlayOfHalf?: boolean;
  /** Own score minus theirs. */
  readonly scoreMin?: number;
  readonly scoreMax?: number;
  /** Offensive personnel groups shown (defensive sheets, I3.2.2). */
  readonly personnel?: readonly string[];
  readonly suddenChange?: boolean;
  readonly noHuddle?: boolean;
}

export interface SheetBox {
  readonly id: string;
  readonly title: string;
  readonly row: number;
  readonly col: number;
  /** Situation rule; null for a base box. */
  readonly rule: BoxRule | null;
  /** The down a base box serves (I2.2.2 fallback). */
  readonly baseDown?: number;
  /** Rule priority: lower is checked first. Defaults to grid order. */
  readonly priority?: number;
  readonly entries: readonly SheetEntry[];
}

export interface CallSheet {
  readonly id: string;
  readonly unit: Unit;
  readonly boxes: readonly SheetBox[];
}

/** What the focus rules read: the dead-ball record as the caller sees it (I2.2.1). */
export interface SheetSituation {
  readonly down: number | null;
  readonly distance: number | null;
  readonly toGoal: number;
  readonly twoMinute: boolean;
  readonly lastPlayOfHalf: boolean;
  readonly scoreDiff: number;
  /** Offensive personnel once identified (I3.1.1 stage 1); null before. */
  readonly personnel: string | null;
  readonly suddenChange: boolean;
  readonly noHuddle: boolean;
}

export interface SheetKeys {
  /** Box id to its letter code(s): `KeyA` or two codes for overflow boxes (O2.2.2). */
  readonly box: Readonly<Record<string, readonly string[]>>;
  /** Entry id to its key code inside its box: `Digit1`..`Digit0`, then letters. */
  readonly entry: Readonly<Record<string, string>>;
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => `Key${l}`);
const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d) => `Digit${d}`);

/** Grid order: left to right, top to bottom (O2.2.2). */
export function gridOrder(boxes: readonly SheetBox[]): SheetBox[] {
  return [...boxes].sort((a, b) => a.row - b.row || a.col - b.col);
}

/**
 * Key hints (O2.2.2): box letters by grid position skipping keys the console reserves, two-letter codes for
 * overflow; entry keys 1 to 9, 0, then free letters. Computed once per sheet so the drill and the game agree.
 */
export function assignKeys(sheet: CallSheet, reserved: readonly string[]): SheetKeys {
  const free = LETTERS.filter((k) => !reserved.includes(k));
  const box: Record<string, readonly string[]> = {};
  const entry: Record<string, string> = {};
  const order = gridOrder(sheet.boxes);
  const singles = order.length <= free.length ? free.length : free.length - 1;
  order.forEach((b, i) => {
    if (i < singles) box[b.id] = [free[i]!];
    else { const j = i - singles; box[b.id] = [free[free.length - 1]!, free[j % free.length]!]; }
    const entryKeys = [...DIGITS, ...free];
    b.entries.forEach((e, k) => { if (k < entryKeys.length) entry[e.id] = entryKeys[k]!; });
  });
  return { box, entry };
}

function matches(r: BoxRule, s: SheetSituation): boolean {
  if (r.downs && (s.down === null || !r.downs.includes(s.down))) return false;
  if (r.distMin !== undefined && (s.distance === null || s.distance < r.distMin)) return false;
  if (r.distMax !== undefined && (s.distance === null || s.distance > r.distMax)) return false;
  if (r.toGoalMin !== undefined && s.toGoal < r.toGoalMin) return false;
  if (r.toGoalMax !== undefined && s.toGoal > r.toGoalMax) return false;
  if (r.twoMinute !== undefined && r.twoMinute !== s.twoMinute) return false;
  if (r.lastPlayOfHalf !== undefined && r.lastPlayOfHalf !== s.lastPlayOfHalf) return false;
  if (r.scoreMin !== undefined && s.scoreDiff < r.scoreMin) return false;
  if (r.scoreMax !== undefined && s.scoreDiff > r.scoreMax) return false;
  if (r.personnel && (s.personnel === null || !r.personnel.includes(s.personnel))) return false;
  if (r.suddenChange !== undefined && r.suddenChange !== s.suddenChange) return false;
  if (r.noHuddle !== undefined && r.noHuddle !== s.noHuddle) return false;
  return true;
}

export interface Focus {
  readonly boxId: string | null;
  /** 'rule' first match, 'base' base box for the down, 'none' the sheet has no box for this (I2.2.2). */
  readonly how: 'rule' | 'base' | 'none';
  /** The matching box has no entries: a preparation failure the user should feel. */
  readonly empty: boolean;
}

/** Automatic jump (I2.2.2, I3.2.2): rules in the user's priority order, first match wins, base box fallback. */
export function focusBox(sheet: CallSheet, s: SheetSituation): Focus {
  const order = gridOrder(sheet.boxes);
  const ruled = order.map((b, i) => ({ b, p: b.priority ?? i })).filter((x) => x.b.rule !== null).sort((x, y) => x.p - y.p);
  for (const { b } of ruled) if (matches(b.rule!, s)) return { boxId: b.id, how: 'rule', empty: b.entries.length === 0 };
  const base = order.find((b) => b.rule === null && (b.baseDown === undefined || b.baseDown === s.down)) ?? order.find((b) => b.rule === null);
  if (base) return { boxId: base.id, how: 'base', empty: base.entries.length === 0 };
  return { boxId: null, how: 'none', empty: true };
}
