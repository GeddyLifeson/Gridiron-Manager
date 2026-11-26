// Starting templates (G7.1.2, G7.7.1, G7.7.2, O3.4.2): layouts and situations a user can take and go
// straight to filling. Every template is an Assumption until a coaching source confirms the layout. The
// offense default side split follows the one real sheet the bible read (Steelers Depot 2023, 1 of 3): open
// field on the front; two-minute, fringe, red area, goal line and two-point on the back.
import { CATALOGUE_BY_ID, type Category } from './catalogue.ts';
import { param } from './params.ts';
import { emptySheet, withReadingOrder, type Box, type Sheet } from './sheet.ts';
import { focusBox, situationMatches, type Condition, type SituationRule, type SituationState, type SnapKind } from './situations.ts';

interface BoxSpec {
  readonly id: string;
  readonly title: string;
  readonly priority: number;
  readonly situation: SituationRule | null;
  readonly category: Category | null;
  readonly catalogueRef: string | null;
}

/** Place boxes left to right, top to bottom, in cells of w x h on one side. */
function pack(specs: readonly BoxSpec[], side: 0 | 1, w: number, h: number, cols: number, rows: number): Box[] {
  const perRow = Math.floor(cols / w);
  const max = perRow * Math.floor(rows / h);
  if (specs.length > max) throw new Error(`template: ${specs.length} boxes do not fit ${max} cells`);
  return specs.map((s, i) => ({
    id: s.id, title: s.title, situationId: s.situation?.id ?? null, priority: s.priority, order: 0, side,
    col: (i % perRow) * w, row: Math.floor(i / perRow) * h, w, h, category: s.category, catalogueRef: s.catalogueRef,
    colour: 'none', columns: ['call', 'personnel', 'readiness'], entries: [],
  }));
}

function fromCatalogue(id: string, priority: number): BoxSpec {
  const r = CATALOGUE_BY_ID.get(id)!;
  return { id, title: r.label, priority, situation: r.situation, category: r.category, catalogueRef: id };
}

function assemble(unit: Sheet['unit'], front: readonly BoxSpec[], back: readonly BoxSpec[], frontCell: [number, number], backCell: [number, number]): Sheet {
  const cols = param('layout.cols'), rows = param('layout.rows');
  const boxes = withReadingOrder([...pack(front, 0, frontCell[0], frontCell[1], cols, rows), ...pack(back, 1, backCell[0], backCell[1], cols, rows)]);
  const situations = [...front, ...back].map((s) => s.situation).filter((s): s is SituationRule => s !== null);
  return { ...emptySheet(unit, ''), situations, boxes };
}

/** Offense by down and distance, with the default side split (G7.1.2). Priorities: clock boxes above zones above downs (G7.2.1 edge case). */
export function offenseTemplate(): Sheet {
  const front: BoxSpec[] = [
    fromCatalogue('first_10', 10), fromCatalogue('first_long', 10), fromCatalogue('second_short', 10), fromCatalogue('second_medium', 10),
    fromCatalogue('second_long', 10), fromCatalogue('third_short', 7), fromCatalogue('third_medium', 7), fromCatalogue('third_long', 7),
    fromCatalogue('third_extra_long', 7), fromCatalogue('fourth_short', 7), fromCatalogue('back_on_track', 9), fromCatalogue('shots', 99),
    fromCatalogue('screens', 99), fromCatalogue('play_action', 99), fromCatalogue('movement', 99), fromCatalogue('vs_pressure', 99),
  ];
  const back: BoxSpec[] = [
    fromCatalogue('two_minute', 1), fromCatalogue('clock_plays', 99), fromCatalogue('four_minute', 1), fromCatalogue('fringe', 8),
    fromCatalogue('high_red_zone', 5), fromCatalogue('low_red_zone', 5), fromCatalogue('red_zone_third', 4), fromCatalogue('goal_line', 3),
    fromCatalogue('two_point', 1), fromCatalogue('backed_up', 6), fromCatalogue('sudden_change', 2), fromCatalogue('short_yardage', 6),
    fromCatalogue('last_play_short', 0), fromCatalogue('last_play_middle', 0), fromCatalogue('last_play_long', 0), fromCatalogue('red_zone', 5),
    fromCatalogue('vs_coverage', 99), fromCatalogue('must_calls', 99), fromCatalogue('halftime', 99),
  ];
  return assemble('offense', front, back, [6, 4], [4, 4]);
}

const rule = (id: string, title: string, ...all: Condition[]): SituationRule => ({ id, label: title, anyOf: [{ all }] });
const spec = (id: string, title: string, priority: number, ...all: Condition[]): BoxSpec => ({ id, title, priority, situation: rule(id, title, ...all), category: null, catalogueRef: null });
const note = (id: string, title: string): BoxSpec => ({ id, title, priority: 99, situation: null, category: null, catalogueRef: null });

/** Offensive personnel groups the defensive template opens with (the user adds the opponent's others). */
export const DEFENSE_TEMPLATE_PERSONNEL = ['11', '12', '21'] as const;

/**
 * Defense (G7.7.1): calls by offensive personnel on first and second down, a third-down menu split by
 * distance (1 to 3, 4 to 6, 7 to 9, 10 or more), red zone, goal line, two-minute, four-minute, backed-up
 * offense, sudden change, last play (prevent), tempo, best formations, the week's matchup rules and checks.
 */
export function defenseTemplate(personnel: readonly string[] = DEFENSE_TEMPLATE_PERSONNEL): Sheet {
  const front: BoxSpec[] = [
    ...personnel.map((p) => spec(`vs_${p}`, `Against ${p} personnel`, 10, { on: 'personnel', in: [p] }, { on: 'down', in: [1, 2] })),
    spec('d_third_1_3', 'Third and 1 to 3', 7, { on: 'down', in: [3, 4] }, { on: 'distance', max: 3 }),
    spec('d_third_4_6', 'Third and 4 to 6', 7, { on: 'down', in: [3, 4] }, { on: 'distance', min: 4, max: 6 }),
    spec('d_third_7_9', 'Third and 7 to 9', 7, { on: 'down', in: [3, 4] }, { on: 'distance', min: 7, max: 9 }),
    spec('d_third_10', 'Third and 10 or more', 7, { on: 'down', in: [3, 4] }, { on: 'distance', min: 10 }),
    spec('d_tempo', 'Tempo calls', 2, { on: 'tempo', in: ['no_huddle', 'hurry_up'] }, { on: 'halfSecondsLeft', min: 121 }),
    note('d_best_formations', 'Against their best formations'),
    note('d_matchups', 'Matchup rules this week'),
    note('d_checks', 'Checks this week'),
  ];
  const back: BoxSpec[] = [
    spec('d_red_zone', 'Red zone', 5, { on: 'yardsToGoal', min: 4, max: 20 }),
    spec('d_goal_line', 'Goal line', 3, { on: 'yardsToGoal', max: 3 }),
    spec('d_two_minute', 'Two-minute', 1, { on: 'halfSecondsLeft', max: 120 }),
    spec('d_four_minute', 'Four-minute (they protect a lead)', 1, { on: 'gameSecondsLeft', min: 1, max: 240 }, { on: 'scoreDiff', max: -1 }),
    spec('d_backed_up', 'Backed-up offense', 6, { on: 'yardsToGoal', min: 90 }),
    spec('d_sudden_change', 'Sudden change', 2, { on: 'afterEvent', in: ['turnover'] }),
    spec('d_last_play', 'Last play against a long throw', 0, { on: 'halfSecondsLeft', max: 5 }, { on: 'yardsToGoal', min: 30 }),
    spec('d_two_point', 'Two-point defense', 1, { on: 'kind', in: ['try'] }),
  ];
  return assemble('defense', front, back, [6, 4], [6, 4]);
}

/** Template sizes for the special teams sheet (G7.7.2, Assumptions). */
export const ST_SIZES: Readonly<Record<string, number>> = {
  kickoff: 3, kickoff_return: 3, punt: 3, punt_return: 3, field_goal: 2, field_goal_block: 2, onside: 2, hands_team: 1,
};
export const KICKING_KINDS: readonly SnapKind[] = ['kickoff', 'kickoff_return', 'punt', 'punt_return', 'field_goal', 'field_goal_block', 'onside', 'hands_team'];

/** Special teams (G7.7.2): one box per kicking unit, tries with field goals, fakes and an alerts list. */
export function specialTeamsTemplate(): Sheet {
  const titles: Record<string, string> = {
    kickoff: 'Kickoff', kickoff_return: 'Kickoff return', punt: 'Punt', punt_return: 'Punt return or rush',
    field_goal: 'Field goal and try', field_goal_block: 'Field goal block', onside: 'Onside', hands_team: 'Hands team',
  };
  const front: BoxSpec[] = KICKING_KINDS.map((k) => spec(`st_${k}`, titles[k]!, 5, { on: 'kind', in: k === 'field_goal' ? ['field_goal', 'try'] : [k] }));
  front.push(note('st_fakes', 'Fakes (each with its required look)'), note('st_alerts', 'Alerts'));
  return assemble('special_teams', front, [], [6, 4], [6, 4]);
}

/** G7.7.2 acceptance: every kicking situation I4 can raise has a focused box, or is listed missing. */
export function missingKickingBoxes(sheet: Sheet): SnapKind[] {
  const sits = new Map(sheet.situations.map((s) => [s.id, s]));
  return KICKING_KINDS.filter((k) => focusBox(sheet.boxes, sits, { ...KICK_STATE, kind: k }) === null);
}
const KICK_STATE: SituationState = {
  kind: 'kickoff', down: 0, distanceYd: 0, yardsToGoalYd: 65, halfSecondsLeft: 900, gameSecondsLeft: 2700, scoreDiff: 0, timeoutsOwn: 3,
  tempo: 'huddle', personnel: 'kick', formationFamily: null, hash: 'middle', afterEvent: 'none',
};

/** Offensive personnel groups a defensive sheet names in its rules. */
export function sheetPersonnel(sheet: Pick<Sheet, 'situations'>): string[] {
  const set = new Set<string>();
  for (const s of sheet.situations) for (const r of s.anyOf) for (const c of r.all) if (c.on === 'personnel') c.in.forEach((p) => set.add(p));
  return [...set];
}

/**
 * Defensive focus (G7.7.1): by the offense's personnel and the situation. A personnel group the sheet does
 * not name falls to the nearest group by the week's matching table (G2.2.1), which the caller supplies.
 */
export function defenseFocus(sheet: Sheet, s: SituationState, nearest: (personnel: string, onSheet: readonly string[]) => string | null): Box | null {
  const sits = new Map(sheet.situations.map((x) => [x.id, x]));
  const groups = sheetPersonnel(sheet);
  const named = groups.includes(s.personnel);
  const p = named || groups.length === 0 ? s.personnel : nearest(s.personnel, groups) ?? s.personnel;
  return focusBox(sheet.boxes, sits, { ...s, personnel: p });
}

/** Whether a situation rule matches a state (re-exported for console code that holds only a template). */
export const matches = situationMatches;
