// Meetings (H4): the meeting ladder, the agenda and the meeting effect, the team meeting's theme,
// tests, the night-before meeting, and the bulletin-board modifier (H7.2.4) that feeds it.
import { P } from './params.ts';

/** H4.1.1 meeting types with their default leader and attendees. */
export const MEETING_TYPES = [
  { id: 'staff', leader: 'head_coach', attendees: 'all coaches', effect: 'staff alignment, schedule, personnel decisions' },
  { id: 'game_plan', leader: 'coordinator', attendees: "unit's coaches", effect: 'produces the plan and scripts (G6, H3)' },
  { id: 'team', leader: 'head_coach', attendees: 'all players and coaches', effect: 'message, corrections, situational teaching, culture' },
  { id: 'unit', leader: 'coordinator', attendees: 'offense or defense', effect: 'install: concepts and the plan for the unit' },
  { id: 'special_teams', leader: 'st_coordinator', attendees: 'unit members', effect: 'install for each kicking unit' },
  { id: 'position', leader: 'position_coach', attendees: 'position group', effect: 'assignment detail, technique film' },
  { id: 'quarterback', leader: 'play_caller', attendees: 'quarterbacks', effect: 'plan, reads, checks, call-sheet walk-through (H4.5.1)' },
  { id: 'leadership_council', leader: 'head_coach', attendees: 'player leaders', effect: 'two-way feedback (L2)' },
  { id: 'night_before', leader: 'head_coach', attendees: 'team', effect: 'final reminders and message (H4.2.3)' },
] as const;

/** Attention at minute t of continuous meeting time (H4.1.2 rule 3), shortened by season fatigue 0..1 (rule 5). */
export function attention(t: number, seasonFatigue = 0): number {
  const cut = P('meeting_fatigue_shortening') * Math.min(1, Math.max(0, seasonFatigue));
  const flat = P('attention_flat_minutes') * (1 - cut);
  const floorAt = P('attention_floor_minutes') - P('attention_flat_minutes') * cut;
  const floor = P('attention_floor');
  if (t <= flat) return 1;
  if (t >= floorAt) return floor;
  return 1 - ((t - flat) / (floorAt - flat)) * (1 - floor);
}

/** Mean attention over minutes [from, from + minutes) of continuous meeting time. */
export function meanAttention(from: number, minutes: number, seasonFatigue = 0): number {
  if (minutes <= 0) return attention(from, seasonFatigue);
  let s = 0;
  for (let m = 0; m < minutes; m++) s += attention(from + m, seasonFatigue);
  return s / minutes;
}

/** The user's `teach` term for one meeting, built from his agenda choices (H4.1.2 rule 2, E9.1.3). Each check 0..1, judged against engine truth by the caller. */
export function userTeach(checks: { clips: number; order: number; time: number } | 'default_agenda'): number {
  if (checks === 'default_agenda') return P('user_term_constant');
  const lo = P('teach_min'), hi = P('teach_max');
  const score = P('teach_w_clips') * checks.clips + P('teach_w_order') * checks.order + P('teach_w_time') * checks.time;
  return lo + (hi - lo) * score * P('user_term_ceiling');
}

export type AgendaRow =
  | { readonly kind: 'item'; readonly id: string; readonly unit: string; readonly plays: number; readonly minutes: number; readonly newItem: boolean }
  | { readonly kind: 'test'; readonly id: string; readonly minutes: number }
  | { readonly kind: 'break' | 'walkthrough'; readonly minutes: number };

export interface MeetingDay {
  /** Meeting minutes already held today (rule 3 daily total). */
  readonly minutesToday: number;
  /** New items already taught today, per unit (rule 4 daily install limit). */
  readonly newByUnit: Readonly<Record<string, number>>;
}

export interface ItemResult {
  readonly id: string;
  /** Multiplier on the player's gain: teach × method_fit × attention × caps. `base × learn` stay with D9. */
  readonly factor: number;
  readonly exposure: 'meeting' | 'mentioned' | 'test';
}

/**
 * Run a meeting agenda (H4.1.2). Attention resets after a break or a walkthrough; meeting time past the
 * daily total and items past the daily install limit lose gain; under 2 minutes a play is "mentioned".
 */
export function runAgenda(rows: readonly AgendaRow[], teach: number, methodFit: number, day: MeetingDay, seasonFatigue = 0): { items: ItemResult[]; day: MeetingDay } {
  let t = 0;
  let minutesToday = day.minutesToday;
  const newByUnit: Record<string, number> = { ...day.newByUnit };
  const items: ItemResult[] = [];
  for (const r of rows) {
    if (r.kind === 'break' || r.kind === 'walkthrough') { t = 0; continue; }
    let f = teach * methodFit * meanAttention(t, r.minutes, seasonFatigue);
    if (minutesToday >= P('meeting_day_cap_minutes')) f *= P('meeting_day_over_factor');
    if (r.kind === 'test') {
      items.push({ id: r.id, factor: f * P('test_item_fraction'), exposure: 'test' });
    } else if (r.kind === 'item') {
      let exposure: ItemResult['exposure'] = 'meeting';
      if (r.plays > 0 && r.minutes / r.plays < P('meeting_mentioned_minutes_per_play')) { exposure = 'mentioned'; f *= P('meeting_mentioned_factor'); }
      if (r.newItem) {
        const n = (newByUnit[r.unit] ?? 0) + 1;
        newByUnit[r.unit] = n;
        if (n > P('meeting_daily_new_items')) f *= P('meeting_over_cap_factor');
      }
      items.push({ id: r.id, factor: f, exposure });
    }
    t += r.minutes;
    minutesToday += r.minutes;
  }
  return { items, day: { minutesToday, newByUnit } };
}

/** Room method fit: the average of attendees' fits (H4.4.1), each in the 0.85 to 1.15 range given by D-side data. */
export function roomFit(fits: readonly number[]): number {
  return fits.length === 0 ? 1 : fits.reduce((s, x) => s + x, 0) / fits.length;
}

/**
 * The team meeting's theme (H4.2.1 rule 1): a small relative boost to the related discipline check,
 * only with supporting practice time, halved after more than the configured weeks running.
 */
export function themeEffect(theme: string, previousThemes: readonly string[], practiceSupport: boolean): number {
  if (!practiceSupport) return 0;
  let run = 0;
  for (let i = previousThemes.length - 1; i >= 0 && previousThemes[i] === theme; i--) run++;
  const e = P('theme_effect');
  return run + 1 > P('theme_repeat_weeks') ? e * P('theme_repeat_factor') : e;
}

export const TONES = ['calm', 'urgent', 'confident', 'challenging'] as const;
export type Tone = (typeof TONES)[number];
export type TeamState = 'complacent_favourite' | 'tense_big_game' | 'neutral';

/** Night-before meeting (H4.2.3): tone against team state, capped, gone by halftime. `inTransit` halves it (H8.4.1 rule 2). */
export function nightBeforeEffect(tone: Tone, state: TeamState, inTransit = false): number {
  const fit = (state === 'complacent_favourite' && tone === 'challenging') || (state === 'tense_big_game' && tone === 'calm');
  const mismatch = (state === 'complacent_favourite' && tone === 'calm') || (state === 'tense_big_game' && (tone === 'challenging' || tone === 'urgent'));
  const e = fit ? P('night_before_cap') : mismatch ? P('night_before_mismatch') : 0;
  return inTransit ? e * P('meeting_in_transit_factor') : e;
}

/**
 * Bulletin-board material (H7.2.4): plus on the opponent's team-meeting effect for that game, none after
 * the configured uses in a season. `usesThisSeason` counts earlier uses against that team.
 */
export function bulletinBoardModifier(usesThisSeason: number): number {
  return usesThisSeason >= P('bulletin_board_uses') ? 0 : P('bulletin_board_effect');
}
