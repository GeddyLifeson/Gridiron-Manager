// Starter playbooks (G3, F14): what a new staff installs before it has built its own book, one for the pro level and
// one for college. A book is a menu per offensive call kind and per coverage family, so a caller that has chosen
// "a dropback pass" or "Cover 3" still has a real mix of concepts under it instead of a single play (the stat gate
// needs the mix: depth of target, completion and interception rows come from the spread of concepts).
//
// What is sourced and what is not:
// - Every play and call in a book is authored content with its own basis rows (full set, WP-25 and follow-ups).
// - Which concepts belong in a pro book and which in a college book rests on the systems research
//   (research/scheme-sources/systems-and-families.md) and is stated in each book's basis rows.
// - The weights inside a menu are design values (Assumption). They follow one rule, G1's intent field: a base
//   play is called most, a complement less, a constraint or shot least. No source gives per-concept call shares,
//   so the calibration targets judge the outcome rows, never these weights.
// Content is data (P1.1.2): no clock, no platform random. Choosing uses a number in [0, 1) the caller supplies.
import type { CoverageFamily, OffensePlayKind } from '@gm/schema';
import type { Basis, DefenseDef, PlayDef } from '../starter/types.ts';
import { FULL_DEFENSE } from './defense.ts';
import { FULL_PLAYS } from './offense.ts';

/** Where a menu entry may be called. `any` is every snap; the others are the J11 situations a chart names. */
export type BookSituation = 'any' | 'goalLine' | 'shortYardage';

export interface BookEntry {
  readonly id: string;
  /** Relative weight inside its menu (Assumption, see the header). */
  readonly weight: number;
  /** The situations it is called in. Default `any`. A goal-line or short-yardage entry is called only there. */
  readonly when?: BookSituation;
}

export interface StarterBook {
  readonly id: 'pro' | 'college';
  readonly name: string;
  /** Menus by offensive call kind. A kind with no menu falls back to the caller's own default. */
  readonly offense: Readonly<Partial<Record<OffensePlayKind, readonly BookEntry[]>>>;
  /** Run calls aimed at the middle (the chart's "middle" direction): draws and traps. */
  readonly runMiddle: readonly BookEntry[];
  /** Menus by coverage family. */
  readonly defense: Readonly<Partial<Record<CoverageFamily, readonly BookEntry[]>>>;
  readonly basis: readonly Basis[];
}

/** G1 intent weights: base 3, complement 2, constraint 1, shot 1, situational 1 (Assumption). */
export const INTENT_WEIGHT: Readonly<Record<PlayDef['intent'], number>> = { base: 3, complement: 2, constraint: 1, shot: 1, situational: 1 };

const PLAY_BY_ID: ReadonlyMap<string, PlayDef> = new Map(FULL_PLAYS.map((p) => [p.id, p]));
const CALL_BY_ID: ReadonlyMap<string, DefenseDef> = new Map(FULL_DEFENSE.map((d) => [d.id, d]));

/** An entry weighted by the play's own intent, unless a weight is given. */
const p = (id: string, when?: BookSituation, weight?: number): BookEntry => {
  const play = PLAY_BY_ID.get(id);
  if (play === undefined) throw new Error(`book: unknown play ${id}`);
  return { id, weight: weight ?? INTENT_WEIGHT[play.intent], ...(when !== undefined ? { when } : {}) };
};
/** A defensive entry: base calls 3, pressures and changeups 1 (Assumption). */
const d = (id: string, weight = 3, when?: BookSituation): BookEntry => {
  if (!CALL_BY_ID.has(id)) throw new Error(`book: unknown call ${id}`);
  return { id, weight, ...(when !== undefined ? { when } : {}) };
};

const WEIGHTS: Basis = { claim: 'Weights inside a menu follow the play intent (base 3, complement 2, constraint or shot 1); no source gives per-concept call shares', status: 'Assumption', sources: [] };
const PRO_ZONE: Basis = { claim: 'Pro book: wide zone is a base run with boot, keeper and play action off the same first steps', status: 'Verified', sources: ['ringer-shanahan', 'sumer-shanahan', 'yahoo-outsidezone'] };
const PRO_GAP: Basis = { claim: 'Pro book: power, counter and wham as complements to the zone runs', status: '1 of 3', sources: ['sumer-shanahan'] };
const COLLEGE_AIR_RAID: Basis = { claim: 'College book: the Air Raid core concepts (mesh, shallow cross, Y-cross, four verticals, stick, screens) are in the pass menus', status: 'Verified', sources: ['qfb-airraid', 'ringer-airraid', 'rivals-airraid'] };
const LEVEL_SHARES: Basis = { claim: 'Which families each level leans on (pro zone and play action, college spread, zone read and RPO) and how heavily: family shares by level are not researched', status: 'Assumption', sources: [] };

// Pressure entries shared by both books. Their weights are set so the game's rusher mix on pass plays lands on the
// measured league mix (facts F-measured-rate-0477 to 0480: five or more rushers on about 29% of pass plays, six or
// more on about 7%, a simulated pressure on about 7.5%); the weights themselves are design values (Assumption).
const PRESSURE_COVER3: readonly BookEntry[] = [d('def_cover3_fire_zone', 5), d('def_cover3_fire_zone_weak', 5), d('def_cover3_fire3_sim', 1), d('def_creeper_field_edge', 2), d('def_creeper_boundary', 1), d('def_sim_mug_cover3', 1), d('def_creeper_safety_insert', 2), d('def_creeper_boundary_safety', 2)];
const PRESSURE_COVER1: readonly BookEntry[] = [d('def_cover1_five_man', 4), d('def_cover1_slot_blitz', 4), d('def_sim_mug_cover1_rat', 2)];

/** Pro starter book: an under-centre and gun book on zone, gap and play action with a full quick and dropback menu. */
export const PRO_BOOK: StarterBook = {
  id: 'pro',
  name: 'Pro starter book',
  offense: {
    run: [p('run_inside_zone_right'), p('run_wide_zone_right'), p('run_duo_right'), p('run_power_right'), p('run_counter_right'), p('run_split_zone_right'),
      p('run_pin_pull_right'), p('run_wham_right'), p('run_dart_right'), p('run_iso_right', 'shortYardage', 3), p('run_goal_line_power', 'goalLine', 3)],
    quick_pass: [p('quick_stick'), p('pass_slant_flat'), p('pass_snag'), p('pass_smash'), p('pass_mesh'), p('quick_spacing', undefined, 2), p('quick_bunch_trail'), p('quick_empty_stick')],
    dropback_pass: [p('dropback_four_verticals', undefined, 2), p('pass_curl_flat'), p('pass_shallow_cross'), p('pass_y_cross', undefined, 2), p('pass_levels'), p('pass_sail'), p('pass_dagger'), p('pass_yankee'), p('pass_post_wheel'), p('pass_mills')],
    play_action: [p('play_action_deep_cross', undefined, 3), p('pa_pop_pass'), p('movement_boot_flood'), p('movement_naked_boot'), p('movement_leak')],
    screen: [p('screen_slow_rb', undefined, 2), p('screen_tunnel'), p('screen_bubble'), p('screen_now')],
    rpo: [p('rpo_zone_bubble', undefined, 2), p('rpo_glance'), p('rpo_stick')],
    movement_pass: [p('movement_boot_flood'), p('movement_naked_boot'), p('movement_leak')],
  },
  runMiddle: [p('draw_rb', undefined, 3), p('run_trap_right', undefined, 1)],
  defense: {
    cover3: [d('def_cover3_sky'), d('def_nickel_cover3'), d('def_cover3_match'), d('def_cover3_cloud', 2), d('def_cover3_sky_flat', 2), d('def_cover3_flip', 1), d('def_34_cover3', 2), ...PRESSURE_COVER3],
    cover1: [d('def_cover1_man_free'), d('def_nickel_cover1'), d('def_cover1_robber', 2), ...PRESSURE_COVER1],
    cover2: [d('def_cover2_zone'), d('def_tampa2', 2), d('def_dime_cover2', 1)],
    cover4: [d('def_cover4_quarters'), d('def_nickel_cover4'), d('def_cover4_palms', 2), d('def_cover4_meg', 1), d('def_cover4_solo', 1)],
    cover6: [d('def_cover6_qqh')],
    two_man: [d('def_two_man_under')],
    cover0: [d('def_cover0_six_man'), d('def_short_yardage_bear', 3, 'shortYardage'), d('def_goal_line_65', 3, 'goalLine')],
  },
  basis: [WEIGHTS, PRO_ZONE, PRO_GAP, LEVEL_SHARES],
};

/** College starter book: gun-first spread with zone read, RPO and the Air Raid core in the pass game. */
export const COLLEGE_BOOK: StarterBook = {
  id: 'college',
  name: 'College starter book',
  offense: {
    run: [p('run_inside_zone_right'), p('run_split_zone_right', undefined, 3), p('run_power_right'), p('run_counter_right'), p('run_duo_right', undefined, 2),
      p('run_wide_zone_right', undefined, 2), p('run_buck_sweep_right', undefined, 1), p('run_trap_right', undefined, 1), p('run_iso_right', 'shortYardage', 3), p('run_goal_line_power', 'goalLine', 3)],
    quick_pass: [p('quick_stick'), p('pass_mesh'), p('pass_snag'), p('quick_spacing'), p('pass_slant_flat'), p('pass_smash'), p('quick_bunch_trail'), p('quick_empty_stick')],
    dropback_pass: [p('dropback_four_verticals', undefined, 3), p('pass_shallow_cross'), p('pass_y_cross', undefined, 3), p('pass_curl_flat'), p('pass_levels', undefined, 1), p('pass_sail'), p('pass_dagger'), p('pass_post_wheel'), p('pass_mills')],
    play_action: [p('play_action_deep_cross', undefined, 3), p('pa_pop_pass'), p('movement_boot_flood'), p('movement_naked_boot')],
    screen: [p('screen_bubble', undefined, 2), p('screen_tunnel', undefined, 2), p('screen_now', undefined, 2), p('screen_slow_rb')],
    rpo: [p('rpo_zone_bubble', undefined, 3), p('rpo_glance', undefined, 2), p('rpo_stick', undefined, 2)],
    movement_pass: [p('movement_boot_flood'), p('movement_naked_boot')],
  },
  runMiddle: [p('draw_rb', undefined, 3), p('run_trap_right', undefined, 1)],
  defense: {
    cover3: [d('def_cover3_sky'), d('def_nickel_cover3'), d('def_cover3_match'), d('def_cover3_cloud', 2), d('def_cover3_sky_flat', 2), d('def_34_cover3', 1), ...PRESSURE_COVER3],
    cover1: [d('def_cover1_man_free'), d('def_nickel_cover1'), d('def_cover1_robber', 1), ...PRESSURE_COVER1],
    cover2: [d('def_cover2_zone'), d('def_tampa2', 1), d('def_dime_cover2', 1)],
    cover4: [d('def_cover4_quarters'), d('def_nickel_cover4'), d('def_cover4_palms', 2), d('def_cover4_meg', 1), d('def_cover4_solo', 2)],
    cover6: [d('def_cover6_qqh')],
    two_man: [d('def_two_man_under')],
    cover0: [d('def_cover0_six_man'), d('def_short_yardage_bear', 3, 'shortYardage'), d('def_goal_line_65', 3, 'goalLine')],
  },
  basis: [WEIGHTS, COLLEGE_AIR_RAID, LEVEL_SHARES],
};

export const STARTER_BOOKS: readonly StarterBook[] = [PRO_BOOK, COLLEGE_BOOK];

/** The starter book by the rule set's level name (a lookup, not a branch: P1.3.3). Unknown levels get the pro book. */
export const STARTER_BOOK_BY_LEVEL: Readonly<Record<string, StarterBook>> = Object.fromEntries(STARTER_BOOKS.map((b) => [b.id, b]));
export function starterBookFor(level: string): StarterBook { return STARTER_BOOK_BY_LEVEL[level] ?? PRO_BOOK; }

/** The entries of a menu that may be called in `situation`: its situational entries there, else the `any` ones. */
export function menuFor(entries: readonly BookEntry[], situation: BookSituation): readonly BookEntry[] {
  if (situation !== 'any') {
    const special = entries.filter((e) => e.when === situation);
    if (special.length > 0) return [...special, ...entries.filter((e) => (e.when ?? 'any') === 'any')];
  }
  return entries.filter((e) => (e.when ?? 'any') === 'any');
}

/** One entry by weight, from a number in [0, 1). Null for an empty menu. */
export function pickEntry(entries: readonly BookEntry[], u: number): BookEntry | null {
  let total = 0;
  for (const e of entries) total += Math.max(0, e.weight);
  if (total <= 0) return null;
  let x = Math.min(Math.max(u, 0), 1 - 1e-12) * total;
  for (const e of entries) { x -= Math.max(0, e.weight); if (x < 0) return e; }
  return entries[entries.length - 1] ?? null;
}

/** The play a book calls for an offensive kind (and run direction) in a situation, or null when it has no menu. */
export function bookPlay(book: StarterBook, kind: OffensePlayKind, runDirection: 'left' | 'middle' | 'right' | null, situation: BookSituation, u: number): PlayDef | null {
  const menu = kind === 'run' && runDirection === 'middle' && situation === 'any' ? book.runMiddle : book.offense[kind];
  if (menu === undefined) return null;
  const e = pickEntry(menuFor(menu, situation), u);
  return e === null ? null : PLAY_BY_ID.get(e.id) ?? null;
}

/** The defensive call a book makes for a coverage family in a situation, or null when it has no menu. */
export function bookCall(book: StarterBook, family: CoverageFamily, situation: BookSituation, u: number): DefenseDef | null {
  const menu = book.defense[family];
  if (menu === undefined) return null;
  const e = pickEntry(menuFor(menu, situation), u);
  return e === null ? null : CALL_BY_ID.get(e.id) ?? null;
}
