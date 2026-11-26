// The standard situation catalogue (G7.2.2) with the starting template bands (G7.2.1, all Assumptions the
// user can change): short 1 to 3 yards, medium 4 to 6, long 7 to 10, extra long 11 or more; backed up =
// own goal line to own 10, fringe = opponent 40 to 21, high red zone 20 to 11, low red zone 10 to 4, goal
// line 3 and in. Tiers follow the leaf's lists; a row the lists do not name is tiered by its expected snaps
// (tier 1 at 3 or more a game, tier 2 at 0.5 or more). The catalogue is advice: a missing row never blocks.
import { param } from './params.ts';
import { expectedSnaps, type ReferenceTable } from './reference.ts';
import { situationMatches, type Condition, type SituationRule, type SituationState, type SnapKind } from './situations.ts';

export type Tier = 1 | 2 | 3;
export type ClockMode = 'two_minute' | 'four_minute' | null;
/** G5.3.1 install order: 1 = first full practice day (normal downs), 2 = second (third down), 3 = third (red zone, goal line, two-minute). */
export type InstallDay = 1 | 2 | 3;
export type Category = 'script' | 'shots' | 'screens' | 'play_action' | 'movement' | 'clock_plays' | 'vs_pressure' | 'vs_coverage' | 'must_calls' | 'halftime';

export interface CatalogueRow {
  readonly id: string;
  readonly label: string;
  readonly parentId: string | null;
  /** Situation rows carry a rule; category rows (shots, screens) are covered by a box with that category. */
  readonly situation: SituationRule | null;
  readonly category: Category | null;
  readonly clock: ClockMode;
  /** Tier the G7.2.2 lists give; null when the lists do not name the row. */
  readonly listedTier: Tier | null;
  readonly installDay: InstallDay;
}

const sit = (id: string, label: string, ...all: Condition[]): SituationRule => ({ id, label, anyOf: [{ all }] });
const d = (...n: number[]): Condition => ({ on: 'down', in: n });
const dist = (min?: number, max?: number): Condition => ({ on: 'distance', ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) });
const ytg = (min?: number, max?: number): Condition => ({ on: 'yardsToGoal', ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) });
const kind = (...k: SnapKind[]): Condition => ({ on: 'kind', in: k });

type RowSpec = readonly [id: string, label: string, parent: string | null, rule: Condition[] | null, category: Category | null, clock: ClockMode, tier: Tier | null, day: InstallDay];

/** Last play of a half: 5 seconds or less (Assumption: one snap left). Ranges are Assumptions. */
const LAST_PLAY_S = 5;
const SPECS: readonly RowSpec[] = [
  ['openers', 'Openers (script)', null, null, 'script', null, null, 1],
  ['first_10', 'First and 10', null, [d(1), dist(10, 10)], null, null, 1, 1],
  ['first_long', 'First and long (after a penalty or sack)', null, [d(1), dist(11)], null, null, 2, 1],
  ['second_short', 'Second and short', null, [d(2), dist(1, 3)], null, null, 1, 1], // tier 1 by MA-64 (3.4 snaps a game)
  ['second_medium', 'Second and medium', null, [d(2), dist(4, 6)], null, null, 1, 1],
  ['second_long', 'Second and long', null, [d(2), dist(7)], null, null, 1, 1],
  ['third_short', 'Third and short', null, [d(3), dist(1, 3)], null, null, 1, 2],
  ['third_medium', 'Third and medium', null, [d(3), dist(4, 6)], null, null, 1, 2],
  ['third_long', 'Third and long', null, [d(3), dist(7, 10)], null, null, 1, 2],
  ['third_extra_long', 'Third and extra long', 'third_long', [d(3), dist(11)], null, null, 2, 2],
  ['fourth_short', 'Fourth and short', null, [d(4), dist(1, 3)], null, null, 2, 2],
  ['short_yardage', 'Short yardage', null, [d(3, 4), dist(1, 2)], null, null, null, 2],
  ['goal_line', 'Goal line', 'red_zone', [ytg(undefined, 3)], null, null, 2, 3],
  ['red_zone', 'Red zone', null, [ytg(undefined, 20)], null, null, 1, 3],
  ['high_red_zone', 'High red zone', 'red_zone', [ytg(11, 20)], null, null, null, 3],
  ['low_red_zone', 'Low red zone', 'red_zone', [ytg(4, 10)], null, null, null, 3],
  ['red_zone_third', 'Red zone third down', 'red_zone', [d(3), ytg(undefined, 20)], null, null, null, 3],
  ['fringe', 'Fringe', null, [ytg(21, 40)], null, null, 1, 3],
  ['backed_up', 'Backed up', null, [ytg(90)], null, null, 2, 3],
  ['sudden_change', 'Coming out after a turnover (sudden change)', null, [{ on: 'afterEvent', in: ['turnover'] }], null, null, 3, 1],
  ['two_minute', 'Two-minute', null, [{ on: 'halfSecondsLeft', max: 120 }], null, 'two_minute', 1, 3],
  ['four_minute', 'Four-minute (protecting a lead)', null, [{ on: 'gameSecondsLeft', min: 1, max: 240 }, { on: 'scoreDiff', min: 1 }], null, 'four_minute', 2, 3],
  ['last_play_short', 'Last play of a half, short range', 'last_play', [{ on: 'halfSecondsLeft', max: LAST_PLAY_S }, ytg(undefined, 10)], null, 'two_minute', 3, 3],
  ['last_play_middle', 'Last play of a half, middle range', 'last_play', [{ on: 'halfSecondsLeft', max: LAST_PLAY_S }, ytg(11, 40)], null, 'two_minute', 3, 3],
  ['last_play_long', 'Last play of a half, long range', 'last_play', [{ on: 'halfSecondsLeft', max: LAST_PLAY_S }, ytg(41)], null, 'two_minute', 3, 3],
  ['two_point', 'Two-point plays', null, [kind('try')], null, null, 2, 3],
  ['back_on_track', 'Get back on track (after lost yardage)', null, [d(2, 3), { on: 'afterEvent', in: ['sack', 'lost_yardage'] }], null, null, null, 1],
  ['shots', 'Shots (deep throws)', null, null, 'shots', null, null, 1],
  ['screens', 'Screens', null, null, 'screens', null, null, 1],
  ['play_action', 'Play action', null, null, 'play_action', null, null, 1],
  ['movement', 'Movement passes', null, null, 'movement', null, null, 1],
  ['clock_plays', 'Clock plays (spike, fake spike, after the spike)', 'two_minute', null, 'clock_plays', 'two_minute', 3, 3],
  ['vs_pressure', 'Calls against pressure', null, null, 'vs_pressure', null, null, 2],
  ['vs_coverage', "Calls against the opponent's main coverages", null, null, 'vs_coverage', null, null, 1],
  ['must_calls', 'Must-calls for named players', null, null, 'must_calls', null, null, 1],
  ['halftime', 'Halftime adjustments (blank)', null, null, 'halftime', null, null, 3],
];

export const CATALOGUE: readonly CatalogueRow[] = SPECS.map(([id, label, parentId, rule, category, clock, listedTier, installDay]) => ({
  id, label, parentId, situation: rule === null ? null : sit(id, label, ...rule), category, clock, listedTier, installDay,
}));
export const CATALOGUE_BY_ID: ReadonlyMap<string, CatalogueRow> = new Map(CATALOGUE.map((r) => [r.id, r]));

/** Tier of a row: the listed tier, else by expected snaps (G7.2.2 edges), else 3. */
export function tierOf(row: CatalogueRow, table: ReferenceTable | null): Tier {
  if (row.listedTier !== null) return row.listedTier;
  if (row.situation === null || table === null) return 3;
  const e = expectedSnaps(row.situation, table).value;
  return e >= param('catalogue.tier1Snaps') ? 1 : e >= param('catalogue.tier2Snaps') ? 2 : 3;
}

/** One catalogue row as AI preparation reads it (G-74 asked for id, parent, expected snaps, clock). */
export interface CatalogueEntry { readonly id: string; readonly parentId: string | null; readonly expectedSnaps: number | null; readonly clock: ClockMode; readonly tier: Tier; readonly installDay: InstallDay }

export function catalogueEntries(table: ReferenceTable | null): CatalogueEntry[] {
  return CATALOGUE.map((r) => ({
    id: r.id, parentId: r.parentId, clock: r.clock, tier: tierOf(r, table), installDay: r.installDay,
    expectedSnaps: r.situation === null || table === null ? null : expectedSnaps(r.situation, table).value,
  }));
}

/** Every situation row a state falls in (several: third and short in the red zone is in both). */
export function catalogueIdsFor(s: SituationState): string[] {
  return CATALOGUE.filter((r) => r.situation !== null && situationMatches(r.situation, s)).map((r) => r.id);
}

const DOWN_DISTANCE_IDS = ['first_10', 'first_long', 'second_short', 'second_medium', 'second_long', 'third_short', 'third_medium', 'third_long', 'third_extra_long', 'fourth_short'];
/**
 * The down-and-distance row of a state (the bucket a call record is filed under for sheet use). First and
 * goal inside the 10 is "first_other"; fourth and 4 or more is "fourth_other"; tries are "two_point".
 */
export function downDistanceId(s: SituationState): string {
  if (s.kind === 'try') return 'two_point';
  for (const id of DOWN_DISTANCE_IDS) if (situationMatches(CATALOGUE_BY_ID.get(id)!.situation!, s)) return id;
  return s.down === 1 ? 'first_other' : 'fourth_other';
}

/** A box as the catalogue check sees it. */
export interface CatalogueBox { readonly id: string; readonly situationId: string | null; readonly category: Category | null; readonly catalogueRef: string | null }
export type RowStatus = 'has_box' | 'covered' | 'partly' | 'missing';
export interface RowCheck {
  readonly row: CatalogueRow;
  readonly status: RowStatus;
  /** Share of the row's grid states some situation box matches. */
  readonly share: number;
  readonly tier: Tier;
  readonly expectedSnaps: number | null;
  readonly severity: 'warning' | 'note' | 'info' | null;
}

function rowStates(row: CatalogueRow, grid: readonly SituationState[]): SituationState[] {
  // The grid holds scrimmage downs with no prior event; a row about tries or after-events is checked on
  // the same grid with that field set.
  const all = row.situation!.anyOf[0]!.all;
  const k = all.find((c) => c.on === 'kind');
  const e = all.find((c) => c.on === 'afterEvent');
  const base = grid.map((s) => ({ ...s, ...(k?.on === 'kind' ? { kind: k.in[0]! } : {}), ...(e?.on === 'afterEvent' ? { afterEvent: e.in[0]! } : {}) }));
  return base.filter((s) => situationMatches(row.situation!, s));
}

/**
 * G7.2.2 status of every row. A box covers a row when its rule matches at least the cover share (80%) of
 * the row's grid states; the best box below that makes the row partly covered; no matching box, missing.
 * Category rows need a box of that category; `present` names categories met elsewhere (the script meets
 * "script").
 */
export function checkCatalogue(boxes: readonly CatalogueBox[], situations: ReadonlyMap<string, SituationRule>, grid: readonly SituationState[], table: ReferenceTable | null, present: ReadonlySet<Category> = new Set()): RowCheck[] {
  const rules = boxes.map((b) => (b.situationId === null ? undefined : situations.get(b.situationId))).filter((r): r is SituationRule => r !== undefined);
  const out = CATALOGUE.map((row): RowCheck => {
    const tier = tierOf(row, table);
    const exp = row.situation === null || table === null ? null : expectedSnaps(row.situation, table).value;
    let status: RowStatus; let share = 0;
    if (boxes.some((b) => b.catalogueRef === row.id)) { status = 'has_box'; share = 1; }
    else if (row.category !== null) status = boxes.some((b) => b.category === row.category) || present.has(row.category) ? 'has_box' : 'missing';
    else {
      const states = rowStates(row, grid);
      for (const r of rules) {
        const hit = states.filter((s) => situationMatches(r, s)).length;
        share = Math.max(share, states.length === 0 ? 0 : hit / states.length);
      }
      status = share >= param('catalogue.coverShare') ? 'covered' : share > 0 ? 'partly' : 'missing';
    }
    if (status === 'has_box' && row.category !== null) share = 1;
    const open = status === 'missing' || status === 'partly';
    return { row, status, share, tier, expectedSnaps: exp, severity: open ? (tier === 1 ? 'warning' : tier === 2 ? 'note' : 'info') : null };
  });
  return out;
}

/** The review's missing list: missing and partly covered rows, most expected snaps first (unknown last). */
export function missingRows(checks: readonly RowCheck[]): RowCheck[] {
  return checks.filter((c) => c.severity !== null).sort((a, b) => (b.expectedSnaps ?? -1) - (a.expectedSnaps ?? -1) || a.tier - b.tier);
}
