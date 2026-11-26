// Situation rules (G7.2.1): the condition vocabulary over game state, "and" inside a rule, "or" across a
// box's rules, first match by priority takes focus (I2.2.2), and the checks the editor runs over a grid of
// states (unmatched states, shadowed boxes) plus the O3.4.2 coverage map. Nothing here names a level: band
// edges are the user's, and states carry seconds left so no period length is read here.

export type Hash = 'left' | 'middle' | 'right';
export type Tempo = 'huddle' | 'no_huddle' | 'hurry_up';
/** What kind of snap the state is: a scrimmage down, a try, or a kicking play (for the special teams sheet). */
export type SnapKind = 'scrimmage' | 'try' | 'kickoff' | 'kickoff_return' | 'punt' | 'punt_return' | 'field_goal' | 'field_goal_block' | 'onside' | 'hands_team';
/** The play before this one for the same team (sudden change, get back on track). */
export type AfterEvent = 'none' | 'turnover' | 'sack' | 'lost_yardage' | 'penalty' | 'first_play';

/** The game state the condition vocabulary reads (J11), seen from the sheet's own team. */
export interface SituationState {
  readonly kind: SnapKind;
  readonly down: number;
  readonly distanceYd: number;
  readonly yardsToGoalYd: number;
  /** Seconds left in the current half (overtime counts as its own half). */
  readonly halfSecondsLeft: number;
  /** Seconds left in regulation, 0 in overtime. */
  readonly gameSecondsLeft: number;
  readonly scoreDiff: number;
  readonly timeoutsOwn: number;
  readonly tempo: Tempo;
  /** Own personnel for offense; the offense's personnel faced for defense (G7.7.1). */
  readonly personnel: string;
  readonly formationFamily: string | null;
  readonly hash: Hash;
  readonly afterEvent: AfterEvent;
}

interface Range { readonly min?: number; readonly max?: number }
export type Condition =
  | { readonly on: 'kind'; readonly in: readonly SnapKind[] }
  | { readonly on: 'down'; readonly in: readonly number[] }
  | ({ readonly on: 'distance' } & Range)
  | ({ readonly on: 'yardsToGoal' } & Range)
  | ({ readonly on: 'halfSecondsLeft' } & Range)
  | ({ readonly on: 'gameSecondsLeft' } & Range)
  | ({ readonly on: 'scoreDiff' } & Range)
  | ({ readonly on: 'timeouts' } & Range)
  | { readonly on: 'tempo'; readonly in: readonly Tempo[] }
  | { readonly on: 'personnel'; readonly in: readonly string[] }
  | { readonly on: 'formationFamily'; readonly in: readonly string[] }
  | { readonly on: 'hash'; readonly in: readonly Hash[] }
  | { readonly on: 'afterEvent'; readonly in: readonly AfterEvent[] };
export type ConditionField = Condition['on'];

/** Conditions joined by "and". An empty rule matches every scrimmage down. */
export interface Rule { readonly all: readonly Condition[] }
/** A situation: rules joined by "or" (G7.2.1). */
export interface SituationRule { readonly id: string; readonly label: string; readonly anyOf: readonly Rule[] }

function inRange(v: number, c: Range): boolean {
  return (c.min === undefined || v >= c.min) && (c.max === undefined || v <= c.max);
}

/** Whether one condition holds. `ignore` lists fields a reference table cannot see (they pass). */
export function conditionHolds(c: Condition, s: SituationState): boolean {
  switch (c.on) {
    case 'kind': return c.in.includes(s.kind);
    case 'down': return c.in.includes(s.down);
    case 'distance': return inRange(s.distanceYd, c);
    case 'yardsToGoal': return inRange(s.yardsToGoalYd, c);
    case 'halfSecondsLeft': return inRange(s.halfSecondsLeft, c);
    case 'gameSecondsLeft': return inRange(s.gameSecondsLeft, c);
    case 'scoreDiff': return inRange(s.scoreDiff, c);
    case 'timeouts': return inRange(s.timeoutsOwn, c);
    case 'tempo': return c.in.includes(s.tempo);
    case 'personnel': return c.in.includes(s.personnel);
    case 'formationFamily': return s.formationFamily !== null && c.in.includes(s.formationFamily);
    case 'hash': return c.in.includes(s.hash);
    case 'afterEvent': return c.in.includes(s.afterEvent);
  }
}

/** A rule with no `kind` condition applies to scrimmage downs only, so kicking plays never focus an offense box. */
export function ruleMatches(r: Rule, s: SituationState, ignore: ReadonlySet<ConditionField> = NONE): boolean {
  if (!r.all.some((c) => c.on === 'kind') && s.kind !== 'scrimmage') return false;
  return r.all.every((c) => ignore.has(c.on) || conditionHolds(c, s));
}
const NONE: ReadonlySet<ConditionField> = new Set();

export function situationMatches(sit: SituationRule, s: SituationState, ignore: ReadonlySet<ConditionField> = NONE): boolean {
  return sit.anyOf.some((r) => ruleMatches(r, s, ignore));
}

/** Fields named anywhere in a situation's rules. */
export function fieldsOf(sit: SituationRule): Set<ConditionField> {
  return new Set(sit.anyOf.flatMap((r) => r.all.map((c) => c.on)));
}

/** A box as focus sees it: an id, its situation (null for category boxes such as shots), priority, reading order. */
export interface FocusBox { readonly id: string; readonly situationId: string | null; readonly priority: number; readonly order: number }

/** Boxes in check order: priority ascending (1 first), then reading order. */
export function checkOrder<B extends FocusBox>(boxes: readonly B[]): B[] {
  return [...boxes].sort((a, b) => a.priority - b.priority || a.order - b.order);
}

/** I2.2.2 focus: the first box in check order whose situation matches; null when none does. */
export function focusBox<B extends FocusBox>(boxes: readonly B[], situations: ReadonlyMap<string, SituationRule>, s: SituationState): B | null {
  for (const b of checkOrder(boxes)) {
    const sit = b.situationId === null ? undefined : situations.get(b.situationId);
    if (sit && situationMatches(sit, s)) return b;
  }
  return null;
}

/** A neutral state to build from: first and 10 at midfield, early, tied, huddle, middle of the field. */
export const NEUTRAL_STATE: SituationState = {
  kind: 'scrimmage', down: 1, distanceYd: 10, yardsToGoalYd: 50, halfSecondsLeft: 1500, gameSecondsLeft: 3300,
  scoreDiff: 0, timeoutsOwn: 3, tempo: 'huddle', personnel: '11', formationFamily: null, hash: 'middle', afterEvent: 'none',
};

const GRID_DISTANCES = [1, 2, 3, 4, 5, 6, 7, 9, 10, 13] as const;
const GRID_YARDS = [1, 2, 3, 4, 5, 7, 9, 10, 12, 15, 18, 20, 22, 25, 30, 35, 40, 45, 50, 60, 70, 80, 88, 92, 97] as const;
/** Clock and score contexts: normal, two-minute first half, last play of the game trailing, four-minute leading, trailing big. */
const GRID_CONTEXTS: readonly Pick<SituationState, 'halfSecondsLeft' | 'gameSecondsLeft' | 'scoreDiff' | 'tempo' | 'timeoutsOwn'>[] = [
  { halfSecondsLeft: 1200, gameSecondsLeft: 3000, scoreDiff: 0, tempo: 'huddle', timeoutsOwn: 3 },
  { halfSecondsLeft: 90, gameSecondsLeft: 1890, scoreDiff: 0, tempo: 'hurry_up', timeoutsOwn: 2 },
  { halfSecondsLeft: 4, gameSecondsLeft: 4, scoreDiff: -4, tempo: 'hurry_up', timeoutsOwn: 0 },
  { halfSecondsLeft: 220, gameSecondsLeft: 220, scoreDiff: 6, tempo: 'huddle', timeoutsOwn: 3 },
  { halfSecondsLeft: 700, gameSecondsLeft: 700, scoreDiff: -14, tempo: 'no_huddle', timeoutsOwn: 3 },
];

/**
 * The G7.2.1 check grid: 4 downs x 10 distances x 25 yard lines x 5 clock and score contexts = 5,000
 * states for each personnel group (distance is never more than the yards to the goal: goal to go).
 */
export function situationGrid(personnel: readonly string[] = ['11']): SituationState[] {
  const out: SituationState[] = [];
  for (const p of personnel) for (const ctx of GRID_CONTEXTS) for (let down = 1; down <= 4; down++) {
    for (const d of GRID_DISTANCES) for (const y of GRID_YARDS) {
      out.push({ ...NEUTRAL_STATE, ...ctx, personnel: p, down, distanceYd: Math.min(d, y), yardsToGoalYd: y });
    }
  }
  return out;
}

export interface ShadowedState { readonly state: SituationState; readonly winner: string; readonly shadowed: string }
export interface RuleCheck {
  /** States no situation box matches. */
  readonly unmatched: SituationState[];
  /** States where a narrower, lower-priority box also matches: the user probably wanted it. */
  readonly shadowed: ShadowedState[];
  /** For each box, the grid states it would take focus on. */
  readonly focusCount: ReadonlyMap<string, number>;
}

/** G7.2.1 editor check over a grid. "Narrower" = the box's rules match fewer grid states on their own. */
export function checkRules<B extends FocusBox>(boxes: readonly B[], situations: ReadonlyMap<string, SituationRule>, grid: readonly SituationState[]): RuleCheck {
  const ordered = checkOrder(boxes).filter((b) => b.situationId !== null && situations.has(b.situationId));
  const breadth = new Map(ordered.map((b) => [b.id, grid.filter((s) => situationMatches(situations.get(b.situationId!)!, s)).length] as const));
  const unmatched: SituationState[] = [];
  const shadowed: ShadowedState[] = [];
  const focusCount = new Map<string, number>(ordered.map((b) => [b.id, 0]));
  for (const s of grid) {
    const hits = ordered.filter((b) => situationMatches(situations.get(b.situationId!)!, s));
    if (hits.length === 0) { unmatched.push(s); continue; }
    const w = hits[0]!;
    focusCount.set(w.id, focusCount.get(w.id)! + 1);
    const narrower = hits.slice(1).find((b) => breadth.get(b.id)! < breadth.get(w.id)!);
    if (narrower) shadowed.push({ state: s, winner: w.id, shadowed: narrower.id });
  }
  return { unmatched, shadowed, focusCount };
}

/** O3.4.2 coverage map axes: 6 distance buckets and 5 field zones (representative state in each cell). */
export const MAP_DISTANCES: readonly { readonly label: string; readonly yd: number }[] = [
  { label: '1', yd: 1 }, { label: '2-3', yd: 2 }, { label: '4-6', yd: 5 }, { label: '7-10', yd: 8 }, { label: '11-15', yd: 13 }, { label: '16+', yd: 18 },
];
export const MAP_ZONES: readonly { readonly label: string; readonly yardsToGoal: number }[] = [
  { label: 'backed up', yardsToGoal: 95 }, { label: 'open field', yardsToGoal: 60 }, { label: 'fringe', yardsToGoal: 30 },
  { label: 'red zone', yardsToGoal: 12 }, { label: 'goal line', yardsToGoal: 2 },
];
export interface MapCell { readonly down: number; readonly distance: string; readonly zone: string; readonly boxId: string | null }

/** The coverage map: every cell of 4 downs x 6 distance buckets x 5 zones classified to a box or to none. */
export function coverageMap<B extends FocusBox>(boxes: readonly B[], situations: ReadonlyMap<string, SituationRule>, base: SituationState = NEUTRAL_STATE): MapCell[] {
  const out: MapCell[] = [];
  for (let down = 1; down <= 4; down++) for (const d of MAP_DISTANCES) for (const z of MAP_ZONES) {
    const s: SituationState = { ...base, down, distanceYd: Math.min(d.yd, z.yardsToGoal), yardsToGoalYd: z.yardsToGoal };
    out.push({ down, distance: d.label, zone: z.label, boxId: focusBox(boxes, situations, s)?.id ?? null });
  }
  return out;
}
