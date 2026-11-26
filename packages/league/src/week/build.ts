// Building a week from its template (H1.1.1, H1.2.1, H1.3.1 to H1.3.4, H1.5.1). The week runs from the
// final whistle of one game to the final whistle of the next; days are numbered by distance to the game.
import TPL from './data/templates.json' with { type: 'json' };
import { addMinutes, parseTime, weekday, type Instant } from '../calendar/date.ts';
import type { RuleLookup } from '../calendar/types.ts';
import { countsHours } from './keys.ts';
import { P } from './params.ts';
import type { AttendeeGroup, Block, BlockType, Contact, Day, Equipment, LeaderRole, SessionType, Week, WeekShape } from './types.ts';

/** One block row of a template day kind. `at` is local time "HH:MM". */
export interface TemplateBlock {
  readonly type: BlockType;
  readonly at: string;
  readonly min: number;
  readonly who: readonly AttendeeGroup[];
  readonly lead: LeaderRole;
  readonly mand?: boolean;
  readonly equip?: Equipment;
  readonly contact?: Contact;
  readonly session?: SessionType;
  readonly countable?: boolean;
  readonly note?: string;
}

export interface TemplateSet {
  readonly leaf: string;
  readonly pregameMealParam: string;
  readonly sequences: {
    readonly normal: readonly string[];
    readonly short: readonly string[];
    readonly bye_lead: readonly string[];
    readonly after_bye: readonly string[];
    readonly extra: string;
    readonly drop_order: readonly string[];
  };
  readonly kinds: Readonly<Record<string, readonly TemplateBlock[]>>;
}

/** Saved templates per shape (H1.4.1 rule 2): a team's own set, or the shipped default. */
export const DEFAULT_SETS: Readonly<Record<string, TemplateSet>> = TPL.sets as unknown as Record<string, TemplateSet>;

/** The shipped default for the active rule set: the countable-hours set when the rule set counts hours. */
export function defaultSet(rules: RuleLookup): TemplateSet {
  const id = countsHours(rules) ? 'college_default' : 'pro_default';
  const s = DEFAULT_SETS[id];
  if (!s) throw new Error(`no template set ${id}`);
  return s;
}

export interface WeekInput {
  readonly teamId: number;
  readonly weekId: string;
  /** Day of the previous game; null for the first week of a season. */
  readonly previousGameDay: number | null;
  readonly kickoff: Instant;
  readonly home: boolean;
  /** The team has no game in this league week (the schedule's bye, C2). */
  readonly bye: boolean;
  readonly playoff: boolean;
  readonly set: TemplateSet;
  /** Countable-hours regime: the game block is countable (H1.5.2 game-day charge). */
  readonly countable: boolean;
}

/** Days between the previous game and this one, not counting either (H1.1.1 rule 1). */
export function prepDays(previousGameDay: number | null, kickoffDay: number): number {
  if (previousGameDay === null) return P('normal_prep_days');
  return kickoffDay - previousGameDay - 1;
}

/** The week's shape (H1.1.1 outputs; edge case: fewer than 4 days is short). */
export function weekShape(prep: number, bye: boolean, playoff: boolean): WeekShape {
  if (bye) return 'bye';
  if (playoff) return 'playoff';
  if (prep <= P('short_max_prep_days')) return 'short';
  if (prep > P('normal_prep_days')) return 'long';
  return 'normal';
}

/** The day-kind sequence for G-prep to G-1, front to back. */
export function kindSequence(set: TemplateSet, prep: number, shape: WeekShape): string[] {
  const seq = set.sequences;
  const normalLen = seq.normal.length;
  const fit = (base: readonly string[]): string[] => {
    const out = [...base];
    for (const k of seq.drop_order) {
      if (out.length <= prep) break;
      const i = out.indexOf(k);
      if (i >= 0) out.splice(i, 1);
    }
    while (out.length > prep) out.shift();
    return out;
  };
  if (prep <= P('short_max_prep_days')) return seq.short.slice(Math.max(0, seq.short.length - prep));
  if (shape === 'bye' && prep > normalLen) {
    const leadLen = prep - normalLen;
    const lead = seq.bye_lead;
    let head: string[];
    if (leadLen >= lead.length) head = [...Array<string>(leadLen - lead.length).fill(seq.extra), ...lead];
    else head = leadLen <= 0 ? [] : [lead[0]!, ...lead.slice(lead.length - (leadLen - 1))].slice(0, leadLen);
    return [...head, ...seq.after_bye];
  }
  if (prep > normalLen) return [...Array<string>(prep - normalLen).fill(seq.extra), ...seq.normal];
  return fit(seq.normal);
}

function blockFrom(t: TemplateBlock, day: number, id: string, kind: string): Block {
  const mandatory = t.mand ?? !(t.type === 'player_free' || t.type === 'meal');
  return {
    id, type: t.type, start: { day, minute: parseTime(t.at) }, minutes: t.min, attendees: t.who, leader: t.lead,
    location: t.type === 'class_academic' ? 'campus' : 'facility', contentRef: null, mandatory, kind,
    ...(t.equip ? { equipment: t.equip } : {}), ...(t.contact ? { contact: t.contact } : {}),
    ...(t.session ? { session: t.session } : {}), ...(t.countable ? { countable: true } : {}),
  };
}

/** Game-day blocks: pregame meal, the game, the post-game news conference (H8.6.1 rule 2, H7.1.1). */
export function gameDayBlocks(input: WeekInput): Block[] {
  const k = input.kickoff;
  const mph = P('minutes_per_hour');
  const mealAt = addMinutes(k, -Math.round(P(input.set.pregameMealParam) * mph));
  const gameMin = P('game_block_minutes');
  const end = addMinutes(k, gameMin);
  const id = (n: string) => `${input.weekId}:0:${n}`;
  const loc = input.home ? 'stadium' : 'away_stadium';
  return [
    { id: id('meal'), type: 'meal', start: mealAt, minutes: P('pregame_meal_minutes'), attendees: ['team'], leader: 'none', location: input.home ? 'facility' : 'hotel', contentRef: null, mandatory: true, kind: 'game' },
    { id: id('game'), type: 'game', start: k, minutes: gameMin, attendees: ['team', 'staff', 'head_coach'], leader: 'head_coach', location: loc, contentRef: null, mandatory: true, kind: 'game', ...(input.countable ? { countable: true } : {}) },
    { id: id('post'), type: 'media', start: addMinutes(end, P('postgame_gap_minutes')), minutes: P('media_postgame_minutes'), attendees: ['head_coach'], leader: 'head_coach', location: loc, contentRef: null, mandatory: true, session: 'post_game', kind: 'game' },
  ];
}

/** Build the Week record from the template for the input's shape (H1.1.1 outputs). */
export function buildWeek(input: WeekInput): Week {
  const prep = prepDays(input.previousGameDay, input.kickoff.day);
  const shape = weekShape(prep, input.bye, input.playoff);
  const kinds = kindSequence(input.set, prep, shape);
  const firstDay = input.kickoff.day - kinds.length;
  const days: Day[] = kinds.map((kind, i) => {
    const day = firstDay + i;
    const gMinus = kinds.length - i;
    const rows = input.set.kinds[kind];
    if (!rows) throw new Error(`template has no day kind ${kind}`);
    const blocks = rows.map((t, j) => {
      let b = blockFrom(t, day, `${input.weekId}:${gMinus}:${j}`, kind);
      // The day-after session exists only after a game; in a season's first week it is a mid-week session.
      if (b.session === 'day_after' && input.previousGameDay === null) b = { ...b, session: 'mid_week' };
      return b;
    });
    return { day, gMinus, kind, blocks: sortBlocks(blocks) };
  });
  days.push({ day: input.kickoff.day, gMinus: 0, kind: 'game', blocks: sortBlocks(gameDayBlocks(input)) });
  return {
    teamId: input.teamId, weekId: input.weekId, shape,
    previousGameDay: input.previousGameDay,
    previousGameWeekday: input.previousGameDay === null ? null : weekday(input.previousGameDay),
    kickoff: input.kickoff, home: input.home, days, completed: [],
  };
}

export function sortBlocks(blocks: readonly Block[]): Block[] {
  return [...blocks].sort((a, b) => a.start.day - b.start.day || a.start.minute - b.start.minute || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Every block of the week in start order. */
export function allBlocks(week: Week): Block[] { return sortBlocks(week.days.flatMap((d) => d.blocks)); }

/** Replace the week's blocks, regrouping them by day. Days with no blocks stay (a day off is still a day). */
export function withBlocks(week: Week, blocks: readonly Block[]): Week {
  const days = week.days.map((d) => ({ ...d, blocks: sortBlocks(blocks.filter((b) => b.start.day === d.day)) }));
  return { ...week, days };
}

/**
 * A game moved by the league (H1.1.1 edge case): rebuild from the template for the new shape and keep
 * every block already completed. New blocks that would clash with a kept block are dropped.
 */
export function rebuildWeek(old: Week, input: WeekInput, clashFree: (a: Block, b: Block) => boolean): Week {
  const fresh = buildWeek(input);
  const kept = allBlocks(old).filter((b) => old.completed.includes(b.id));
  const extraDays = kept.filter((b) => !fresh.days.some((d) => d.day === b.start.day)).map((b) => b.start.day);
  const days: Day[] = [...fresh.days, ...[...new Set(extraDays)].map((day) => ({ day, gMinus: input.kickoff.day - day, kind: 'kept', blocks: [] as Block[] }))]
    .sort((a, b) => a.day - b.day);
  const blocks = [...kept, ...allBlocks(fresh).filter((b) => kept.every((k) => clashFree(k, b)))];
  return withBlocks({ ...fresh, days, completed: old.completed }, blocks);
}
